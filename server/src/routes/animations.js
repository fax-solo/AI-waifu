import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data/animations');
const FACIAL_DIR = path.join(DATA_DIR, 'facial');
const BODY_DIR = path.join(DATA_DIR, 'body');

[FACIAL_DIR, BODY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const router = Router();

const ALLOWED_EXTENSIONS = ['.json', '.vrma'];

function isAllowed(file) {
  const ext = path.extname(file).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

function getVrmaDuration(fullPath) {
  try {
    const buf = fs.readFileSync(fullPath);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // Parse GLB header
    const version = dv.getUint32(4, true);
    const totalLen = dv.getUint32(8, true);
    let cursor = 12;
    let jsonStr = null;
    let binStart = 0;
    while (cursor < totalLen) {
      const chunkLen = dv.getUint32(cursor, true); cursor += 4;
      const chunkType = dv.getUint32(cursor, true); cursor += 4;
      if (chunkType === 0x4E4F534A) { // JSON
        jsonStr = new TextDecoder().decode(new Uint8Array(buf.buffer, buf.byteOffset + cursor, chunkLen));
      } else if (chunkType === 0x004E4942) { // BIN\0
        binStart = buf.byteOffset + cursor;
      }
      cursor += chunkLen;
    }
    if (!jsonStr) return 0;
    const gltf = JSON.parse(jsonStr);
    const anim = gltf.animations?.[0];
    if (!anim?.samplers?.length) return 0;
    const sampler = anim.samplers[0];
    const inputAccessor = gltf.accessors?.[sampler.input];
    if (!inputAccessor) return 0;
    const bufView = gltf.bufferViews?.[inputAccessor.bufferView];
    if (!bufView) return 0;
    const count = inputAccessor.count;
    const byteOffset = (bufView.byteOffset || 0) + (inputAccessor.byteOffset || 0);
    const lastFloatOffset = byteOffset + (count - 1) * 4;
    const timeBuf = new DataView(buf.buffer, binStart + lastFloatOffset, 4);
    return timeBuf.getFloat32(0, true);
  } catch { return 0; }
}

function listAnimationFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => isAllowed(f))
      .map(f => {
        const fullPath = path.join(dir, f);
        const ext = path.extname(f).toLowerCase();
        const isVrma = ext === '.vrma';
        try {
          if (isVrma) {
            return {
              filename: f,
              name: f.replace('.vrma', ''),
              type: 'body',
              format: 'vrma',
              duration: getVrmaDuration(fullPath),
              loop: false,
              blendSpeed: 8,
            };
          }
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const meta = JSON.parse(raw);
          return {
            filename: f,
            name: meta.name || f.replace('.json', ''),
            type: meta.type || 'unknown',
            format: 'json',
            duration: meta.duration || 1,
            loop: !!meta.loop,
            blendSpeed: meta.blendSpeed || 8,
          };
        } catch {
          return { filename: f, name: f.replace(ext, ''), type: 'unknown', format: 'json', duration: 1, loop: false, error: 'parse failed' };
        }
      });
  } catch {
    return [];
  }
}

// Multer config for animation uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.params.type;
    const dir = type === 'facial' ? FACIAL_DIR : BODY_DIR;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) && file.fieldname === 'animation') {
      cb(null, true);
    } else {
      cb(new Error('Only .json and .vrma files are allowed'), false);
    }
  }
});

router.get('/', (req, res) => {
  const facial = listAnimationFiles(FACIAL_DIR);
  const body = listAnimationFiles(BODY_DIR);
  res.json({ facial, body });
});

router.post('/upload/:type', upload.single('animation'), (req, res) => {
  const { type } = req.params;
  if (!['facial', 'body'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "facial" or "body"' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const ext = path.extname(req.file.originalname).toLowerCase();
  const format = ext === '.vrma' ? 'vrma' : 'json';
  
  let duration = 1;
  if (format === 'vrma') {
    duration = getVrmaDuration(req.file.path);
  } else {
    try {
      const raw = fs.readFileSync(req.file.path, 'utf-8');
      const meta = JSON.parse(raw);
      if (meta.duration) duration = meta.duration;
    } catch (e) {
      console.error('Error parsing JSON animation duration:', e);
    }
  }

  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    type,
    format,
    duration,
    size: req.file.size,
  });
});

router.get('/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  if (!['facial', 'body'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "facial" or "body"' });
  }
  const dir = type === 'facial' ? FACIAL_DIR : BODY_DIR;
  const filePath = path.join(dir, path.basename(filename));
  if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Animation not found' });
  }
  try {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.vrma') {
      const buffer = fs.readFileSync(filePath);
      res.set('Content-Type', 'model/gltf-binary');
      res.send(buffer);
    } else {
      const raw = fs.readFileSync(filePath, 'utf-8');
      res.json(JSON.parse(raw));
    }
  } catch {
    res.status(500).json({ error: 'Failed to read animation file' });
  }
});

router.delete('/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  if (!['facial', 'body'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "facial" or "body"' });
  }
  const dir = type === 'facial' ? FACIAL_DIR : BODY_DIR;
  const filePath = path.join(dir, path.basename(filename));
  if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Animation not found' });
  }
  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete animation file' });
  }
});

export default router;
