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

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'vrm') cb(null, AVATARS_DIR);
    else cb(null, PFPS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

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

// Upload a new avatar
router.post('/upload', upload.fields([
  { name: 'vrm', maxCount: 1 },
  { name: 'pfp', maxCount: 1 }
]), (req, res) => {
  const userId = req.headers['x-user-id'];
  const { name } = req.body;
  const vrmFile = req.files['vrm'] ? req.files['vrm'][0] : null;
  const pfpFile = req.files['pfp'] ? req.files['pfp'][0] : null;

  if (!vrmFile || !name) {
    return res.status(400).json({ error: 'Name and VRM file are required' });
  }

  try {
    const id = uuidv4();
    // We store relative paths or just filenames to keep it portable
    const avatarData = {
      id,
      user_id: userId,
      name,
      file_path: `/uploads/avatars/${vrmFile.filename}`,
      pfp_path: pfpFile ? `/uploads/pfps/${pfpFile.filename}` : null
    };

    db.prepare(`
      INSERT INTO vrm_models (id, user_id, name, file_path, pfp_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, name, avatarData.file_path, avatarData.pfp_path);

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
    const vrmPath = path.join(UPLOADS_BASE, '..', avatar.file_path);
    const pfpPath = avatar.pfp_path ? path.join(UPLOADS_BASE, '..', avatar.pfp_path) : null;

    if (fs.existsSync(vrmPath)) fs.unlinkSync(vrmPath);
    if (pfpPath && fs.existsSync(pfpPath)) fs.unlinkSync(pfpPath);

    db.prepare('DELETE FROM vrm_models WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting avatar:', error);
    res.status(500).json({ error: 'Failed to delete avatar' });
  }
});

// ─── Gallery Endpoints ──────────────────────────────────────────────

// List gallery models (auto-discovers new files in gallery directory)
router.get('/gallery', (req, res) => {
  try {
    // Check for any new .vrm files in gallery dir not yet in database
    const GALLERY_DIR = path.resolve(__dirname, '..', '..', 'data', 'gallery');
    if (fs.existsSync(GALLERY_DIR)) {
      const files = fs.readdirSync(GALLERY_DIR).filter(f => f.toLowerCase().endsWith('.vrm'));
      for (const file of files) {
        const name = path.parse(file).name;
        const existing = db.prepare('SELECT id FROM gallery_vrm_models WHERE name = ?').get(name);
        if (!existing) {
          const id = uuidv4();
          db.prepare(`
            INSERT INTO gallery_vrm_models (id, name, file_path, pfp_path, description)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, name, file, null, '');
          console.log(`[Gallery] Auto-discovered: ${name}`);
        }
      }
    }

    const models = db.prepare('SELECT * FROM gallery_vrm_models ORDER BY name ASC').all();
    res.json(models);
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

    // Resolve gallery file path (same logic as in index.js)
    const GALLERY_DIR = path.resolve(__dirname, '..', '..', 'data', 'gallery');
    const srcPath = path.join(GALLERY_DIR, galleryModel.file_path);

    if (!fs.existsSync(srcPath)) {
      return res.status(404).json({ error: 'Gallery model file not found on disk' });
    }

    // Copy the gallery file to user's avatars directory
    const filename = `${uuidv4()}.vrm`;
    const destPath = path.join(AVATARS_DIR, filename);
    fs.copyFileSync(srcPath, destPath);

    const avatarId = uuidv4();
    const file_path = `/uploads/avatars/${filename}`;

    db.prepare(`
      INSERT INTO vrm_models (id, user_id, name, file_path, pfp_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(avatarId, userId, galleryModel.name, file_path, null);

    const newAvatar = {
      id: avatarId,
      user_id: userId,
      name: galleryModel.name,
      file_path,
      pfp_path: null,
    };

    res.status(201).json(newAvatar);
  } catch (error) {
    console.error('Error downloading gallery model:', error);
    res.status(500).json({ error: 'Failed to download gallery model' });
  }
});

export default router;
export { UPLOADS_BASE };
