/**
 * Conversation Routes
 *
 * GET    /api/conversations       - List user's conversations
 * POST   /api/conversations       - Create a new conversation
 * GET    /api/conversations/:id   - Get conversation with messages
 * DELETE /api/conversations/:id   - Delete a conversation
 * PATCH  /api/conversations/:id   - Update conversation title
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';

const router = Router();

/**
 * GET /api/conversations
 * List all conversations for a user, ordered by most recent.
 */
router.get('/', (req, res) => {
  const userId = req.headers['x-user-id'];

  const conversations = db.prepare(`
    SELECT
      c.id,
      c.title,
      c.created_at,
      c.updated_at,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC
  `).all(userId);

  res.json(conversations);
});

/**
 * POST /api/conversations
 * Create a new conversation.
 */
router.post('/', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { title } = req.body;

  const id = uuidv4();

  db.prepare(
    'INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)'
  ).run(id, userId, title || 'New Chat');

  res.status(201).json({
    id,
    title: title || 'New Chat',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    message_count: 0,
    last_message: null,
  });
});

/**
 * GET /api/conversations/:id
 * Get a conversation with all its messages.
 */
router.get('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  const conversation = db.prepare(
    'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
  ).get(id, userId);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const messages = db.prepare(
    'SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(id);

  res.json({ ...conversation, messages });
});

/**
 * DELETE /api/conversations/:id
 * Delete a conversation and all its messages.
 */
router.delete('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  const conversation = db.prepare(
    'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
  ).get(id, userId);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  // Delete messages first, then conversation
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);

  res.json({ success: true });
});

/**
 * PATCH /api/conversations/:id
 * Update a conversation's title.
 */
router.patch('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { title } = req.body;

  const result = db.prepare(
    'UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(title, id, userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  res.json({ success: true });
});

export default router;
