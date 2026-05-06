import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine if we are running in Electron (packaged or dev)
const isElectron = !!process.versions.electron;

// Determine the database path. 
const appDataPath = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.local', 'share'));
const DB_NAME = 'waifu.db';
const APP_NAME = 'WaifuAI';

// Use AppData for persistence in Electron, fallback to local data dir for standalone Node dev
const DB_PATH = isElectron
  ? path.join(appDataPath, APP_NAME, DB_NAME)
  : path.join(__dirname, '..', '..', 'data', DB_NAME);

console.log(`[Database] Using path: ${DB_PATH}`);

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Initialize sql.js ─────────────────────────────────────────

let db;

async function initDb() {
  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT DEFAULT 'User',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT DEFAULT 'New Chat',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS companion_settings (
      user_id TEXT PRIMARY KEY,
      name TEXT DEFAULT 'Aria',
      tone TEXT DEFAULT 'cute, friendly, emotional',
      personality TEXT DEFAULT 'You are a loving and caring companion who deeply cares about the user.',
      backstory TEXT DEFAULT 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
      custom_api_key_encrypted TEXT,
      tts_enabled INTEGER DEFAULT 1,
      tts_voice TEXT DEFAULT 'af_bella',
      audio_input_device TEXT DEFAULT 'default',
      audio_output_device TEXT DEFAULT 'default',
      tts_device TEXT DEFAULT 'cpu',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      search_count INTEGER DEFAULT 0,
      last_message_at DATETIME,
      PRIMARY KEY (user_id, date)
    );
  `);

  // Migration: Add missing columns for existing databases
  const tableInfo = db.prepare('PRAGMA table_info(companion_settings)');
  const existingCols = [];
  while (tableInfo.step()) {
    existingCols.push(tableInfo.getAsObject().name);
  }
  tableInfo.free();

  // Check rate_limits columns too
  const rateLimitInfo = db.prepare('PRAGMA table_info(rate_limits)');
  const rateLimitCols = [];
  while (rateLimitInfo.step()) {
    rateLimitCols.push(rateLimitInfo.getAsObject().name);
  }
  rateLimitInfo.free();

  const requiredCols = [
    { table: 'companion_settings', name: 'tts_enabled', type: 'INTEGER DEFAULT 1' },
    { table: 'companion_settings', name: 'tts_voice', type: 'TEXT DEFAULT "af_bella"' },
    { table: 'companion_settings', name: 'audio_input_device', type: 'TEXT DEFAULT "default"' },
    { table: 'companion_settings', name: 'audio_output_device', type: 'TEXT DEFAULT "default"' },
    { table: 'companion_settings', name: 'tts_device', type: 'TEXT DEFAULT "cpu"' },
    { table: 'companion_settings', name: 'tts_engine', type: 'TEXT DEFAULT "onnx"' },
    { table: 'rate_limits', name: 'search_count', type: 'INTEGER DEFAULT 0' }
  ];

  let migrationsApplied = false;
  for (const col of requiredCols) {
    const checkCols = col.table === 'companion_settings' ? existingCols : rateLimitCols;
    if (!checkCols.includes(col.name)) {
      console.log(`[Database] Migrating: Adding ${col.name} to ${col.table}...`);
      try {
        db.run(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.type}`);
        migrationsApplied = true;
      } catch (err) {
        console.error(`[Database] Migration failed for ${col.name}:`, err);
      }
    }
  }

  if (migrationsApplied) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    console.log('[Database] Migrations persisted successfully.');
  }

  // Create indexes (ignore if already exist)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)'); } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)'); } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id)'); } catch {}

  saveDb();
  return db;
}

// ─── Persistence helper ─────────────────────────────────────────

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Auto-save every 10 seconds
setInterval(saveDb, 10000);

// ─── Wrapper to provide a synchronous-looking API ───────────────

/**
 * sql.js uses a different API than better-sqlite3.
 * This wrapper provides helper methods that match the patterns
 * used throughout the codebase.
 */
const dbWrapper = {
  _ready: false,
  _db: null,

  async init() {
    this._db = await initDb();
    this._ready = true;
    return this;
  },

  /**
   * Returns a prepared-statement-like object with .run(), .get(), .all() methods.
   */
  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        self._db.run(sql, params);
        saveDb();
        return { changes: self._db.getRowsModified() };
      },
      get(...params) {
        const stmt = self._db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const results = [];
        const stmt = self._db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
    };
  },

  /**
   * Execute raw SQL (for multi-statement setup scripts)
   */
  exec(sql) {
    this._db.run(sql);
    saveDb();
  },
};

// Initialize the database
await dbWrapper.init();

export default dbWrapper;
