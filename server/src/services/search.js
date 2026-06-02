/**
 * Search Service
 *
 * Handles real-time web search using the Tavily API.
 */

import dotenv from 'dotenv';

dotenv.config();

const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Cache for search results (max 100 entries, pruned by age)
const searchCache = new Map();
const MAX_CACHE_SIZE = 100;

function pruneSearchCache() {
  if (searchCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...searchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toDelete) searchCache.delete(key);
}

const SEARCH_KEYWORDS = [
  'latest', 'news', 'today', '2025', '2026', 'recent',
  'current', 'weather', 'stock', 'price', 'what happened',
  'who is the current', 'who won', 'search', 'find', 'google',
  'lookup', 'items for', 'build for', 'meta', 'tft', 'league',
  'the items', 'best build', 'what build', 'which items', 'stats for',
  'recommend', 'suggest', 'simulator', 'examples',
  'give me', 'gimme', 'list of', 'any good', 'similar to',
  'alternatives', 'game recs',
  'songs like', 'artists like', 'music like', 'games like',
  'movies like', 'shows like', 'something like',
  'like what', 'similar artists', 'similar songs',
  'recommend me', 'suggest me',
  'lyrics', 'lyrics for', 'song lyrics', 'lyrics of',
];

/**
 * Determines if a query requires a web search.
 * @param {string} query 
 * @returns {boolean}
 */
export function shouldSearch(query) {
  const lowercaseQuery = query.toLowerCase();
  
  // Explicit "search" commands (High priority)
  const searchPhrases = [
    'search the web', 'search for', 'google for', 
    'find on the web', 'look up', 'check the internet',
    'what are the best items', 'what is the meta', 'best build for'
  ];
  if (searchPhrases.some(p => lowercaseQuery.includes(p))) return true;

  // Keyword-based trigger
  const hasKeyword = SEARCH_KEYWORDS.some(keyword => lowercaseQuery.includes(keyword));
  if (hasKeyword) return true;

  if (lowercaseQuery.match(/^(what|who|where|how) is/i)) {
    const timeWords = ['now', 'currently', 'at the moment'];
    if (timeWords.some(word => lowercaseQuery.includes(word))) return true;
  }

  if (lowercaseQuery.match(/(?:something|anything|songs|artists|music|movies|shows|games|anime)\s+like\s+/i)) return true;

  if (lowercaseQuery.match(/\blike\s+\w+(?:\s+\w+){0,3}\s*(?:artist|song|rapper|band|music|game|movie|show|anime)\b/i)) return true;

  return false;
}

/**
 * Performs a web search using Tavily API.
 * @param {string} query 
 * @returns {Promise<string|null>} Summarized search results
 */
/**
 * Extracts meaningful search terms from a user message by removing filler words.
 * @param {string} message
 * @returns {string}
 */
export function extractSearchQuery(message) {
  const stopWords = new Set([
    'gimme', 'give', 'tell', 'show', 'want', 'need', 'can', 'you',
    'please', 'some', 'the', 'a', 'an', 'is', 'are', 'was', 'what',
    'how', 'where', 'when', 'do', 'and', 'or', 'for', 'of', 'in',
    'on', 'at', 'to', 'i', 'me', 'my', 'we', 'our', 'list', 'all',
    'okay', 'ok'
  ]);
  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .join(' ');
}

export async function searchWeb(query) {
  if (!TAVILY_API_KEY) {
    console.warn('[Search] Tavily API key is missing. Skipping search.');
    return null;
  }

  // Check cache
  const cached = searchCache.get(query);
  if (cached && (Date.now() - cached.timestamp < 1000 * 60 * 60)) { // 1 hour cache
    console.log('[Search] Using cached results for:', query);
    return cached.result;
  }

  console.log('[Search] Fetching real-time info for:', query);

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: 'advanced',
        include_answer: false,
        include_raw_content: false,
        max_results: 5
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    const MAX_RESULT_CHARS = 1200;
    const MAX_TOTAL_CHARS = 4000;

    let result = data.results.map(r => {
      const text = (r.content || '').slice(0, MAX_RESULT_CHARS);
      return `${r.title}: ${text}`;
    }).join('\n\n');

    if (result.length > MAX_TOTAL_CHARS) {
      result = result.slice(0, MAX_TOTAL_CHARS) + '\n\n[results truncated]';
    }

    // Update cache
    searchCache.set(query, {
      result,
      timestamp: Date.now()
    });
    pruneSearchCache();

    return result;
  } catch (error) {
    console.error('[Search] Tavily API error:', error.message);
    return null;
  }
}
