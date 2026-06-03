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

  if (expectJson && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      const parsed = JSON.parse(trimmed);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const text = typeof parsed.text === 'string' ? parsed.text : trimmed;
        const toggles = parsed.toggles && typeof parsed.toggles === 'object'
          ? { ...DEFAULT_TOGGLES, ...parsed.toggles }
          : { ...DEFAULT_TOGGLES };
        const search_query = typeof parsed.search_query === 'string' ? parsed.search_query : '';

        return { text, toggles, search_query, wasJson: true };
      }
    } catch {
      // Not valid JSON — fall through to plain text handling
    }
  }

  return { text: trimmed, toggles: { ...DEFAULT_TOGGLES }, search_query: '', wasJson: false };
}

export function getDefaultToggles() {
  return { ...DEFAULT_TOGGLES };
}
