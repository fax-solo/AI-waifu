# ✨ Waifu — AI Companion Chat

A full-stack AI companion chat application powered by Google Gemini API. Features a customizable AI personality with memory, conversation management, and a premium dark-themed UI.

![Waifu AI Companion](https://img.shields.io/badge/Powered%20by-Gemini%20AI-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

## Features

- 🗨️ **Real-time Chat** — ChatGPT-like messaging with typing indicators
- 🧠 **Memory System** — Remembers your preferences, name, interests, and more
- 💝 **Customizable Personality** — Name, tone, backstory, and behavior settings
- 🔑 **Bring Your Own Key** — Use your own Gemini API key for unlimited messages
- 📊 **Rate Limiting** — Free tier optimization with daily message limits
- 💬 **Conversation History** — Multiple conversations stored in SQLite
- 📱 **Responsive Design** — Works on desktop and mobile
- 🌙 **Premium Dark Theme** — Glassmorphism, gradients, and micro-animations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Backend | Node.js + Express |
| Database | SQLite (sql.js) |
| AI | Google Gemini 2.0 Flash |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A free [Gemini API key](https://aistudio.google.com/app/apikey)

### 1. Clone & Setup

```bash
cd Waifu
```

### 2. Configure API Key

Edit `server/.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_key_here
```

### 3. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 4. Run the App

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
Waifu/
├── server/                     # Express backend
│   ├── .env                    # Environment variables (API key here)
│   ├── .env.example            # Template for env vars
│   ├── package.json
│   └── src/
│       ├── index.js            # Server entry point
│       ├── config/
│       │   └── database.js     # SQLite setup & schema
│       ├── middleware/
│       │   └── rateLimit.js    # Daily limits & cooldown
│       ├── routes/
│       │   ├── chat.js         # POST /api/chat
│       │   ├── conversations.js # CRUD conversations
│       │   └── settings.js     # User/companion settings
│       ├── services/
│       │   ├── gemini.js       # Gemini API client
│       │   ├── memory.js       # Memory storage & retrieval
│       │   └── personality.js  # System prompt builder
│       └── utils/
│           └── crypto.js       # AES-256-GCM encryption
│
├── client/                     # React frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css           # Full design system
│       ├── components/
│       │   ├── Chat/
│       │   │   ├── ChatWindow.jsx
│       │   │   ├── MessageBubble.jsx
│       │   │   ├── MessageInput.jsx
│       │   │   └── TypingIndicator.jsx
│       │   ├── Settings/
│       │   │   └── Settings.jsx
│       │   └── Sidebar/
│       │       └── Sidebar.jsx
│       ├── hooks/
│       │   └── useChat.js      # Chat state management
│       └── utils/
│           └── api.js          # API client
│
└── .gitignore
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send message, get AI response |
| `GET` | `/api/conversations` | List conversations |
| `POST` | `/api/conversations` | Create new conversation |
| `GET` | `/api/conversations/:id` | Get conversation + messages |
| `DELETE` | `/api/conversations/:id` | Delete conversation |
| `GET` | `/api/settings` | Get user/companion settings |
| `PUT` | `/api/settings` | Update settings |
| `POST` | `/api/settings/api-key` | Save custom API key |
| `DELETE` | `/api/settings/api-key` | Remove custom API key |
| `GET` | `/api/settings/rate-limit` | Get rate limit status |
| `GET` | `/api/settings/memories` | List stored memories |

## Customization

### Companion Personality

Edit personality through the Settings panel, or modify the default in `server/src/services/personality.js`:

```javascript
const DEFAULT_PERSONALITY = {
  name: 'Aria',
  tone: 'cute, friendly, emotional',
  personality: 'You are a loving and caring companion...',
  backstory: 'A cheerful AI companion who loves chatting...',
};
```

### Rate Limits

Configure in `server/.env`:

```env
DAILY_MESSAGE_LIMIT=50        # Messages per user per day
MESSAGE_COOLDOWN_MS=2000      # Milliseconds between messages
```

### Memory System

The AI automatically extracts and remembers:
- Your name, age, location
- Things you like/dislike
- Your job/occupation
- Favorite things
- Pets and birthdays
- General preferences

View and manage memories in Settings → Memories tab.

## Free Tier Notes

- Gemini API free tier allows ~60 requests/minute
- Default limit is 50 messages/day per user
- Users with their own API key bypass all limits
- The app uses `gemini-2.0-flash` for best free tier performance

## License

MIT
# AI-waifu
