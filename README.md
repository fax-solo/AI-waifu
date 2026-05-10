# ✨ Waifu AI — Your Premium 3D Companion

A state-of-the-art AI companion application featuring a highly interactive **3D VRM Avatar**, multi-model intelligence (**Gemini & Groq**), ultra-fast **Text-to-Speech**, and a beautiful, resizable desktop interface.

![Waifu AI Companion](https://img.shields.io/badge/Powered%20by-Gemini%20%26%20Groq-orange?style=for-the-badge)
![Physics](https://img.shields.io/badge/Physics-Premium-magenta?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue?style=for-the-badge)

## 🌟 Key Features

### 🎭 Interactive 3D Avatar (VRM)
- **Natural Motion**: Custom physics engine with inertial weight shifting, spine counter-rotation, and procedural finger curling.
- **Smart Expressions**: AI-driven facial expressions (happy, sad, angry, surprised, relaxed) that sync with the conversation.
- **Intelligent Blinking**: Automatic blinking logic that respects active expressions to prevent eye clipping.
- **Custom Avatar Library**: Upload your own `.vrm` files and customize your companion's appearance.

### 🧠 Advanced Intelligence
- **Multi-LLM Support**: Toggle between **Google Gemini (3.1 Flash-Lite)** and **Groq (Llama 3.1 70B, Mixtral)** for lightning-fast responses.
- **Smart Web Search**: Real-time information retrieval via Tavily for up-to-date answers.
- **Memory System**: Remembers your preferences, name, and history across sessions.
- **Privacy First**: Secure, encrypted storage for your custom API keys.

### 🎙️ Immersive Voice
- **High-Quality TTS**: Integrated Kokoro-82M engine for expressive, human-like voice synthesis.
- **Ultra-Low Latency**: Sidecar server architecture ensuring near-instant speech generation.
- **Voice Selection**: Choose from multiple premium voice models (Bella, Sarah, Nicole, etc.).

### 💻 Premium Desktop Experience
- **Resizable UI**: Modern, glassmorphism-inspired layout with adjustable sidebars.
- **Electron Powered**: Available as a standalone `.exe` for Windows.
- **Offline Core**: Core physics and UI logic run entirely on your machine.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v20+
- [Python 3.10+](https://www.python.org/) (for local TTS acceleration)
- An NVIDIA GPU (Recommended for CUDA-accelerated TTS)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/fax-solo/AI-waifu.git
   cd AI-waifu
   ```

2. **Configure Environment:**
   Copy `server/.env.example` to `server/.env` and add your API keys:
   ```env
   GEMINI_API_KEY=your_key
   GROQ_API_KEY=your_key
   TAVILY_API_KEY=your_key
   ```

3. **Install & Run (Development):**
   ```bash
   npm install
   npm run dev
   ```

---

## 🛠️ Build for Windows (.exe)

I've optimized the build pipeline for easy packaging. To create a portable Windows executable:

```bash
npm run build:desktop
```
The output will be available in the `dist-desktop/` folder as a standalone `.exe`.

---

## 📂 Project Structure

- **`/client`**: React 19 frontend with Three.js/Fiber for VRM rendering.
- **`/server`**: Node.js Express API with SQLite persistence.
- **`/electron`**: Main process management and TTS sidecar orchestration.
- **`/python`**: Kokoro-TTS server for high-speed voice synthesis.

---

## 📜 License
MIT License. Created with ❤️ for the AI community.
