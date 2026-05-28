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
import { spawn, execSync } from 'child_process';
import os from 'os';
import db from './config/database.js';
import { detectRootDir, resolvePythonExe } from './utils/paths.js';

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
import sttRoutes from './routes/stt.js';
import animationRoutes from './routes/animations.js';

const app = express();
const PORT = process.env.PORT || 3005;

// ─── Middleware ─────────────────────────────────────────────────────

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, server-to-server) and
    // null origin (Electron loads via file:// protocol).
    if (!origin || origin === 'null') return cb(null, true);
    cb(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Request timeout middleware — prevents hanging connections
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
    req.destroy();
  });
  next();
});

/**
 * In-memory user cache to avoid DB queries on every request.
 * Only hits the database for unknown users.
 */
const knownUsers = new Set();

/**
 * User identification middleware.
 * Creates a user automatically if the x-user-id doesn't exist.
 */
app.use('/api', (req, res, next) => {
  let userId = req.headers['x-user-id'];

  if (!userId) {
    userId = uuidv4();
    res.setHeader('X-Generated-User-Id', userId);
  }

  // Only hit DB for unknown users
  if (!knownUsers.has(userId)) {
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

    knownUsers.add(userId);
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
app.use('/textures', express.static(path.resolve('data/textures')));

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

// ─── Environment Validation ─────────────────────────────────────────
const envCheckPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envCheckPath)) {
  console.warn(`\n  ⚠️  No .env file found at ${envCheckPath}`);
  console.warn(`  💡  Copy server/.env.example to server/.env and configure your API keys\n`);
}

if (!process.env.ENCRYPTION_SECRET || process.env.ENCRYPTION_SECRET === 'change-this-to-a-random-32-char-string') {
  console.warn(`  ⚠️  ENCRYPTION_SECRET not set or still default`);
  console.warn(`  💡  Generate one: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`);
  console.warn(`  💡  Add to server/.env: ENCRYPTION_SECRET=<your-key>\n`);
}

// ─── Seed Gallery Models ────────────────────────────────────────────
db.seedGallery(GALLERY_DIR);

// ─── Auto-start Sidecars ──────────────────────────────────────────

async function ensureSidecar(name, port, scriptName, serverUrl) {
  const isWindows = process.platform === 'win32';

  try {
    const resp = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(1500) });
    if (resp.ok) {
      console.log(`  🟢 ${name} sidecar already running on port ${port}`);
      return;
    }
  } catch {}

  const rootDir = detectRootDir();
  const pythonDir = path.join(rootDir, 'python');
  const pythonExe = resolvePythonExe(pythonDir);
  const scriptPath = path.join(pythonDir, scriptName);

  if (!fs.existsSync(pythonExe) || !fs.existsSync(scriptPath)) {
    console.warn(`  ⚠️  ${name} sidecar: Python or script not found, skipping auto-start`);
    return;
  }

  try {
    if (isWindows) {
      try {
        const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', timeout: 3000 });
        const lines = out.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            try { execSync(`taskkill /PID ${pid} /F`, { timeout: 2000 }); } catch {}
          }
        }
      } catch {}
    } else {
      try { execSync(`fuser -k ${port}/tcp 2>/dev/null`, { timeout: 3000 }); } catch {}
    }
  } catch {}

  const proc = spawn(pythonExe, [scriptPath], {
    cwd: pythonDir,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });
  proc.unref();

  // Wait and check
  await new Promise(r => setTimeout(r, 2000));
  try {
    const resp = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(1500) });
    if (resp.ok) {
      console.log(`  🟢 ${name} sidecar started on port ${port}`);
    } else {
      console.warn(`  ⚠️  ${name} sidecar may not have started correctly`);
    }
  } catch {
    console.warn(`  ⚠️  ${name} sidecar not responding on port ${port}`);
  }
}

// ─── Start Server ───────────────────────────────────────────────────

function startServer(port) {
  const server = app.listen(port, '127.0.0.1');
  server.on('listening', async () => {
    console.log(`\n  ✨ Waifu AI Companion Server`);
    console.log(`  📡 Running on http://localhost:${port}`);
    console.log(`  🔑 API Key: ${process.env.GEMINI_API_KEY ? 'Configured' : '⚠️  Not set!'}`);
    console.log(`  📊 Daily limit: ${process.env.DAILY_MESSAGE_LIMIT || 50} messages\n`);

    // Auto-start sidecars in background
    ensureSidecar('TTS', 5000, 'tts_server.py', process.env.TTS_SERVER_URL || 'http://127.0.0.1:5000');
    ensureSidecar('STT', 5001, 'stt_server.py', process.env.STT_SERVER_URL || 'http://127.0.0.1:5001');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ❌ Port ${port} is already in use.`);
      console.error(`  💡 Try: kill the existing process or change PORT in .env\n`);
      process.exit(1);
    }
    throw err;
  });
}

startServer(PORT);

export default app;
