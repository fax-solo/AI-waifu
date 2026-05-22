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

const ALLOWED_EXTENSIONS = ['.json', '.bvh'];

function isAllowed(file) {
  const ext = path.extname(file).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

function getBvhDuration(fullPath) {
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const framesMatch = content.match(/Frames:\s*(\d+)/i);
    const frameTimeMatch = content.match(/Frame\s+Time:\s*([\d.]+)/i);
    if (framesMatch && frameTimeMatch) {
      const frames = parseInt(framesMatch[1], 10);
      const frameTime = parseFloat(frameTimeMatch[1]);
      return frames * frameTime;
    }
  } catch (e) {
    console.error('Error reading BVH duration:', e);
  }
  return 0;
}

function listAnimationFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => isAllowed(f))
      .map(f => {
        const fullPath = path.join(dir, f);
        const ext = path.extname(f).toLowerCase();
        const isBvh = ext === '.bvh';
        try {
          if (isBvh) {
            return {
              filename: f,
              name: f.replace('.bvh', ''),
              type: 'body',
              format: 'bvh',
              duration: getBvhDuration(fullPath),
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
          return { filename: f, name: f.replace(ext, ''), type: isBvh ? 'body' : 'unknown', format: isBvh ? 'bvh' : 'json', duration: 1, loop: false, error: 'parse failed' };
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
      cb(new Error('Only .json and .bvh files are allowed'), false);
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
  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    type,
    format: path.extname(req.file.originalname).toLowerCase() === '.bvh' ? 'bvh' : 'json',
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
    const raw = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.bvh') {
      res.set('Content-Type', 'text/plain');
      res.send(raw);
    } else {
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
