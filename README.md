# Waifu AI — Your Premium 3D Companion

[![Powered by Gemini & Groq](https://img.shields.io/badge/Powered%20by-Gemini%20%26%20Groq-orange?style=for-the-badge)](https://github.com/fax-solo/AI-waifu)
[![Physics](https://img.shields.io/badge/Physics-Premium-magenta?style=for-the-badge)](https://github.com/fax-solo/AI-waifu)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge)](https://github.com/fax-solo/AI-waifu/releases)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

A state-of-the-art AI companion desktop application featuring a highly interactive **3D VRM Avatar**, multi-model intelligence (**Gemini & Groq**), ultra-fast **local Text-to-Speech** with Kokoro, and a beautiful resizable dark-themed interface.

---

## Features

- **3D VRM Avatar** — Full-body anime-style avatar with physics-driven hair, clothing, and natural motion. AI-driven facial expressions that sync with conversation.
- **Desktop Companion Mode (DCM)** — Autonomous desktop agent: AI can request screen captures, view your screen via Gemini Vision, and control mouse/keyboard to assist you directly.
- **Advanced Animation System** — VRMA-format body animations with 20+ expressive motions (greeting, thinking, surprised, sad, shooting, peace sign, etc.) triggered by conversation sentiment. Look-at controller and blink system for natural gaze.
- **Expression Texture Overlays** — Dynamic face compositing: blush, sweat, eye replacements, and viseme mouth shapes auto-detected and aligned to any VRM model's UV layout.
- **Material Fix Engine** — Auto-detects burnt/black skin textures from misassigned lightmap/AO/normal maps and swaps in the real diffuse, fixing broken model imports.
- **Render Queue System** — 5-layer depth sorting (Opaque Skin → Transparent Overlays → Cutout → Eyes → Mouth) ensuring proper rendering order on all models.
- **Spring Bone Physics** — Configurable presets for hair, clothing, and accessory physics with improved collider response.
- **Multi-Model AI** — Switch between Google Gemini (multiple models) and Groq (Llama 3, Mixtral, Gemma) for blazing-fast responses.
- **Local TTS** — High-speed voice synthesis via Kokoro ONNX with GPU acceleration. 11 voices across English and Japanese.
- **Emotional TTS** — 8 emotion presets (happy, sad, excited, angry, shy, calm, surprised, affectionate) with pitch shift, reverb, EQ, and energy boost.
- **Speech-to-Text** — Voice input support with local speech recognition.
- **Image Search** — AI-triggered DuckDuckGo image search with results displayed in a thumbnail gallery with lightbox viewer.
- **Screen Sharing** — AI can request real-time screen captures. Integrated with DCM for autonomous desktop assistance.
- **Memory System** — Your companion remembers details about you across conversations. Long conversations are automatically summarized for efficient context management. Atomic database transactions ensure data integrity.
- **Custom Avatars** — Upload your own .vrm/.glb files. On-demand gallery downloads (~168 MB saved from installer).
- **Web Search** — Real-time search via Tavily API, results injected into AI context.
- **Companion Personality** — Fully customizable name, tone, personality, and backstory.
- **Setup Wizard** — Multi-step first-run wizard with download progress, environment checking, and results summary.
- **Keyboard Shortcuts** — Fully rebindable shortcuts for all actions.
- **Export/Import** — Backup or transfer your settings and companion profile as JSON.
- **RTL Support** — Full Arabic language support with right-to-left layout.
- **Dark Theme** — Customizable accent color (6 colors). Toast notifications system with auto-dismiss.
- **Error Boundary** — Graceful error handling that prevents crashes from bringing down the app.

---

## Quick Start (For Users)

1. **Download `WaifuAI-Setup.exe`** from the [Releases page](https://github.com/fax-solo/AI-waifu/releases).
2. **Run the installer** and follow the setup wizard.
3. On first launch, the **Setup Wizard** guides you through downloading models, bootstrapping Python, and configuring the database.
4. **Start chatting!**

> **Windows SmartScreen**: The app isn't code-signed, so Windows may show "Windows protected your PC". Click **"More Info"** → **"Run Anyway"**. The app is open-source and safe.

---

## Development Setup

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ (tested on 26) |
| Python | 3.10 - 3.11 |
| Disk Space | ~10GB free |
| GPU (optional) | NVIDIA CUDA / AMD ROCm for accelerated TTS |

### Install

```bash
git clone https://github.com/fax-solo/AI-waifu.git
cd AI-waifu

# Install all dependencies (root + server + client)
npm install
npm run install:all

# Download TTS models
npm run download:models

# Configure API keys
cp server/.env.example server/.env
# Edit server/.env with your keys (see Configuration below)
```

### Run (Development)

```bash
# Run everything at once (server + client + Electron)
npm run dev
```

Or individually:

| Command | Runs |
|---------|------|
| `npm run dev:server` | Express backend on port 3005 |
| `npm run dev:client` | Vite dev server on port 5173 |
| `npm run dev:electron` | Electron window loading from Vite |

The Vite dev server proxies `/api` requests to `localhost:3005`.

### Build

```bash
# Build the React frontend
npm run build:client

# Package the full desktop installer (.exe)
npm run build:desktop
```

Output: `dist-desktop/WaifuAI-Setup-{version}.exe`

---

## Configuration

### Environment Variables (`server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key ([get one free](https://aistudio.google.com/app/apikey)) |
| `GROQ_API_KEY` | No | — | Groq API key ([get one free](https://console.groq.com/keys)) |
| `TAVILY_API_KEY` | No | — | Tavily API key for web search ([sign up](https://tavily.com/)) |
| `ENCRYPTION_SECRET` | Recommended | — | 32+ char secret for AES-256-GCM encryption of user API keys |
| `PORT` | No | `3005` | Server port |
| `DAILY_MESSAGE_LIMIT` | No | `500` | Free tier daily messages per user |
| `MESSAGE_COOLDOWN_MS` | No | `2000` | Cooldown between messages in ms |
| `TTS_SERVER_URL` | No | `http://127.0.0.1:5000` | TTS Python sidecar URL |

### Supported LLM Models

**Gemini** (default):
- `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`

**Groq** (alternative):
- `llama-3.1-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `gemma2-9b-it`

Users can bring their own API keys via the Settings UI to bypass rate limits.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Three.js, @react-three/fiber, @pixiv/three-vrm, Tailwind CSS v4, Vite 6 |
| **Backend (Node)** | Express 4, SQLite (sql.js), multer |
| **Desktop** | Electron 34, electron-builder 26, NSIS installer |
| **AI** | Google Generative AI SDK, Groq API (OpenAI-compatible) |
| **TTS (Python)** | Kokoro-ONNX, FastAPI, scipy/numpy audio processing |
| **Desktop Agent** | Gemini Vision, pyautogui, mss (screen capture) |
| **Icons** | Lucide React |

---

## Project Structure

```
Waifu/
├── client/                # React frontend (Vite)
│   ├── src/
│   │   ├── animations/    # 18 animation/materials hooks
│   │   │   ├── useAnimator.js         # Central animation driver
│   │   │   ├── useExpressionTextures.js # Blush/sweat/eye overlays
│   │   │   ├── useMaterialFix.js      # Burnt/black skin auto-fix
│   │   │   ├── useRenderQueue.js      # 5-layer depth sorting
│   │   │   ├── useSpringBonePresets.js # Hair/clothing physics
│   │   │   ├── useVRMColliders.js     # Collision detection
│   │   │   ├── useEmissiveGlow.js     # Glow effects
│   │   │   ├── useRimLighting.js      # Rim light shader
│   │   │   ├── useColorSpace.js       # Color management
│   │   │   ├── useWindowAnchor.js     # Smooth window transitions
│   │   │   ├── useVRMA.js             # VRMA playback
│   │   │   ├── ExpressionBlendQueue.js
│   │   │   ├── ExpressionCalibrationMap.js
│   │   │   ├── ExpressionProxy.js
│   │   │   ├── LookAtController.js
│   │   │   ├── boneMapping.js
│   │   │   ├── useBuiltinAnimations.js
│   │   │   └── usePhysicsCollision.js
│   │   ├── components/
│   │   │   ├── Avatar/        # 3D VRM rendering (Three.js)
│   │   │   ├── Chat/          # Chat, messages, input, images, screen share
│   │   │   ├── Settings/      # 14+ settings tab components
│   │   │   ├── SetupWizard/   # Multi-step first-run wizard
│   │   │   └── Sidebar/       # Conversation sidebar + theme toggle
│   │   ├── hooks/             # useChat, useTTS, useShortcuts, useToggles
│   │   ├── contexts/          # Language/i18n, Toast notifications
│   │   └── utils/api.js       # API client
│   └── public/
├── server/                   # Express API backend (port 3005)
│   └── src/
│       ├── routes/            # chat, conversations, settings, tts, stt
│       │                      # avatars, setup, animations, agent
│       ├── services/          # gemini, groq, memory, search, imageSearch
│       │                      # personality, animationResolver, summarize
│       ├── middleware/        # Rate limiting
│       ├── config/            # Database (sql.js, auto-migration, atomic transactions)
│       └── utils/             # crypto, paths, responseParser
├── electron/                  # Electron main process
│   └── main.js                # Window creation, TTS sidecar, auto-updater
├── python/                    # Python sidecar (port 5000)
│   ├── server.py              # FastAPI — TTS + STT + emotions
│   ├── tts_manager.py         # Kokoro ONNX engine with LRU cache
│   ├── audio_processor.py     # Post-processing (pitch, reverb, EQ)
│   ├── text_processor.py      # Markdown stripping, emotion text transforms
│   ├── emotion_presets.py     # 8 emotional voice presets
│   └── desktop_agent.py       # Gemini Vision autonomous agent (port 5001)
├── tools/                     # VRM animation toolchain
│   ├── fbx_to_vrma.mjs        # FBX → VRMA converter
│   ├── fix_vrma.mjs           # VRMA fixer
│   ├── debug_vrma.mjs         # VRMA inspector
│   ├── gen_idle.mjs           # Idle animation generator
│   └── test_load_vrma.mjs     # VRMA loader test
├── scripts/                   # BVH batch processing
│   ├── convert_bvh_to_vrma.mjs
│   ├── fix_bvh_hierarchy.py
│   └── fix_idle_arms.py
├── models.json
├── RELEASE_NOTES.md
└── package.json               # Root (Electron + build scripts)
```

---

## License

MIT License. Created with ❤️ for the AI community.
