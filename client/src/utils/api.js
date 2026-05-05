/**
 * API Client
 *
 * Handles all communication with the backend API.
 * Manages user ID persistence in localStorage.
 */

// For desktop apps running via file://, we need to point to the local Express server explicitly.
// In development/web mode, Vite proxies '/api' correctly.
const API_BASE = window.location.protocol === 'file:' 
  ? 'http://localhost:3001/api' 
  : '/api';

/**
 * Get or create a persistent user ID.
 */
export function getUserId() {
  let userId = localStorage.getItem('waifu-user-id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('waifu-user-id', userId);
  }
  return userId;
}

/**
 * Make an API request with user identification headers.
 */
async function request(endpoint, options = {}) {
  const userId = getUserId();
  const hasOwnKey = localStorage.getItem('waifu-has-own-key') === 'true';

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      'x-has-own-key': hasOwnKey.toString(),
      ...options.headers,
    },
  });

  // Check for generated user ID
  const generatedId = response.headers.get('X-Generated-User-Id');
  if (generatedId) {
    localStorage.setItem('waifu-user-id', generatedId);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  return response.json();
}

// ─── Chat API ──────────────────────────────────────────────────

export async function sendMessage(conversationId, message) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ conversationId, message }),
  });
}

// ─── Conversations API ─────────────────────────────────────────

export async function getConversations() {
  return request('/conversations');
}

export async function createConversation(title) {
  return request('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function getConversation(id) {
  return request(`/conversations/${id}`);
}

export async function deleteConversation(id) {
  return request(`/conversations/${id}`, { method: 'DELETE' });
}

export async function updateConversationTitle(id, title) {
  return request(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

// ─── Settings API ──────────────────────────────────────────────

export async function getSettings() {
  return request('/settings');
}

export async function updateSettings(data) {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function setApiKey(apiKey) {
  const result = await request('/settings/api-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
  localStorage.setItem('waifu-has-own-key', 'true');
  return result;
}

export async function removeApiKey() {
  const result = await request('/settings/api-key', { method: 'DELETE' });
  localStorage.setItem('waifu-has-own-key', 'false');
  return result;
}

export async function getRateLimit() {
  return request('/settings/rate-limit');
}

export async function getMemories() {
  return request('/settings/memories');
}

export async function deleteMemory(id) {
  return request(`/settings/memories/${id}`, { method: 'DELETE' });
}
