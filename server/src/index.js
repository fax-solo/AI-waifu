/**
 * Waifu AI Companion — Server Entry Point
 *
 * Express server that provides API endpoints for the AI companion chat app.
 * Uses SQLite for storage, Gemini for AI, and includes rate limiting.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import db from './config/database.js';

// Routes
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import settingsRoutes from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ─────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

  req.headers['x-user-id'] = userId;
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────

app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// ─── Error Handler ──────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Something went wrong. Please try again.',
  });
});

// ─── Start Server ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ✨ Waifu AI Companion Server`);
  console.log(`  📡 Running on http://localhost:${PORT}`);
  console.log(`  🔑 API Key: ${process.env.GEMINI_API_KEY ? 'Configured' : '⚠️  Not set!'}`);
  console.log(`  📊 Daily limit: ${process.env.DAILY_MESSAGE_LIMIT || 50} messages\n`);
});

export default app;
