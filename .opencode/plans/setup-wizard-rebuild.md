# Setup Wizard Rebuild Plan

## Overview

Complete rewrite of the setup wizard across the full stack. Fixes 6 critical bugs, adds database-backed state, proper download management, and a polished 6-step UI.

## Changes by File

### Phase 1 — Critical Bugfixes

| File | Change |
|---|---|
| `client/src/translations/ar.js` | Replace entire `setup:` block with clean version. Removes corrupt `sed` artifact, adds new translation keys for welcome/network/config/complete steps |
| `server/src/index.js:186` | Add `const isWindows = process.platform === 'win32';` at top of `ensureSidecar()` — fixes `ReferenceError` crash when auto-starting TTS/STT |

### Phase 2 — Backend Foundation

#### `server/src/config/database.js` — Add setup_state table

```sql
CREATE TABLE IF NOT EXISTS setup_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  setup_complete INTEGER DEFAULT 0,
  completed_at DATETIME,
  python_env_status TEXT DEFAULT 'missing',
  tts_models_status TEXT DEFAULT 'missing',
  tts_voices_status TEXT DEFAULT 'missing',
  selected_engine TEXT DEFAULT 'cpu',
  companion_name TEXT DEFAULT 'Aria',
  language TEXT DEFAULT 'en',
  tts_enabled INTEGER DEFAULT 1,
  session_active INTEGER DEFAULT 0,
  session_id TEXT,
  session_started_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Migration: Add to existing databases via the same `requiredCols` pattern.

#### `server/src/routes/setup.js` — Full rewrite (was 644 lines)

**New endpoints:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/setup/status` | Returns per-component status from DB + disk checks |
| `GET` | `/api/setup/packages` | Returns available packages from `models.json` (frontend fetches dynamically) |
| `POST` | `/api/setup/start` | Creates a setup session, returns `sessionId` |
| `GET` | `/api/setup/stream` | SSE — download files + bootstrap Python. Sends `progress`, `log`, `speed`, `eta`, `done`, `error` events |
| `POST` | `/api/setup/cancel` | Clears active session, removes partial files |
| `POST` | `/api/setup/complete` | Writes to DB + marker file, starts sidecars, creates companion_settings if missing |
| `GET` | `/api/setup/components` | Lists all installable components with status (for repair UI) |
| `POST` | `/api/setup/repair` | Re-downloads a specific component, returns stream |

**Package ID mapping (FIXED):**
- Frontend sends `"python-env-cpu"`, `"python-env-gpu"`, `"tts-model"`, `"tts-voices"`
- Backend maps `tts-model` → `tts-model_ljspeech` + `tts-config_ljspeech` + `tts-model_libritts` + `tts-config_libritts`
- Backend maps `tts-voices` → `tts-voices`
- Backend maps `python-env-*` → `bootstrapPython()` with appropriate torch index

**Download improvements:**
- SHA256 verification after download (from updated models.json)
- Retry individual downloads (3 attempts, exponential backoff)
- Send `speed` (MB/s) and `eta` (seconds) events for frontend display
- Error isolation — one failed package doesn't block others
- Partial file cleanup on cancel

#### `models.json` — Add sha256 hashes + size + package metadata

```json
{
  "tts": {
    "model_ljspeech": {
      "url": "https://huggingface.co/...",
      "path": "python/styletts2-ljspeech.pth",
      "sha256": "abc123...",
      "size": 310829056,
      "version": "1.0"
    },
    ...
  },
  "__packages__": {
    "tts-model": {
      "name": "Kokoro ONNX Engine",
      "description": "Core TTS neural network model",
      "sizeBytes": 682000000,
      "required": true,
      "icon": "Mic",
      "assets": ["tts-model_ljspeech", "tts-config_ljspeech", "tts-model_libritts", "tts-config_libritts"]
    },
    "tts-voices": {
      "name": "Voice Pack (v1.0)",
      "description": "Binary voice definitions and latent weights",
      "sizeBytes": 27000000,
      "required": true,
      "icon": "Mic",
      "assets": ["tts-voices"]
    }
  }
}
```

### Phase 3 — Frontend Components

#### `client/src/utils/api.js` — Add setup endpoints

```js
export async function getSetupStatus() { return fetchApi('/setup/status'); }
export async function getSetupPackages() { return fetchApi('/setup/packages'); }
export async function startSetup(packages, engine) { return fetchApi('/setup/start', { method: 'POST', body: JSON.stringify({ packages, engine }) }); }
export async function cancelSetup(sessionId) { return fetchApi('/setup/cancel', { method: 'POST', body: JSON.stringify({ sessionId }) }); }
export async function completeSetup(config) { return fetchApi('/setup/complete', { method: 'POST', body: JSON.stringify(config) }); }
export async function getComponents() { return fetchApi('/setup/components'); }
```

#### `client/src/components/Setup/SetupProvider.jsx` — NEW (Zustand store)

State shape:
```js
{
  step: 0,                        // 0-5: welcome, check, select, install, config, complete
  steps: ['welcome', 'system-check', 'components', 'install', 'config', 'complete'],
  checks: null,                    // { python, gpu, disk, os, network }
  packages: [],                    // available packages from server
  selectedPackages: [],           // user's selected package objects
  selectedEngine: 'cpu',
  sessionId: null,
  progress: null,                 // { progresses: {}, currentIndex, logs, error, aborted, finished, speed, eta }
  config: { companionName: 'Aria', language: 'en', ttsEnabled: true },
  setupComplete: false,
}
```

Actions: `nextStep()`, `prevStep()`, `runChecks()`, `selectPackage()`, `setEngine()`, `startInstall()`, `abortInstall()`, `retryInstall()`, `updateConfig()`, `completeSetup()`, `skipSetup()`

#### `client/src/components/Setup/StepWelcome.jsx` — NEW

- App logo (✦) animated entrance
- "Waifu" title
- Description: "Your AI companion — let's get you set up"
- Language selector (en/ar toggle)
- "Get Started" button → transitions to system check
- "Skip Setup" link (bottom left, subtle)

#### `client/src/components/Setup/StepSystemCheck.jsx` — REWRITE

- Runs checks in parallel via `GET /api/setup/status`
- 5 check cards: Python, GPU, Disk, OS, Network (NEW)
- Each card: icon + label + spinner → checkmark/warning/error
- Network check pings `https://huggingface.co` to verify connectivity
- Results appear as they complete (not all-or-nothing)
- 15-second per-check timeout
- Retry button per failed check
- "Next" button enabled only when no critical failures (Python, Disk, Network)
- ARIA live region announces results

#### `client/src/components/Setup/PackageSelection.jsx` — REWRITE

- Fetches packages from `GET /api/setup/packages` (dynamic, not hardcoded)
- Engine section: CPU / NVIDIA GPU / AMD GPU (radio cards, GPU auto-selected if detected)
- TTS Model section: required, checked, locked
- TTS Voices section: required, checked, locked
- Gallery Avatars: shown if `hasGalleryAvatars === false`
- Each card: icon + name + description + size
- Size breakdown at bottom with total
- "Install Now" and "Next Step" buttons in footer
- No more empty "Optional" section

#### `client/src/components/Setup/InstallProgress.jsx` — REWRITE

- Preparing state (800ms skeleton)
- Per-package progress bar with name, %, status icon (spinner/check/clock/error)
- NEW: Download speed (MB/s) shown below active package
- NEW: ETA (seconds/minutes) shown per package
- NEW: Overall progress with percentage
- NEW: Auto-retry display ("Retrying (2/3)...")
- NEW: Error isolation — failed package shows error, others continue
- Live console log (collapsible, searchable, auto-scroll)
- Cancel button → modal: "Keep partial downloads" vs "Discard"
- Success state: green checkmark + "Continue to Configuration"
- Fix: `logOpen` state properly declared with `useState(false)`

#### `client/src/components/Setup/StepConfig.jsx` — REWRITE (was StepQuickConfig)

- Section 1: Companion name (text input, max 30 chars, live preview)
- Section 2: Language (en/ar select with preview)
- Section 3: TTS toggle (checkbox)
- NEW Section 4: API Key (collapsible) — paste Gemini key or skip
- "I'll configure later" skip link
- "Launch App" button

#### `client/src/components/Setup/StepComplete.jsx` — NEW

- Success animation (pulsing checkmark)
- "Everything's ready!" heading
- Summary card: "X components installed", "Python Environment ✓", "TTS Models ✓", etc.
- "Launch App" primary button
- "Open Settings" secondary button

#### `client/src/components/Setup/SetupUI.jsx` — REWRITE

- Uses `SetupProvider` context instead of `useSetup` hook
- 6-step indicator (Welcome, Check, Select, Install, Config, Finish)
- Animated step transitions (fade + slide)
- Focus trapping for accessibility
- Keyboard navigation (Enter to continue, Escape on modals)
- ARIA live region for step announcements

#### `client/src/App.jsx` — Update setup integration

- `onComplete` now calls `completeSetup(config)` then re-checks status
- Passes `companionName`, `language`, `ttsEnabled` from config to main companionSettings
- No other structural changes needed

### Phase 4 — Translations

#### `client/src/translations/en.js` — Add new keys

```js
setup: {
  // ... existing keys keep their values ...
  completeDesc: 'Everything is ready. Start chatting with your companion!',
  welcomeTitle: 'Welcome to Waifu',
  welcomeDesc: 'Your AI companion — let\'s get you set up.',
  welcomeBtn: 'Get Started',
  stepWelcome: 'Welcome',
  stepFinish: 'Finish',
  abortAndKeep: 'Cancel & Keep Downloads',
  speed: 'Download speed',
  eta: 'Time remaining',
  componentsInstalled: 'Components installed',
  componentCount: '{count} components',
  openSettings: 'Open Settings',
  resumeInstall: 'Resume Installation',
  downloadError: 'Download Error',
  retrying: 'Retrying ({n}/3)...',
  checkingNetwork: 'Checking network...',
  networkOk: 'Connected',
  networkFail: 'No internet connection',
  sessionRestored: 'Previous installation session restored',
  apiKeyTitle: 'API Key (optional)',
  apiKeyDesc: 'Add your Gemini API key now or skip. You can always set it up later in Settings.',
  apiKeyPlaceholder: 'Paste your Gemini API key...',
  apiKeySkip: 'Skip',
  skipWelcome: 'Skip setup',
  networkLabel: 'Network Connectivity',
  resume: 'Resume',
}
```

## UI Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Welcome    │ →  │ System Check │ →  │  Component   │ →  │ Installation │ →  │  Quick Config│ →  │   Complete   │
│  (Step 0)    │    │  (Step 1)    │    │  Selection   │    │  (Step 3)    │    │  (Step 4)    │    │  (Step 5)    │
│              │    │              │    │  (Step 2)    │    │              │    │              │    │              │
│ ✦ Waifu     │    │ Python ✓     │    │ [CPU] [GPU]  │    │ ██████░ 65% │    │ Name: [__]   │    │ ✓ All done!  │
│ "Get Started"│    │ GPU ✓        │    │ TTS Model ☑  │    │ speed: 2MB/s│    │ Lang: [en]   │    │ "Launch App" │
│ [en/ar]      │    │ Disk ✓       │    │ TTS Voices ☑ │    │ ETA: 45s    │    │ TTS: [x]     │    │              │
│              │    │ OS ✓         │    │ Size: 337MB  │    │ [Show Log]  │    │ API Key: opt │    │              │
│              │    │ Net ✓        │    │              │    │ [Cancel]    │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

## Implementation Order

1. Fix `ar.js` — replace setup block with clean version (no sed)
2. Fix `index.js` — add `isWindows` to `ensureSidecar()`
3. Edit `database.js` — add `setup_state` CREATE TABLE
4. Rewrite `server/src/routes/setup.js` — new endpoints + fixes
5. Update `models.json` — add `__packages__` metadata
6. Add setup API functions to `client/src/utils/api.js`
7. Create `SetupProvider.jsx` — Zustand store
8. Create `StepWelcome.jsx`
9. Rewrite `StepSystemCheck.jsx`
10. Rewrite `PackageSelection.jsx`
11. Rewrite `InstallProgress.jsx`
12. Rewrite `StepConfig.jsx` (was StepQuickConfig)
13. Create `StepComplete.jsx`
14. Rewrite `SetupUI.jsx`
15. Update `App.jsx`
16. Update `client/src/translations/en.js`
17. Update `client/src/translations/ar.js`
18. Verify with `node --check` on all JS files
