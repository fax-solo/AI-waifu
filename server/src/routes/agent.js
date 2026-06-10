import { Router } from 'express';
import { chat as geminiChat } from '../services/gemini.js';
import db from '../config/database.js';

const router = Router();

const AGENT_SIDECAR_URL = process.env.AGENT_SIDECAR_URL || 'http://127.0.0.1:5001';
const MAX_AGENT_ITERATIONS = 15;

/**
 * Proxy a request to the Python agent sidecar.
 */
async function proxyToSidecar(endpoint, body) {
  const resp = await fetch(`${AGENT_SIDECAR_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `Sidecar error: ${resp.status}`);
  }
  return resp.json();
}

async function proxyGet(endpoint) {
  const resp = await fetch(`${AGENT_SIDECAR_URL}${endpoint}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) throw new Error(`Sidecar error: ${resp.status}`);
  return resp.json();
}

/**
 * Server-side Gemini fallback: build prompt, call Gemini, parse action.
 */
const AGENT_SYSTEM_PROMPT = `You are a desktop automation agent. Your task is to help the user achieve their goal by controlling the mouse and keyboard.

You will receive a screenshot of the user's desktop. Based on the screenshot, decide what action to take next.

Respond ONLY with a valid JSON object. No markdown, no code fences, no other text.

## Action Types:

### mouse_move
Move the mouse cursor to specific coordinates.
{"action": "mouse_move", "x": <int>, "y": <int>, "reasoning": "<brief explanation>"}

### mouse_click
Click at current position or specific coordinates.
{"action": "mouse_click", "x": <int>, "y": <int>, "button": "left"|"right", "reasoning": "<explanation>"}

### double_click
{"action": "double_click", "x": <int>, "y": <int>, "reasoning": "<explanation>"}

### type_text
{"action": "type_text", "text": "<string>", "reasoning": "<explanation>"}

### key_press
{"action": "key_press", "keys": ["ctrl", "c"], "reasoning": "<explanation>"}

### scroll
{"action": "scroll", "clicks": <int>, "reasoning": "<explanation>"}

### wait
{"action": "wait", "seconds": <float>, "reasoning": "<explanation>"}

### screenshot
{"action": "screenshot", "reasoning": "<explanation>"}

### done
{"action": "done", "summary": "<what was accomplished>", "reasoning": "<explanation>"}

### error
{"action": "error", "message": "<what went wrong>", "reasoning": "<explanation>"}

## Coordinate System:
The screenshot you receive is 1280x720. All coordinates in your response should be relative to this 1280x720 image. They will be automatically scaled to the actual screen resolution.

## Rules:
1. Always look at the screenshot carefully before each action.
2. Use wait after actions that need time to complete.
3. When the goal is complete, respond with {"action": "done", ...}.
4. If you cannot achieve the goal, respond with {"action": "error", ...}.
5. Maximum 15 steps allowed.
6. Coordinates must be within the 1280x720 image bounds.`;

function buildServerPrompt(goal, history) {
  let prompt = AGENT_SYSTEM_PROMPT;
  prompt += `\n\n## User Goal\n${goal}\n`;
  if (history && history.length > 0) {
    prompt += '\n## Previous Actions\n';
    for (let i = 0; i < history.length; i++) {
      prompt += `${i + 1}. ${JSON.stringify(history[i])}\n`;
    }
    prompt += '\n## Current Screenshot\nLook at the screenshot above and decide the next action.';
  }
  return prompt;
}

/**
 * GET /api/agent/status — check if sidecar is running
 */
router.get('/status', async (req, res) => {
  try {
    const data = await proxyGet('/health');
    res.json({ running: true, ...data });
  } catch {
    res.json({
      running: false,
      note: 'Desktop agent sidecar not running. Start it or use server-side mode.',
    });
  }
});

/**
 * GET /api/agent/screen-size — get screen dimensions
 */
router.get('/screen-size', async (req, res) => {
  try {
    const data = await proxyGet('/screen-size');
    res.json(data);
  } catch {
    res.json({ width: 1280, height: 720, error: 'Could not reach sidecar, returning defaults' });
  }
});

/**
 * POST /api/agent/step — one perception-action step
 * 
 * Body: { goal, history, useSidecar }
 * If useSidecar=true (default), proxies to Python.
 * If useSidecar=false, runs Gemini server-side but returns the action only.
 */
router.post('/step', async (req, res) => {
  const { goal, history, useSidecar, apiKey, model } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }

  // Try sidecar first if requested
  if (useSidecar !== false) {
    try {
      const data = await proxyToSidecar('/agent/step', {
        goal,
        history: history || [],
        api_key: apiKey || '',
        model: model || 'gemini-2.0-flash-lite',
      });
      return res.json(data);
    } catch (err) {
      // Fall through to server-side
      console.log('[Agent] Sidecar unavailable, falling back to server-side:', err.message);
    }
  }

  // Server-side fallback: use Express Gemini service
  // Get a screenshot via the sidecar if possible, or generate a "no screenshot" response
  let screenshotB64 = null;
  try {
    const screenData = await proxyGet('/screenshot');
    screenshotB64 = screenData.base64;
  } catch {
    // No screenshot available — the Gemini service will handle this
  }

  const userId = req.headers['x-user-id'];
  const settings = db.prepare('SELECT * FROM companion_settings WHERE user_id = ?').get(userId) || {};

  const effectiveModel = model || settings.llm_model || 'gemini-2.0-flash-lite';
  const effectiveApiKey = apiKey || null;

  const systemPrompt = buildServerPrompt(goal, history || []);

  try {
    const result = await geminiChat({
      apiKey: effectiveApiKey,
      systemPrompt,
      history: [],
      userMessage: goal,
      model: effectiveModel,
      screenshot: screenshotB64,
    });

    let action;
    try {
      // Try to extract JSON from the Gemini response text
      const text = result.text;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        action = JSON.parse(match[0]);
      } else {
        action = { action: 'error', message: 'Could not parse Gemini response as JSON', raw: text };
      }
    } catch {
      action = { action: 'error', message: 'Could not parse Gemini response as JSON' };
    }

    return res.json({
      action,
      screenshot: screenshotB64,
      width: 1280,
      height: 720,
      actual_width: 1280,
      actual_height: 720,
      _server_mode: true,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/agent/execute — execute an action (proxied to sidecar)
 */
router.post('/execute', async (req, res) => {
  const { action } = req.body;
  if (!action) {
    return res.status(400).json({ error: 'Action is required' });
  }

  try {
    const data = await proxyToSidecar('/agent/execute', { action });
    res.json(data);
  } catch (err) {
    // If sidecar unavailable, return mock success for server-side mode
    console.log('[Agent] Sidecar unavailable for execute, returning mock:', err.message);
    res.json({ success: true, _mock: true });
  }
});

/**
 * POST /api/agent/run — full agent loop (runs server-side, returns all steps)
 */
router.post('/run', async (req, res) => {
  const { goal, useSidecar, apiKey, model } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }

  if (useSidecar !== false) {
    try {
      const data = await proxyToSidecar('/agent/run', {
        goal,
        api_key: apiKey || '',
        model: model || 'gemini-2.0-flash-lite',
      });
      return res.json(data);
    } catch (err) {
      console.log('[Agent] Sidecar unavailable for run loop:', err.message);
    }
  }

  // Server-side loop
  const history = [];
  const steps = [];
  const userId = req.headers['x-user-id'];
  const settings = db.prepare('SELECT * FROM companion_settings WHERE user_id = ?').get(userId) || {};
  const effectiveModel = model || settings.llm_model || 'gemini-2.0-flash-lite';
  const effectiveApiKey = apiKey || null;

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    let screenshotB64 = null;
    try {
      const screenData = await proxyGet('/screenshot');
      screenshotB64 = screenData.base64;
    } catch {}

    const systemPrompt = buildServerPrompt(goal, history);

    try {
      const result = await geminiChat({
        apiKey: effectiveApiKey,
        systemPrompt,
        history: [],
        userMessage: goal,
        model: effectiveModel,
        screenshot: screenshotB64,
      });

      let action;
      const text = result.text;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { action = JSON.parse(match[0]); } catch { action = { action: 'error', message: 'Parse failure' }; }
      } else {
        action = { action: 'error', message: 'Parse failure' };
      }

      const stepResult = { iteration: i + 1, action, screenshot: screenshotB64 };
      steps.push(stepResult);
      history.push(action);

      const actionType = action.action;

      if (actionType === 'done') {
        return res.json({ status: 'done', iterations: i + 1, summary: action.summary || '', steps });
      }
      if (actionType === 'error') {
        return res.json({ status: 'error', iterations: i + 1, message: action.message || '', steps });
      }

      // Execute on sidecar if available
      try {
        await proxyToSidecar('/agent/execute', { action });
      } catch {
        // Mock execution in server mode
      }

    } catch (err) {
      return res.status(500).json({ error: err.message, steps });
    }
  }

  return res.json({ status: 'max_iterations', iterations: MAX_AGENT_ITERATIONS, steps });
});

export default router;
