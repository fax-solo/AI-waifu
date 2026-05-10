# ✨ Waifu AI — Your Premium 3D Companion

A state-of-the-art AI companion application featuring a highly interactive **3D VRM Avatar**, multi-model intelligence (**Gemini & Groq**), ultra-fast **Text-to-Speech**, and a beautiful, resizable desktop interface.

![Waifu AI Companion](https://img.shields.io/badge/Powered%20by-Gemini%20%26%20Groq-orange?style=for-the-badge)
![Physics](https://img.shields.io/badge/Physics-Premium-magenta?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge)

## 📥 One-Click Setup (For Users)

Getting started is easier than ever. You don't need to install Node.js, Python, or Git to use Waifu AI.

1.  **Download `WaifuAI-Setup.exe`** from the [Releases](https://github.com/fax-solo/AI-waifu/releases) page.
2.  **Run the file**. The app will launch and detect that a first-time setup is needed.
3.  **Click "Complete Setup"**. The app will automatically:
    *   Download the high-speed 3D models.
    *   Bootstrap its own local Python voice engine.
    *   Configure its secure local database.
4.  **Start Chatting!** Once finished, your companion will be ready to interact.

> [!TIP]
> **Windows "SmartScreen" Warning:** Because the app is not signed with a paid certificate, Windows might say "Windows protected your PC". Click **"More Info"** and then **"Run Anyway"**. The app is 100% safe and open-source!

---

## 🎭 Interactive 3D Avatar (VRM)
- **Natural Motion**: Custom physics engine with inertial weight shifting, spine counter-rotation, and procedural finger curling.
- **Smart Expressions**: AI-driven facial expressions that sync with the conversation.
- **Intelligent Blinking**: Automatic blinking logic that respects active expressions to prevent eye clipping.
- **Custom Avatar Library**: Upload your own `.vrm` files and customize your companion's appearance.

---

## 🛠️ Build for Windows (.exe)

If you are a developer and want to build the setup file yourself:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/fax-solo/AI-waifu.git
    cd AI-waifu
    ```
2.  **Install & Build:**
    ```bash
    npm install
    npm run build:desktop
    ```
The output `WaifuAI-Setup.exe` will be created in the `dist-desktop/` folder.

---

## 📂 Project Structure

- **`/client`**: React 19 frontend with Three.js/Fiber for VRM rendering.
- **`/server`**: Node.js Express API with SQLite persistence.
- **`/electron`**: Main process management and TTS sidecar orchestration.
- **`/python`**: Kokoro-TTS server for high-speed voice synthesis.

---

## 📜 License
MIT License. Created with ❤️ for the AI community.
