import db from '../config/database.js';

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIM = 768;

/**
 * Save new memories about a user.
 * Also generates embeddings for vector search in the background.
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
      if (!existing.includes(memory.toLowerCase())) {
        insert.run(userId, category, memory);
      }
    }
  });

  insertMany(memories);

  // Generate embeddings for new memories asynchronously
  for (const memory of memories) {
    if (!existing.includes(memory.toLowerCase())) {
      generateAndStoreEmbedding(userId, memory);
    }
  }
}

/**
 * Generate and store an embedding for a memory in the background.
 */
async function generateAndStoreEmbedding(userId, content) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return;

    const embedding = await generateEmbedding(content, key);
    if (!embedding) return;

    const buffer = floatsToBuffer(embedding);
    db.prepare(
      'UPDATE user_memories SET embedding = ? WHERE user_id = ? AND content = ? AND embedding IS NULL'
    ).run(buffer, userId, content);
  } catch (err) {
    console.warn(`[Memory] Embedding generation failed for "${content.slice(0, 40)}...":`, err.message);
  }
}

/**
 * Call the Gemini embedding API.
 *
 * @param {string} text - Text to embed
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<number[]|null>} Embedding vector or null on failure
 */
export async function generateEmbedding(text, apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, 2048) }] },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[Embedding] API error: ${err}`);
      return null;
    }

    const data = await res.json();
    return data.embedding?.values || null;
  } catch (err) {
    console.warn(`[Embedding] Request failed:`, err.message);
    return null;
  }
}

/**
 * Convert float array to Buffer for SQLite BLOB storage.
 */
function floatsToBuffer(floats) {
  const buf = Buffer.alloc(floats.length * 4);
  for (let i = 0; i < floats.length; i++) {
    buf.writeFloatLE(floats[i], i * 4);
  }
  return buf;
}

/**
 * Convert Buffer back to Float32Array.
 */
function bufferToFloats(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
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
 * Retrieve semantically relevant memories using vector search.
 * Falls back to recent memories if embeddings are not available.
 *
 * @param {string} userId
 * @param {string} query - The user's message to find relevant context for
 * @param {string} apiKey - API key for generating embedding
 * @param {number} maxResults - Max relevant memories to return
 * @returns {Promise<string[]>} Array of relevant memory strings
 */
export async function getRelevantMemories(userId, query, apiKey, maxResults = 5) {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query, apiKey);

  // Load all memories for this user with their embeddings
  const rows = db.prepare(
    'SELECT id, content, embedding FROM user_memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 200'
  ).all(userId);

  if (!rows.length) return [];

  // If we have a query embedding, do vector search
  if (queryEmbedding) {
    const scored = [];

    for (const row of rows) {
      if (row.embedding) {
        const vec = bufferToFloats(row.embedding);
        const score = cosineSimilarity(queryEmbedding, vec);
        scored.push({ content: row.content, score });
      }
    }

    // Sort by similarity (descending) and return top results
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, maxResults).map(r => r.content);

    // If we got good results, return them
    if (results.length >= 2) return results;

    // Otherwise also include recent memories as fallback
  }

  // Fallback: return most recent memories
  return rows.slice(0, maxResults).map(r => r.content);
}

/**
 * Get conversation summary.
 *
 * @param {string} conversationId
 * @returns {string} Summary text or empty string
 */
export function getConversationSummary(conversationId) {
  const row = db.prepare(
    'SELECT summary FROM conversations WHERE id = ?'
  ).get(conversationId);
  return row?.summary || '';
}

/**
 * Update conversation summary and the message count it was generated at.
 *
 * @param {string} conversationId
 * @param {string} summary
 * @param {number} msgCount - Total message count at time of summary
 */
export function updateConversationSummary(conversationId, summary, msgCount) {
  db.prepare(
    'UPDATE conversations SET summary = ?, last_summary_msg_count = ? WHERE id = ?'
  ).run(summary, msgCount, conversationId);
}

/**
 * Check if a conversation needs summarization and trigger it.
 * Called after saving messages.
 *
 * @param {string} conversationId
 * @param {object} aiConfig - { apiKey, provider } for the AI call
 * @returns {Promise<void>}
 */
export async function checkAndTriggerSummarization(conversationId, aiConfig) {
  try {
    const conv = db.prepare(
      'SELECT summary, last_summary_msg_count FROM conversations WHERE id = ?'
    ).get(conversationId);
    if (!conv) return;

    const msgCount = db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
    ).get(conversationId);
    const total = msgCount?.count || 0;

    // Summarize when we have 12+ messages and at least 6 new exchanges since last summary
    const lastCount = conv.last_summary_msg_count || 0;
    if (total < 12) return;
    if (total - lastCount < 6) return;

    // Window size: keep last 10 messages verbatim, summarize everything before that
    const windowSize = 10;
    const summarizeUpTo = total - windowSize;
    if (summarizeUpTo <= lastCount) return;

    // Get messages to summarize (from last_summary_msg_count to summarizeUpTo)
    const rows = db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversationId);

    const messagesToSummarize = rows
      .slice(lastCount, summarizeUpTo)
      .map(r => ({ role: r.role === 'assistant' ? 'model' : 'user', content: r.content }));

    if (!messagesToSummarize.length) return;

    const { summarizeConversation } = await import('./summarize.js');
    const newSummary = await summarizeConversation({
      apiKey: aiConfig.apiKey,
      provider: aiConfig.provider || 'gemini',
      messages: messagesToSummarize,
      existingSummary: conv.summary || '',
    });

    if (newSummary) {
      updateConversationSummary(conversationId, newSummary, summarizeUpTo);
      console.log(`[Memory] Conversation ${conversationId.slice(0, 8)}... summary updated (${newSummary.length} chars)`);
    }
  } catch (err) {
    console.warn(`[Memory] Summarization check failed:`, err.message);
  }
}

/**
 * Get recent conversation history for context (sliding window).
 * Returns only the most recent messages for the AI context window.
 *
 * @param {string} conversationId
 * @param {number} limit - Number of recent messages to include (window size)
 * @returns {Array<{role: string, parts: Array<{text: string}>}>}
 */
export function getConversationHistory(conversationId, limit = 10) {
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
  getRelevantMemories,
  getConversationHistory,
  getConversationSummary,
  updateConversationSummary,
  checkAndTriggerSummarization,
  generateEmbedding,
  saveMessage,
  autoTitle,
};
