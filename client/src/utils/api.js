/**
 * API Client
 *
 * Handles all communication with the backend API.
 * Manages user ID persistence in localStorage.
 */

// For desktop apps running via file://, we need to point to the local Express server explicitly.
// In development/web mode, Vite proxies '/api' correctly.
const API_BASE = window.location.protocol === 'file:' 
  ? 'http://127.0.0.1:3005/api' 
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
 * Exported as fetchApi for generic endpoint access.
 */
export async function fetchApi(endpoint, options = {}) {
  const userId = getUserId();
  const hasOwnKey = localStorage.getItem('waifu-has-own-key') === 'true';

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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

/**
 * Internal wrapper
 */
async function request(endpoint, options = {}) {
  return fetchApi(endpoint, options);
}

// ─── Avatar API ──────────────────────────────────────────────────

export async function getAvatars() {
  return request('/avatars');
}

export async function uploadAvatar(formData) {
  return request('/avatars/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteAvatar(id) {
  return request(`/avatars/${id}`, { method: 'DELETE' });
}

export async function getGalleryAvatars() {
  return request('/avatars/gallery');
}

export async function downloadGalleryAvatar(id) {
  return request(`/avatars/gallery/${id}/download`, { method: 'POST' });
}

export function getUploadUrl(path) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;

  const serverBase = window.location.protocol === 'file:'
    ? 'http://127.0.0.1:3005'
    : 'http://127.0.0.1:3005';

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const encoded = cleanPath.split('/').map(p => encodeURIComponent(p)).join('/');
  return `${serverBase}${encoded}`;
}

// ─── Chat API ──────────────────────────────────────────────────

export async function sendMessage(conversationId, message, screenshot) {
  const body = {
    conversationId: String(conversationId || ''),
    message: String(message || ''),
  };
  if (screenshot) {
    body.screenshot = String(screenshot);
  }
  try {
    return request('/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.message?.includes('circular')) {
      console.error('[API] Circular structure in sendMessage body:', {
        conversationIdType: typeof conversationId,
        messageType: typeof message,
        screenshotType: typeof screenshot,
        screenshotTrunc: String(screenshot).slice(0, 80),
      });
    }
    throw err;
  }
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

// ─── Animations API ─────────────────────────────────────────────

export async function getAnimations() {
  return request('/animations');
}

export async function getAnimation(type, filename) {
  return fetchApi(`/animations/${type}/${filename}`, { method: 'GET' });
}

export async function getAnimationText(type, filename) {
  const userId = getUserId();
  const response = await fetch(`${API_BASE}/animations/${type}/${filename}`, {
    headers: { 'x-user-id': userId },
  });
  if (!response.ok) throw new Error('Failed to fetch animation');
  return response.text();
}

export async function deleteAnimation(type, filename) {
  return request(`/animations/${type}/${filename}`, { method: 'DELETE' });
}

export async function uploadAnimation(type, file) {
  const formData = new FormData();
  formData.append('animation', file);
  return fetchApi(`/animations/upload/${type}`, {
    method: 'POST',
    body: formData,
  });
}

// ─── TTS API ──────────────────────────────────────────────────

// ─── STT API ──────────────────────────────────────────────────

export async function sendSTT(audioBlob) {
  const reader = new FileReader();
  const base64Promise = new Promise((resolve, reject) => {
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
  reader.readAsDataURL(audioBlob);
  const audio = await base64Promise;

  return fetchApi('/stt', {
    method: 'POST',
    body: JSON.stringify({ audio }),
  });
}

export async function getTTS(text, voice = 'af_bella', speed = 1.0) {
  const userId = getUserId();
  const response = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate speech');
  }

  return response.blob();
}

// ─── Textures API ───────────────────────────────────────────────
const TEXTURE_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:3005/textures'
  : '/textures';

export function getTextureURL(category, name) {
  return `${TEXTURE_BASE}/${category}/${name}`;
}
