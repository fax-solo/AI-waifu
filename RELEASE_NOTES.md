## What's New

- **Settings overhaul** — Split into 14 organized tabs with global save, unsaved changes warning, and search.
- **Export/Import** — Backup or transfer your companion profile and settings as JSON.
- **About & Data Management** — App info, credits, clear memories/conversations.
- **Accent colors** — Choose from 6 accent colors (saved per-device).
- **Shortcut conflict detection** — Warns if a shortcut conflicts with browser defaults.
- **Star taskbar icon** — new icon for the .exe.

## Fixes

- TTS settings (speed, pitch, volume) now properly save and load.
- LLM provider selection (Gemini/Groq) persists correctly.
- TTS health check no longer leaks connections on settings close.
- App version now reads from `package.json` instead of being hardcoded.

## Smaller installer

- Excluded runtime data (avatars, animations, gallery) from the .exe — ~650MB smaller.
