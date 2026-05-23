/**
 * Waifu AI Companion — Server Entry Point
 *
 * Express server that provides API endpoints for the AI companion chat app.
 * Uses SQLite for storage, Gemini for AI, and includes rate limiting.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GALLERY_DIR = process.env.GALLERY_DIR || path.resolve(__dirname, '..', 'data', 'gallery');

// Routes
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import settingsRoutes from './routes/settings.js';
import ttsRoutes from './routes/tts.js';
import avatarRoutes, { UPLOADS_BASE } from './routes/avatars.js';
import setupRoutes from './routes/setup.js';
import animationRoutes from './routes/animations.js';
import sttRoutes from './routes/stt.js';

const app = express();
const PORT = process.env.PORT || 3005;

// ─── Middleware ─────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/**
 * User identification middleware.
 * Creates a user automatically if the x-user-id doesn't exist.
 * This is a simple approach — in production, use proper auth.
 */
app.use('/api', (req, res, next) => {
  let userId = req.headers['x-user-id'];

  // Auto-generate user ID if not provided
  if (!userId) {
    userId = uuidv4();
    res.setHeader('X-Generated-User-Id', userId);
  }

  // Ensure user exists in database
  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);

  if (!existingUser) {
    db.prepare('INSERT INTO users (id) VALUES (?)').run(userId);
  }

  // Seed default avatar if none exist for this user
  try {
    const avatarCount = db.prepare('SELECT COUNT(*) as count FROM vrm_models WHERE user_id = ?').get(userId);
    if (!avatarCount || avatarCount.count === 0) {
      const AVATARS_DIR = path.join(UPLOADS_BASE, 'avatars');
      if (!fs.existsSync(AVATARS_DIR)) {
        fs.mkdirSync(AVATARS_DIR, { recursive: true });
      }
      
      const seedSrc = path.join(__dirname, 'seed.vrm');
      if (fs.existsSync(seedSrc)) {
        const seedFilename = `${uuidv4()}.vrm`;
        const destPath = path.join(AVATARS_DIR, seedFilename);
        fs.copyFileSync(seedSrc, destPath);
        
        const avatarId = uuidv4();
        const file_path = `/uploads/avatars/${seedFilename}`;
        
        db.prepare(`
          INSERT INTO vrm_models (id, user_id, name, file_path, pfp_path)
          VALUES (?, ?, ?, ?, ?)
        `).run(avatarId, userId, 'Default Aria', file_path, null);
        console.log(`[Seeding] Successfully seeded default avatar for user: ${userId}`);
      } else {
        console.warn(`[Seeding] Seed VRM file not found at: ${seedSrc}`);
      }
    }
  } catch (err) {
    console.error('[Seeding] Error auto-seeding avatar:', err);
  }

  req.headers['x-user-id'] = userId;
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────

app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/avatars', avatarRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/animations', animationRoutes);
app.use('/api/stt', sttRoutes);

// Static files
app.use('/uploads', express.static(UPLOADS_BASE));
app.use('/animations', express.static(path.resolve('data/animations')));
app.use('/gallery', express.static(GALLERY_DIR));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// ─── Error Handler ──────────────────────────────────────────────────

// 404 Handler for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Default 404 Handler (for static files etc)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Seed Gallery Models ────────────────────────────────────────────
db.seedGallery(GALLERY_DIR);

// ─── Start Server ───────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ✨ Waifu AI Companion Server`);
  console.log(`  📡 Running on http://localhost:${PORT}`);
  console.log(`  🔑 API Key: ${process.env.GEMINI_API_KEY ? 'Configured' : '⚠️  Not set!'}`);
  console.log(`  📊 Daily limit: ${process.env.DAILY_MESSAGE_LIMIT || 50} messages\n`);
});

export default app;
