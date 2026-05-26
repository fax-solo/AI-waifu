import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Storage path - matching DB_PATH logic in database.js
const isElectron = !!process.versions.electron;
const appDataPath = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.local', 'share'));
const APP_NAME = 'WaifuAI';

const UPLOADS_BASE = isElectron
  ? path.join(appDataPath, APP_NAME, 'uploads')
  : path.join(__dirname, '..', '..', 'data', 'uploads');

const AVATARS_DIR = path.join(UPLOADS_BASE, 'avatars');
const PFPS_DIR = path.join(UPLOADS_BASE, 'pfps');

// Ensure directories exist
[UPLOADS_BASE, AVATARS_DIR, PFPS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const TEXTURE_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga'];

function isTextureFile(filename) {
  return TEXTURE_IMAGE_EXTS.includes(path.extname(filename).toLowerCase());
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'vrm' || file.fieldname === 'model') cb(null, AVATARS_DIR);
    else if (file.fieldname === 'pfp') cb(null, PFPS_DIR);
    else cb(null, AVATARS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit (textures can be large)
});

// ─── Helpers ──────────────────────────────────────────────────────────

function findGalleryPfp(galleryDir, baseName) {
  const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  if (!fs.existsSync(galleryDir)) return null;

  const scanDir = (dir, prefix) => {
    const entries = fs.readdirSync(dir);
    for (const f of entries) {
      const fullPath = path.join(dir, f);
      if (fs.statSync(fullPath).isDirectory()) continue;
      const low = f.toLowerCase();
      if (path.parse(f).name === baseName && exts.some(e => low.endsWith(e))) {
        return `${prefix}${f}`;
      }
    }
    return null;
  };

  // Scan top-level first
  const top = scanDir(galleryDir, '/gallery/');
  if (top) return top;

  // Then scan subdirectories
  const entries = fs.readdirSync(galleryDir);
  for (const entry of entries) {
    const subPath = path.join(galleryDir, entry);
    if (fs.statSync(subPath).isDirectory()) {
      const result = scanDir(subPath, `/gallery/${entry}/`);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Discover all gallery models (flat files + subdirectory-based).
 * Returns an array of { filePath, name, isSubdir, subdirName }.
 */
function discoverGalleryModels(galleryDir) {
  const models = [];
  if (!fs.existsSync(galleryDir)) return models;

  const entries = fs.readdirSync(galleryDir);
  for (const entry of entries) {
    const entryPath = path.join(galleryDir, entry);

    if (fs.statSync(entryPath).isDirectory()) {
      // Scan subdirectory for .vrm/.glb files
      const subEntries = fs.readdirSync(entryPath);
      for (const sub of subEntries) {
        const low = sub.toLowerCase();
        if (low.endsWith('.vrm') || low.endsWith('.glb')) {
          models.push({
            filePath: `${entry}/${sub}`,
            name: path.parse(sub).name,
            isSubdir: true,
            subdirName: entry,
          });
        }
      }
    } else {
      const low = entry.toLowerCase();
      if (low.endsWith('.vrm') || low.endsWith('.glb')) {
        models.push({
          filePath: entry,
          name: path.parse(entry).name,
          isSubdir: false,
          subdirName: null,
        });
      }
    }
  }

  return models;
}

function resolveGalleryDir() {
  return path.resolve(__dirname, '..', '..', 'data', 'gallery');
}

// ─── Endpoints ──────────────────────────────────────────────────────

// List all saved avatars
router.get('/', (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    const avatars = db.prepare('SELECT * FROM vrm_models WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    res.json(avatars);
  } catch (error) {
    console.error('Error fetching avatars:', error);
    res.status(500).json({ error: 'Failed to fetch avatar library' });
  }
});

// Upload a new avatar (personal library)
router.post('/upload', upload.fields([
  { name: 'vrm', maxCount: 1 },
  { name: 'pfp', maxCount: 1 },
  { name: 'textures' }
]), (req, res) => {
  const userId = req.headers['x-user-id'];
  const { name } = req.body;
  const vrmFile = req.files['vrm'] ? req.files['vrm'][0] : null;
  const pfpFile = req.files['pfp'] ? req.files['pfp'][0] : null;
  const textureFiles = req.files['textures'] || [];

  if (!vrmFile || !name) {
    return res.status(400).json({ error: 'Name and VRM file are required' });
  }

  try {
    const id = uuidv4();

    let file_path;
    let pfp_path = pfpFile ? `/uploads/pfps/${pfpFile.filename}` : null;

    if (textureFiles.length > 0) {
      // Create subdirectory for this avatar
      const avatarDir = path.join(AVATARS_DIR, id);
      fs.mkdirSync(avatarDir, { recursive: true });

      const modelExt = path.extname(vrmFile.originalname);
      const modelName = `model${modelExt}`;
      const srcPath = path.join(AVATARS_DIR, vrmFile.filename);
      const destModelPath = path.join(avatarDir, modelName);
      fs.renameSync(srcPath, destModelPath);

      // Save textures
      const texturesDir = path.join(avatarDir, 'textures');
      fs.mkdirSync(texturesDir, { recursive: true });
      for (const tex of textureFiles) {
        const texSrc = path.join(AVATARS_DIR, tex.filename);
        const texName = tex.originalname;
        const texDest = path.join(texturesDir, texName);
        try {
          fs.renameSync(texSrc, texDest);
        } catch (e) {
          console.warn(`[Upload] Failed to move texture ${tex.originalname}:`, e.message);
          // Fallback: delete orphan
          if (fs.existsSync(texSrc)) fs.unlinkSync(texSrc);
        }
      }

      file_path = `/uploads/avatars/${id}/${modelName}`;
    } else {
      // Flat file (backward compatible)
      file_path = `/uploads/avatars/${vrmFile.filename}`;
    }

    db.prepare(`
      INSERT INTO vrm_models (id, user_id, name, file_path, pfp_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, name, file_path, pfp_path);

    const avatarData = { id, user_id: userId, name, file_path, pfp_path };
    res.status(201).json(avatarData);
  } catch (error) {
    console.error('Error saving avatar metadata:', error);
    res.status(500).json({ error: 'Failed to save avatar' });
  }
});

// Delete an avatar
router.delete('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const avatar = db.prepare('SELECT * FROM vrm_models WHERE id = ? AND user_id = ?').get(id, userId);
    if (!avatar) return res.status(404).json({ error: 'Avatar not found' });

    // Delete files
    const filePath = path.join(UPLOADS_BASE, '..', avatar.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      // If it was in a subdirectory, try to clean up the subdir + textures
      const parsed = path.parse(filePath);
      const avatarDir = parsed.dir;
      const texturesDir = path.join(avatarDir, 'textures');
      if (fs.existsSync(texturesDir)) {
        fs.rmSync(texturesDir, { recursive: true, force: true });
      }
      // Remove avatar subdir if empty (and not the root avatars dir)
      if (avatarDir !== AVATARS_DIR && fs.existsSync(avatarDir)) {
        try {
          const remaining = fs.readdirSync(avatarDir);
          if (remaining.length === 0) fs.rmdirSync(avatarDir);
        } catch {}
      }
    }

    const pfpPath = avatar.pfp_path ? path.join(UPLOADS_BASE, '..', avatar.pfp_path) : null;
    if (pfpPath && fs.existsSync(pfpPath)) fs.unlinkSync(pfpPath);

    db.prepare('DELETE FROM vrm_models WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting avatar:', error);
    res.status(500).json({ error: 'Failed to delete avatar' });
  }
});

// ─── Gallery Endpoints ──────────────────────────────────────────────

// Upload a new model + textures to the gallery
router.post('/gallery/upload', upload.fields([
  { name: 'model', maxCount: 1 },
  { name: 'pfp', maxCount: 1 },
  { name: 'textures' }
]), (req, res) => {
  const { name } = req.body;
  const modelFile = req.files['model'] ? req.files['model'][0] : null;
  const pfpFile = req.files['pfp'] ? req.files['pfp'][0] : null;
  const textureFiles = req.files['textures'] || [];

  if (!modelFile || !name) {
    return res.status(400).json({ error: 'Name and model file are required' });
  }

  try {
    const GALLERY_DIR = resolveGalleryDir();
    if (!fs.existsSync(GALLERY_DIR)) {
      fs.mkdirSync(GALLERY_DIR, { recursive: true });
    }

    // Sanitize name for directory name
    const dirName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || `model-${uuidv4().slice(0, 8)}`;
    const modelDir = path.join(GALLERY_DIR, dirName);

    if (fs.existsSync(modelDir)) {
      return res.status(409).json({ error: `A model named "${dirName}" already exists in the gallery` });
    }

    fs.mkdirSync(modelDir, { recursive: true });

    // Move model file
    const modelExt = path.extname(modelFile.originalname);
    const modelName = `${dirName}${modelExt}`;
    const srcModelPath = path.join(AVATARS_DIR, modelFile.filename);
    const destModelPath = path.join(modelDir, modelName);
    fs.renameSync(srcModelPath, destModelPath);

    // Move textures
    if (textureFiles.length > 0) {
      const texturesDir = path.join(modelDir, 'textures');
      fs.mkdirSync(texturesDir, { recursive: true });
      for (const tex of textureFiles) {
        const texSrc = path.join(AVATARS_DIR, tex.filename);
        const texDest = path.join(texturesDir, tex.originalname);
        try {
          fs.renameSync(texSrc, texDest);
        } catch (e) {
          console.warn(`[GalleryUpload] Failed to move texture ${tex.originalname}:`, e.message);
          if (fs.existsSync(texSrc)) fs.unlinkSync(texSrc);
        }
      }
    }

    // Move PFP
    let pfp_path = null;
    if (pfpFile) {
      const pfpExt = path.extname(pfpFile.originalname);
      const destPfp = path.join(modelDir, `${dirName}${pfpExt}`);
      const srcPfp = path.join(PFPS_DIR, pfpFile.filename);
      fs.renameSync(srcPfp, destPfp);
      pfp_path = `/gallery/${dirName}/${dirName}${pfpExt}`;
    }

    const file_path = `${dirName}/${modelName}`;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO gallery_vrm_models (id, name, file_path, pfp_path, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, file_path, pfp_path, '');

    const galleryModel = { id, name, file_path, pfp_path, description: '' };
    console.log(`[Gallery] Uploaded model: ${name} → ${file_path}`);
    res.status(201).json(galleryModel);
  } catch (error) {
    console.error('Error uploading to gallery:', error);
    res.status(500).json({ error: 'Failed to upload to gallery' });
  }
});

// List gallery models (auto-discovers new files in gallery directory)
router.get('/gallery', (req, res) => {
  try {
    const GALLERY_DIR = resolveGalleryDir();
    if (fs.existsSync(GALLERY_DIR)) {
      const models = discoverGalleryModels(GALLERY_DIR);
      const currentPaths = new Set(models.map(m => m.filePath));

      // Remove stale DB entries whose file is no longer on disk
      const allDb = db.prepare('SELECT id, file_path FROM gallery_vrm_models').all();
      for (const entry of allDb) {
        if (!currentPaths.has(entry.file_path)) {
          db.prepare('DELETE FROM gallery_vrm_models WHERE id = ?').run(entry.id);
          console.log(`[Gallery] Removed stale entry: ${entry.file_path}`);
        }
      }

      // Sync new/changed files
      for (const m of models) {
        const existing = db.prepare('SELECT id, pfp_path, file_path, name FROM gallery_vrm_models WHERE file_path = ?').get(m.filePath);
        if (!existing) {
          const id = uuidv4();
          const pfp_path = findGalleryPfp(GALLERY_DIR, m.name);
          db.prepare(`
            INSERT INTO gallery_vrm_models (id, name, file_path, pfp_path, description)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, m.name, m.filePath, pfp_path, '');
          console.log(`[Gallery] Auto-discovered: ${m.name} → ${m.filePath}`);
        } else {
          // Update name if file was renamed (use the directory name for subdir models)
          if (existing.name !== m.name) {
            db.prepare('UPDATE gallery_vrm_models SET name = ? WHERE id = ?').run(m.name, existing.id);
            console.log(`[Gallery] Renamed: ${existing.name} -> ${m.name}`);
          }
          // Verify pfp
          const currentPfp = findGalleryPfp(GALLERY_DIR, m.name);
          if (currentPfp !== existing.pfp_path) {
            db.prepare('UPDATE gallery_vrm_models SET pfp_path = ? WHERE id = ?').run(currentPfp, existing.id);
            if (currentPfp) console.log(`[Gallery] Updated pfp for: ${m.name}`);
          }
        }
      }
    }

    const galleryModels = db.prepare('SELECT * FROM gallery_vrm_models ORDER BY name ASC').all();
    res.json(galleryModels);
  } catch (error) {
    console.error('Error fetching gallery models:', error);
    res.status(500).json({ error: 'Failed to fetch gallery models' });
  }
});

// Download a gallery model to the user's library
router.post('/gallery/:id/download', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const galleryModel = db.prepare('SELECT * FROM gallery_vrm_models WHERE id = ?').get(id);
    if (!galleryModel) return res.status(404).json({ error: 'Gallery model not found' });

    const GALLERY_DIR = resolveGalleryDir();
    const srcPath = path.join(GALLERY_DIR, galleryModel.file_path);

    if (!fs.existsSync(srcPath)) {
      return res.status(404).json({ error: 'Gallery model file not found on disk' });
    }

    const avatarId = uuidv4();
    let file_path;
    let pfp_path = null;

    // Check if the source is in a subdirectory (has textures)
    const srcDir = path.dirname(srcPath);
    const texturesSrcDir = path.join(srcDir, 'textures');
    const hasTextures = fs.existsSync(texturesSrcDir);

    if (hasTextures) {
      // Create subdirectory for this avatar
      const avatarDir = path.join(AVATARS_DIR, avatarId);
      fs.mkdirSync(avatarDir, { recursive: true });

      const modelExt = path.extname(galleryModel.file_path);
      const modelName = `model${modelExt}`;
      const destModelPath = path.join(avatarDir, modelName);
      fs.copyFileSync(srcPath, destModelPath);

      // Copy textures
      const destTexturesDir = path.join(avatarDir, 'textures');
      fs.mkdirSync(destTexturesDir, { recursive: true });
      const texFiles = fs.readdirSync(texturesSrcDir);
      for (const texFile of texFiles) {
        const texSrc = path.join(texturesSrcDir, texFile);
        if (fs.statSync(texSrc).isFile()) {
          fs.copyFileSync(texSrc, path.join(destTexturesDir, texFile));
        }
      }

      file_path = `/uploads/avatars/${avatarId}/${modelName}`;

      // Copy gallery pfp if it exists
      if (galleryModel.pfp_path) {
        const pfpRelative = galleryModel.pfp_path.replace(/^\/gallery\//, '');
        const srcPfp = path.join(GALLERY_DIR, pfpRelative);
        if (fs.existsSync(srcPfp)) {
          const pfpExt = path.extname(pfpRelative);
          const newPfpName = `${uuidv4()}${pfpExt}`;
          const destPfp = path.join(PFPS_DIR, newPfpName);
          fs.copyFileSync(srcPfp, destPfp);
          pfp_path = `/uploads/pfps/${newPfpName}`;
        }
      }
    } else {
      // Flat file (backward compatible)
      const modelExt = path.extname(galleryModel.file_path);
      const filename = `${uuidv4()}${modelExt}`;
      const destPath = path.join(AVATARS_DIR, filename);
      fs.copyFileSync(srcPath, destPath);
      file_path = `/uploads/avatars/${filename}`;

      // Copy gallery pfp if it exists
      if (galleryModel.pfp_path) {
        const pfpRelative = galleryModel.pfp_path.replace(/^\/gallery\//, '');
        const srcPfp = path.join(GALLERY_DIR, pfpRelative);
        if (fs.existsSync(srcPfp)) {
          const pfpExt = path.extname(pfpRelative);
          const newPfpName = `${uuidv4()}${pfpExt}`;
          const destPfp = path.join(PFPS_DIR, newPfpName);
          fs.copyFileSync(srcPfp, destPfp);
          pfp_path = `/uploads/pfps/${newPfpName}`;
        }
      }
    }

    db.prepare(`
      INSERT INTO vrm_models (id, user_id, name, file_path, pfp_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(avatarId, userId, galleryModel.name, file_path, pfp_path);

    const newAvatar = {
      id: avatarId,
      user_id: userId,
      name: galleryModel.name,
      file_path,
      pfp_path,
    };

    res.status(201).json(newAvatar);
  } catch (error) {
    console.error('Error downloading gallery model:', error);
    res.status(500).json({ error: 'Failed to download gallery model' });
  }
});

export default router;
export { UPLOADS_BASE };