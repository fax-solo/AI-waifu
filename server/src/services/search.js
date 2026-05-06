/**
 * Search Service
 *
 * Handles real-time web search using the Tavily API.
 */

import dotenv from 'dotenv';

dotenv.config();

const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Cache for search results
const searchCache = new Map();

// Search triggers keywords
const SEARCH_KEYWORDS = [
  'latest', 'news', 'today', '2025', '2026', 'recent', 
  'current', 'weather', 'stock', 'price', 'what happened',
  'who is the current', 'who won', 'search', 'find', 'google',
  'lookup', 'items for', 'build for', 'meta', 'tft', 'league',
  'the items', 'best build', 'what build', 'which items', 'stats for'
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

  // Question-based trigger for potentially time-sensitive info
  if (lowercaseQuery.match(/^(what|who|where|how) is/i)) {
    // Only trigger if it looks like it might need recent info
    const timeWords = ['now', 'currently', 'at the moment'];
    if (timeWords.some(word => lowercaseQuery.includes(word))) return true;
  }

  return false;
}

/**
 * Performs a web search using Tavily API.
 * @param {string} query 
 * @returns {Promise<string|null>} Summarized search results
 */
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
        search_depth: 'basic',
        include_answer: true,
        max_results: 5
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Tavily's "answer" is a nice summary of the results
    const result = data.answer || data.results.map(r => `${r.title}: ${r.content}`).join('\n\n');

    // Update cache
    searchCache.set(query, {
      result,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    console.error('[Search] Tavily API error:', error.message);
    return null;
  }
}
