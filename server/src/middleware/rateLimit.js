/**
 * Rate Limiting Middleware
 *
 * Enforces daily message limits and cooldown between messages
 * to optimize for free tier usage.
 */

import db from '../config/database.js';

const DAILY_LIMIT = parseInt(process.env.DAILY_MESSAGE_LIMIT || '50', 10);
const COOLDOWN_MS = parseInt(process.env.MESSAGE_COOLDOWN_MS || '2000', 10);

/**
 * Check and enforce rate limits for a user.
 * Users with their own API key bypass limits.
 */
export function rateLimitMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'];
  const hasOwnKey = req.headers['x-has-own-key'] === 'true';

  if (!userId) {
    return res.status(400).json({ error: 'User ID required.' });
  }

  // Users with their own API key bypass rate limiting
  if (hasOwnKey) {
    return next();
  }

  const today = new Date().toISOString().split('T')[0];

  // Get or create rate limit record for today
  let record = db.prepare(
    'SELECT message_count, last_message_at FROM rate_limits WHERE user_id = ? AND date = ?'
  ).get(userId, today);

  if (!record) {
    db.prepare(
      'INSERT INTO rate_limits (user_id, date, message_count, last_message_at) VALUES (?, ?, 0, NULL)'
    ).run(userId, today);
    record = { message_count: 0, last_message_at: null };
  }

  // Check daily limit
  if (record.message_count >= DAILY_LIMIT) {
    return res.status(429).json({
      error: 'Daily message limit reached.',
      limit: DAILY_LIMIT,
      resetAt: `${today}T23:59:59Z`,
      tip: 'Add your own Gemini API key in Settings to bypass limits!',
    });
  }

  // Check cooldown
  if (record.last_message_at) {
    const lastTime = new Date(record.last_message_at).getTime();
    const elapsed = Date.now() - lastTime;
    if (elapsed < COOLDOWN_MS) {
      const waitMs = COOLDOWN_MS - elapsed;
      return res.status(429).json({
        error: `Please wait ${Math.ceil(waitMs / 1000)} second(s) before sending another message.`,
        retryAfter: Math.ceil(waitMs / 1000),
      });
    }
  }

  // Increment count and update timestamp
  db.prepare(
    'UPDATE rate_limits SET message_count = message_count + 1, last_message_at = ? WHERE user_id = ? AND date = ?'
  ).run(new Date().toISOString(), userId, today);

  // Attach rate limit info to request for response headers
  req.rateLimit = {
    remaining: DAILY_LIMIT - record.message_count - 1,
    limit: DAILY_LIMIT,
    reset: `${today}T23:59:59Z`,
  };

  next();
}

/**
 * Get current rate limit status for a user.
 */
export function getRateLimitStatus(userId) {
  const today = new Date().toISOString().split('T')[0];

  const record = db.prepare(
    'SELECT message_count FROM rate_limits WHERE user_id = ? AND date = ?'
  ).get(userId, today);

  return {
    used: record?.message_count || 0,
    limit: DAILY_LIMIT,
    remaining: DAILY_LIMIT - (record?.message_count || 0),
  };
}

export default { rateLimitMiddleware, getRateLimitStatus };
