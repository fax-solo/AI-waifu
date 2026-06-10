## v1.1.0

### Major Features

- **Desktop Companion Mode (DCM)** — Autonomous desktop agent with Gemini Vision screen understanding. AI can see your screen, move the mouse, and type to assist you directly.
- **Advanced Animation Engine** — Complete rewrite of animation system: VRMA format replaces legacy BVH. Look-at controller, blink system, and expression blend queue for natural motion.
- **Expression Texture System** — Dynamic blush, sweat, eye replacement, and viseme mouth shapes composited on any VRM model's UV map.
- **Material Fix Engine** — Auto-detects burnt/black skin from misassigned lightmap/AO/normal maps and restores proper diffuse textures.
- **Render Queue System** — 5-layer depth sorting (Skin → Overlays → Cutout → Eyes → Mouth) for correct rendering on all models.
- **Spring Bone Presets** — Configurable physics presets for hair, clothing, and accessories.
- **Emotional TTS** — 8 emotion presets (happy, sad, excited, angry, shy, calm, surprised, affectionate) with pitch shift, reverb, EQ, and energy boost.
- **AI-Driven Image Search** — AI can search DuckDuckGo Images and display results in a thumbnail gallery with lightbox.
- **Screen Sharing** — AI can request real-time screen captures. Integrated with DCM.
- **Conversation Summarization** — Long conversations are auto-summarized using Gemini/Groq for efficient memory.
- **Atomic Database Transactions** — Data integrity guarantee for all database operations.
- **On-Demand Avatar Gallery** — Avatars downloaded on first use instead of bundled (~168 MB smaller installer).
- **Setup Wizard** — New multi-step wizard with download progress, environment checking, and results summary.
- **Toast Notifications** — Auto-dismissing success/error/info notification system.
- **Error Boundary** — Graceful error handling preventing full-app crashes.

### AI & Memory

- Enhanced memory extraction with deeper context analysis
- Smarter personality system with fully customizable companion prompts
- Response parser handles mixed JSON/emotion-tag AI output
- Toggle system for AI-driven image search, screen share, and STT control

### Animation & Visual

- Emissive glow shader for accent effects
- Rim lighting shader for improved model definition
- Color space management for accurate rendering
- Window anchor damping for smooth window transitions
- VRMA animation toolchain (FBX→VRMA converter, debugger, fixer)

### Python Sidecar

- `server.py` replaces `tts_server.py` — unified FastAPI with TTS, STT, emotion endpoints
- Audio post-processor with scipy/numpy signal processing
- Text pre-processor with emotion-specific transformations
- Emotion presets with voice blends and audio parameters
- Desktop agent server for autonomous mode (port 5001)

### Fixes

- Burnt/black skin textures on model load now auto-detected and fixed
- VRM collider responsiveness improved (2x radius scaling)
- TTS settings (speed, pitch, volume) properly persist
- LLM provider selection persists correctly across restarts
- TTS health check no longer leaks connections
- Database force-save after settings writes
- Toggle type mismatch in settings fixed

### Smaller Installer

- On-demand gallery downloads shave ~168 MB from installer
- Excluded runtime data (avatars, animations, gallery) from .exe
