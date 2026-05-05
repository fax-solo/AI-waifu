/**
 * Memory Service
 *
 * Handles storing and retrieving user memories,
 * and building conversation context for the AI.
 */

import db from '../config/database.js';

/**
 * Save new memories about a user.
 *
 * @param {string} userId
 * @param {string[]} memories - Array of memory strings
 * @param {string} category - Memory category (general, preference, personal)
 */
export function saveMemories(userId, memories, category = 'general') {
  const insert = db.prepare(
    'INSERT INTO user_memories (user_id, category, content) VALUES (?, ?, ?)'
  );

  const existing = db.prepare(
    'SELECT content FROM user_memories WHERE user_id = ?'
  ).all(userId).map((r) => r.content.toLowerCase());

  const insertMany = db.transaction((items) => {
    for (const memory of items) {
      // Avoid duplicates
      if (!existing.includes(memory.toLowerCase())) {
        insert.run(userId, category, memory);
      }
    }
  });

  insertMany(memories);
}

/**
 * Retrieve all memories for a user.
 *
 * @param {string} userId
 * @param {number} limit - Max memories to return
 * @returns {string[]} Array of memory strings
 */
export function getMemories(userId, limit = 50) {
  const rows = db.prepare(
    'SELECT content FROM user_memories WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);

  return rows.map((r) => r.content);
}

/**
 * Get recent conversation history for context.
 *
 * @param {string} conversationId
 * @param {number} limit - Number of recent messages to include
 * @returns {Array<{role: string, content: string}>}
 */
export function getConversationHistory(conversationId, limit = 20) {
  const rows = db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(conversationId, limit);

  // Reverse to get chronological order
  return rows.reverse().map((r) => ({
    role: r.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: r.content }],
  }));
}

/**
 * Save a message to a conversation.
 *
 * @param {string} conversationId
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content
 */
export function saveMessage(conversationId, role, content) {
  db.prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  ).run(conversationId, role, content);

  // Update conversation timestamp
  db.prepare(
    'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(conversationId);
}

/**
 * Auto-generate a conversation title from the first message.
 *
 * @param {string} conversationId
 * @param {string} firstMessage
 */
export function autoTitle(conversationId, firstMessage) {
  const title = firstMessage.length > 40
    ? firstMessage.substring(0, 40) + '...'
    : firstMessage;

  db.prepare(
    'UPDATE conversations SET title = ? WHERE id = ? AND title = \'New Chat\''
  ).run(title, conversationId);
}

export default {
  saveMemories,
  getMemories,
  getConversationHistory,
  saveMessage,
  autoTitle,
};
