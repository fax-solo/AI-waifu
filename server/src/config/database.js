import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

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
      summary TEXT DEFAULT '',
      last_summary_msg_count INTEGER DEFAULT 0,
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
      tts_voice TEXT DEFAULT 'default',
      audio_input_device TEXT DEFAULT 'default',
      audio_output_device TEXT DEFAULT 'default',
      tts_device TEXT DEFAULT 'cpu',
      tts_engine TEXT DEFAULT 'styletts2',
      tts_alpha REAL DEFAULT 0.3,
      tts_beta REAL DEFAULT 0.7,
      tts_diffusion_steps INTEGER DEFAULT 5,
      tts_embedding_scale REAL DEFAULT 1.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      embedding BLOB,
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

    CREATE TABLE IF NOT EXISTS vrm_models (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      pfp_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS gallery_vrm_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      pfp_path TEXT,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
  `);

  // Migration: Add missing columns for existing databases
  const tablesToCheck = ['companion_settings', 'rate_limits', 'conversations', 'user_memories'];
  const tableColumnCache = {};
  for (const t of tablesToCheck) {
    const info = db.prepare(`PRAGMA table_info(${t})`);
    const cols = [];
    while (info.step()) {
      cols.push(info.getAsObject().name);
    }
    info.free();
    tableColumnCache[t] = cols;
  }

  const requiredCols = [
    { table: 'companion_settings', name: 'tts_enabled', type: 'INTEGER DEFAULT 1' },
    { table: 'companion_settings', name: 'tts_voice', type: 'TEXT DEFAULT "default"' },
    { table: 'companion_settings', name: 'audio_input_device', type: 'TEXT DEFAULT "default"' },
    { table: 'companion_settings', name: 'audio_output_device', type: 'TEXT DEFAULT "default"' },
    { table: 'companion_settings', name: 'tts_device', type: 'TEXT DEFAULT "cpu"' },
    { table: 'companion_settings', name: 'tts_engine', type: 'TEXT DEFAULT "styletts2"' },
    { table: 'companion_settings', name: 'tts_speed', type: 'REAL DEFAULT 1.0' },
    { table: 'companion_settings', name: 'tts_pitch', type: 'REAL DEFAULT 1.0' },
    { table: 'companion_settings', name: 'tts_volume', type: 'REAL DEFAULT 1.0' },
    { table: 'companion_settings', name: 'tts_alpha', type: 'REAL DEFAULT 0.3' },
    { table: 'companion_settings', name: 'tts_beta', type: 'REAL DEFAULT 0.7' },
    { table: 'companion_settings', name: 'tts_diffusion_steps', type: 'INTEGER DEFAULT 5' },
    { table: 'companion_settings', name: 'tts_embedding_scale', type: 'REAL DEFAULT 1.0' },
    { table: 'companion_settings', name: 'llm_model', type: 'TEXT DEFAULT "gemini-2.0-flash-lite"' },
    { table: 'companion_settings', name: 'llm_provider', type: 'TEXT DEFAULT "gemini"' },
    { table: 'companion_settings', name: 'groq_api_key_encrypted', type: 'TEXT' },
    { table: 'companion_settings', name: 'shortcuts', type: 'TEXT' },
    { table: 'conversations', name: 'summary', type: 'TEXT DEFAULT ""' },
    { table: 'conversations', name: 'last_summary_msg_count', type: 'INTEGER DEFAULT 0' },
    { table: 'user_memories', name: 'embedding', type: 'BLOB' },
    { table: 'rate_limits', name: 'search_count', type: 'INTEGER DEFAULT 0' }
  ];

  let migrationsApplied = false;
  for (const col of requiredCols) {
    const checkCols = tableColumnCache[col.table] || [];
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
  },

  /**
   * Find a companion image for a VRM file in the gallery directory.
   * Searches top level files first, then subdirectories.
   */
  _findGalleryPfp(dir, baseName) {
    const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    if (!fs.existsSync(dir)) return null;

    const scanDir = (scanPath, prefix) => {
      const entries = fs.readdirSync(scanPath);
      for (const f of entries) {
        const fullPath = path.join(scanPath, f);
        if (fs.statSync(fullPath).isDirectory()) continue;
        const low = f.toLowerCase();
        if (path.parse(f).name === baseName && exts.some(e => low.endsWith(e))) {
          return `${prefix}${f}`;
        }
      }
      return null;
    };

    const top = scanDir(dir, '/gallery/');
    if (top) return top;

    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const subPath = path.join(dir, entry);
      if (fs.statSync(subPath).isDirectory()) {
        const result = scanDir(subPath, `/gallery/${entry}/`);
        if (result) return result;
      }
    }

    return null;
  },

  /**
   * Discover all gallery models (flat files + subdirectory-based).
   * Returns an array of { filePath, name }.
   */
  _discoverGalleryModels(galleryDir) {
    const models = [];
    if (!fs.existsSync(galleryDir)) return models;

    const entries = fs.readdirSync(galleryDir);
    for (const entry of entries) {
      const entryPath = path.join(galleryDir, entry);

      if (fs.statSync(entryPath).isDirectory()) {
        const subEntries = fs.readdirSync(entryPath);
        for (const sub of subEntries) {
          const low = sub.toLowerCase();
          if (low.endsWith('.vrm') || low.endsWith('.glb')) {
            models.push({
              filePath: `${entry}/${sub}`,
              name: path.parse(sub).name,
            });
          }
        }
      } else {
        const low = entry.toLowerCase();
        if (low.endsWith('.vrm') || low.endsWith('.glb')) {
          models.push({
            filePath: entry,
            name: path.parse(entry).name,
          });
        }
      }
    }

    return models;
  },

  /**
   * Seed gallery VRM models from the gallery directory.
   */
  seedGallery(galleryDir) {
    if (!fs.existsSync(galleryDir)) {
      fs.mkdirSync(galleryDir, { recursive: true });
      return;
    }

    const models = this._discoverGalleryModels(galleryDir);
    const currentPaths = new Set(models.map(m => m.filePath));

    // Remove stale DB entries whose file is no longer on disk
    const allDb = this.prepare('SELECT id, file_path FROM gallery_vrm_models').all();
    for (const entry of allDb) {
      if (!currentPaths.has(entry.file_path)) {
        this.prepare('DELETE FROM gallery_vrm_models WHERE id = ?').run(entry.id);
        console.log(`[Gallery] Removed stale entry: ${entry.file_path}`);
      }
    }

    // Sync new/changed files
    for (const m of models) {
      const existing = this.prepare('SELECT id, pfp_path, file_path, name FROM gallery_vrm_models WHERE file_path = ?').get(m.filePath);
      if (!existing) {
        const id = uuidv4();
        const pfp_path = this._findGalleryPfp(galleryDir, m.name);
        this.prepare(`
          INSERT INTO gallery_vrm_models (id, name, file_path, pfp_path, description)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, m.name, m.filePath, pfp_path, '');
        console.log(`[Gallery] Seeded gallery model: ${m.name} → ${m.filePath}`);
      } else {
        if (existing.name !== m.name) {
          this.prepare('UPDATE gallery_vrm_models SET name = ? WHERE id = ?').run(m.name, existing.id);
          console.log(`[Gallery] Renamed: ${existing.name} -> ${m.name}`);
        }
        const currentPfp = this._findGalleryPfp(galleryDir, m.name);
        if (currentPfp !== existing.pfp_path) {
          this.prepare('UPDATE gallery_vrm_models SET pfp_path = ? WHERE id = ?').run(currentPfp, existing.id);
          if (currentPfp) console.log(`[Gallery] Updated pfp for: ${m.name}`);
        }
      }
    }
  },
};

// Initialize the database
await dbWrapper.init();

export default dbWrapper;
