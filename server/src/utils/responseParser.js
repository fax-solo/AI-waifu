/**
 * Response Parser
 *
 * Parses AI output that may be JSON (from Desktop Companion Mode) or
 * plain text (legacy). Extracts toggles, search_query, and the text
 * payload (which still contains [emotion] / [animation:...] tags).
 */

const DEFAULT_TOGGLES = {
  trigger_image_search: false,
  share_screenshot: false,
  screen_preview: false,
  speech_to_text: false,
};

/**
 * Parse AI response text into a structured result.
 *
 * @param {string} rawText - The raw text output from the AI model.
 * @param {boolean} expectJson - Whether JSON format is expected (companion mode enabled).
 * @returns {{ text: string, toggles: object, search_query: string, wasJson: boolean }}
 */
export function parseResponse(rawText, expectJson = false) {
  if (!rawText?.trim()) {
    return { text: rawText || '', toggles: { ...DEFAULT_TOGGLES }, search_query: '', wasJson: false };
  }

  let trimmed = rawText.trim();

  if (expectJson) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      trimmed = fenceMatch[1].trim();
    }
  }

  if (expectJson) {
    // Try full-text JSON parse
    let parsed = tryParseJson(trimmed);
    if (parsed) return buildResult(parsed, trimmed);

    // Fallback: find embedded JSON within mixed text output
    const embedded = extractJson(trimmed);
    if (embedded) {
      parsed = tryParseJson(embedded);
      if (parsed) return buildResult(parsed, trimmed);
    }
  }

  return { text: trimmed, toggles: { ...DEFAULT_TOGGLES }, search_query: '', wasJson: false };
}

/**
 * Attempt to parse a string as a JSON object (not array).
 * Returns the parsed object on success, null on failure.
 */
function tryParseJson(str) {
  if (!str.startsWith('{') && !str.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return null;
}

/**
 * Build a parseResponse result from a parsed JSON object.
 */
function buildResult(parsed, fallbackText) {
  const text = typeof parsed.text === 'string' ? parsed.text : fallbackText;
  const toggles = parsed.toggles && typeof parsed.toggles === 'object'
    ? { ...DEFAULT_TOGGLES, ...parsed.toggles }
    : { ...DEFAULT_TOGGLES };
  const search_query = typeof parsed.search_query === 'string' ? parsed.search_query : '';
  return { text, toggles, search_query, wasJson: true };
}

/**
 * Search for an embedded JSON object ({...}) within text.
 * Uses brace-depth tracking to handle nested objects.
 * Returns the JSON substring or null if not found.
 */
function extractJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  return null;
}

export function getDefaultToggles() {
  return { ...DEFAULT_TOGGLES };
}
