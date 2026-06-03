const DDG_HTML_URL = 'https://duckduckgo.com/';
const DDG_IMAGES_API = 'https://duckduckgo.com/i.js';

const imageCache = new Map();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 1000 * 60 * 30;

function pruneCache() {
  if (imageCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...imageCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toDelete) imageCache.delete(key);
}

export async function searchImages(query, count = 6) {
  if (!query?.trim()) return [];

  const cacheKey = `${query}:${count}`;
  const cached = imageCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.results;
  }

  const results = await searchDuckDuckGoImages(query, count);

  imageCache.set(cacheKey, { results, timestamp: Date.now() });
  pruneCache();

  return results;
}

async function searchDuckDuckGoImages(query, count) {
  try {
    const vqd = await getVQDToken(query);
    if (!vqd) return [];

    const url = new URL(DDG_IMAGES_API);
    url.searchParams.set('q', query);
    url.searchParams.set('vqd', vqd);
    url.searchParams.set('o', 'json');
    url.searchParams.set('p', '1');
    url.searchParams.set('f', ',,,');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    const results = [];
    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        if (results.length >= count) break;
        if (item.image) {
          results.push({
            url: item.image.replace(/^http:\/\//i, 'https://'),
            thumbnail: (item.thumbnail || item.image).replace(/^http:\/\//i, 'https://'),
            title: item.title || query,
          });
        }
      }
    }

    return results;
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      console.warn('[ImageSearch] DuckDuckGo images API timed out');
    } else {
      console.warn('[ImageSearch] DuckDuckGo images API error:', err.message);
    }
    return [];
  }
}

async function getVQDToken(query) {
  try {
    const url = DDG_HTML_URL + '?q=' + encodeURIComponent(query) + '&iax=images&ia=images';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const match = html.match(/vqd=([\d-]+)/);
    return match ? match[1] : null;
  } catch (err) {
    console.warn('[ImageSearch] Failed to get VQD token:', err.message);
    return null;
  }
}

export function clearImageCache() {
  imageCache.clear();
}
