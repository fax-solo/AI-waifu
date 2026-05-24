# Waifu AI — Agent Guide

## Quick start

```bash
npm install && npm run install:all   # install all deps
npm run download:models              # download TTS model files
cp server/.env.example server/.env   # configure API keys
npm run dev                          # run server + client + Electron concurrently
```

## Project structure

```
Waifu/
├── client/          # React 19 + Three.js + VRM frontend (Vite 6, Tailwind v4)
│   ├── src/
│   │   ├── App.jsx              # Root layout, connects all subsystems
│   │   ├── components/Avatar/   # 3D VRM rendering via @react-three/fiber
│   │   ├── components/Chat/     # Chat window, messages, input
│   │   ├── components/Settings/ # 14 settings tabs
│   │   ├── components/Setup/    # First-run wizard
│   │   ├── hooks/               # useChat, useTTS, useShortcuts
│   │   ├── contexts/            # Language/i18n context (en + ar)
│   │   └── utils/api.js         # API client, manages x-user-id
│   └── build.mjs                # Custom Vite build (bypasses esbuild parsing on Node 26)
├── server/          # Express 4 + SQLite backend (port 3005)
│   └── src/
│       ├── index.js             # Entrypoint: mounts all routes
│       ├── routes/              # chat, conversations, settings, tts, stt, avatars, setup, animations
│       ├── services/            # gemini, groq, memory, search, personality, animationResolver
│       ├── middleware/          # rateLimit
│       ├── config/database.js   # sql.js wrapper, auto-migration, auto-save every 10s
│       └── utils/crypto.js      # AES-256-GCM encryption
├── electron/        # Electron 34 main process
│   ├── main.js                 # Window creation, TTS sidecar spawn, GPU fix
│   └── preload.cjs             # Context bridge
├── python/          # Python sidecar (TTS/STT)
│   ├── tts_server.py           # FastAPI for Kokoro TTS on port 5000
│   └── stt_server.py           # Speech-to-text
└── models.json      # URLs for TTS/model downloads
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Concurrently runs server, Vite, and Electron |
| `npm run dev:server` | Express on `localhost:3005` |
| `npm run dev:client` | Vite on `localhost:5173` |
| `npm run dev:electron` | Electron loading from Vite (waits for port 5173) |
| `npm run build:client` | Builds React app via `client/build.mjs` |
| `npm run build:desktop` | Models → build client → electron-builder (NSIS .exe) |
| `npm run download:models` | Downloads TTS models from `models.json` |

No test, lint, or typecheck scripts exist. Ad-hoc test scripts live in `server/src/` and project root.

## Architecture notes

- **Server port**: defaults to `3005` (the `.env.example` says `3001` but runtime default is `3005`).
- **Vite proxy**: forwards `/api`, `/uploads`, `/gallery` to `localhost:3005`.
- **API auth**: user identified by `x-user-id` header — auto-generated UUID, stored in localStorage as `waifu-user-id`.
- **Database**: SQLite via sql.js. Path depends on context:
  - Dev (standalone Node): `server/data/waifu.db`
  - Electron: `~/.local/share/WaifuAI/waifu.db` (Linux) / `%APPDATA%/WaifuAI/waifu.db` (Windows)
  - Auto-migrates missing columns on startup. Auto-saves every 10s.
- **TTS sidecar**: Python FastAPI on port 5000, auto-started by `electron/main.js`. NVIDIA CUDA lib injection on Linux (restarts process).
- **Electron GPU fix** (Linux): `--ozone-platform=x11 --in-process-gpu` — required for NVIDIA + Wayland.
- **Build quirk**: `build.mjs` calls Vite's JS API directly — the CLI config-parsing step crashes on Node 26.
- **i18n**: English + Arabic with RTL support in `client/src/translations/`.
- **Client loads via `file:` protocol** in production — API client detects this and sets base URL to `http://127.0.0.1:3005`.
- **Animation system**: BVH files in `server/data/animations/body/` resolved by `animationResolver.js` based on AI response sentiment + tags.
- **Auto-updater**: `electron-updater` with GitHub releases — triggered from settings UI via IPC.

## Conventions

- ES modules everywhere (`"type": "module"` in all `package.json`).
- No TypeScript; plain JS with JSDoc.
- Tailwind CSS v4 (no `tailwind.config.js`).
- Python venv managed by the app itself (setup wizard bootstraps it).


# Agent Directives & Skills

- Load global skill: `~/.agents/skills/web-design-guidelines`
- Load global skill: `~/.agents/skills/vercel-react-best-practices`

## UI/UX Rules
- Strictly follow the core principles inside the linked `web-design-guidelines` pack for layout scaling, typography tokens, and visual contrast.