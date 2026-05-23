# Waifu AI — Your Premium 3D Companion

[![Powered by Gemini & Groq](https://img.shields.io/badge/Powered%20by-Gemini%20%26%20Groq-orange?style=for-the-badge)](https://github.com/fax-solo/AI-waifu)
[![Physics](https://img.shields.io/badge/Physics-Premium-magenta?style=for-the-badge)](https://github.com/fax-solo/AI-waifu)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge)](https://github.com/fax-solo/AI-waifu/releases)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

A state-of-the-art AI companion desktop application featuring a highly interactive **3D VRM Avatar**, multi-model intelligence (**Gemini & Groq**), ultra-fast **local Text-to-Speech** with Kokoro, and a beautiful resizable dark-themed interface.

---

## Features

- **3D VRM Avatar** — Full-body anime-style avatar with physics-driven hair, clothing, and natural motion. AI-driven facial expressions that sync with conversation.
- **Multi-Model AI** — Switch between Google Gemini (multiple models) and Groq (Llama 3, Mixtral, Gemma) for blazing-fast responses.
- **Local TTS** — High-speed voice synthesis via Kokoro ONNX/PyTorch with GPU acceleration. 11 voices across English and Japanese.
- **Speech-to-Text** — Voice input support with local speech recognition.
- **Memory System** — Your companion remembers details about you across conversations.
- **Animation System** — 107+ body animations (BVH) and 23 facial expressions triggered by conversation context.
- **Custom Avatars** — Upload your own .vrm/.glb files. Browse and download from a built-in gallery.
- **Web Search** — Real-time search via Tavily API, results injected into AI context.
- **Companion Personality** — Fully customizable name, tone, personality, and backstory.
- **Keyboard Shortcuts** — Fully rebindable shortcuts for all actions.
- **Export/Import** — Backup or transfer your settings and companion profile as JSON.
- **RTL Support** — Full Arabic language support with right-to-left layout.
- **Dark Theme** — Customizable accent color (6 colors).

---

## Quick Start (For Users)

1. **Download `WaifuAI-Setup.exe`** from the [Releases page](https://github.com/fax-solo/AI-waifu/releases).
2. **Run the installer** and follow the setup wizard.
3. On first launch, click **"Complete Setup"** — the app auto-downloads models, bootstraps Python, and configures the database.
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

Output: `dist-desktop/WaifuAI-Setup-1.0.0.exe`

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
| **Backend** | Express 4, SQLite (sql.js), multer |
| **Desktop** | Electron 34, electron-builder 26, NSIS installer |
| **AI** | Google Generative AI SDK, Groq API (OpenAI-compatible) |
| **TTS** | Kokoro-ONNX / Kokoro PyTorch, FastAPI (Python sidecar) |
| **Icons** | Lucide React |

---

## Project Structure

```
Waifu/
├── client/           # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Avatar/      # 3D VRM rendering (Three.js)
│   │   │   ├── Chat/        # Chat window, messages, input
│   │   │   ├── Settings/    # 14 settings tab components
│   │   │   ├── Setup/       # First-run setup wizard
│   │   │   └── Sidebar/     # Conversation sidebar
│   │   ├── hooks/           # useChat, useTTS, useShortcuts, useAnimator
│   │   ├── contexts/        # Language/i18n context
│   │   ├── translations/    # English + Arabic
│   │   └── utils/api.js     # API client
│   └── public/              # Icons
├── server/           # Express API backend
│   └── src/
│       ├── routes/          # REST endpoints (chat, settings, avatars, etc.)
│       ├── services/        # Gemini, Groq, memory, search, personality, animation
│       ├── middleware/      # Rate limiting
│       ├── config/          # Database setup + migrations
│       └── utils/           # AES-256-GCM encryption
├── electron/         # Electron main process
│   └── main.js
├── python/           # Python TTS/STT sidecar
│   └── tts_server.py
├── dist-desktop/     # Build output
└── package.json      # Root (Electron + build scripts)
```

---

## License

MIT License. Created with ❤️ for the AI community.
