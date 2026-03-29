import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'bestie.db');

// Ensure data directory exists
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS memory_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    rounds_start INTEGER NOT NULL,
    rounds_end INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    content_text TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_summaries(session_id);
  CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);
`);

console.log('[DB] SQLite database initialized at', DB_PATH);

// --- Chat Sessions ---
export function getAllSessions() {
  return db.prepare('SELECT * FROM chat_sessions ORDER BY created_at DESC').all();
}

export function getSession(id) {
  return db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id);
}

export function createSession(id, title, createdAt) {
  db.prepare('INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)').run(id, title, createdAt);
}

export function updateSessionTitle(id, title) {
  db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(title, id);
}

export function deleteSession(id) {
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
}

export function archiveSession(id, archived) {
  db.prepare('UPDATE chat_sessions SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
}

// --- Messages ---
export function getMessages(sessionId) {
  return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId);
}

export function addMessage(id, sessionId, role, content, timestamp) {
  db.prepare('INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)').run(id, sessionId, role, content, timestamp);
}

export function updateMessage(id, content) {
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
}

export function deleteMessage(id) {
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

export function deleteMessagesAfter(sessionId, timestamp) {
  db.prepare('DELETE FROM messages WHERE session_id = ? AND timestamp > ?').run(sessionId, timestamp);
}

export function getMessageCount(sessionId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?').get(sessionId);
  return row.count;
}

export function clearSessionMessages(sessionId) {
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
}

// --- Memory Summaries ---
export function getSummaries(sessionId) {
  return db.prepare('SELECT * FROM memory_summaries WHERE session_id = ? ORDER BY rounds_start ASC').all(sessionId);
}

export function addSummary(sessionId, summary, roundsStart, roundsEnd) {
  db.prepare('INSERT INTO memory_summaries (session_id, summary, rounds_start, rounds_end) VALUES (?, ?, ?, ?)').run(sessionId, summary, roundsStart, roundsEnd);
}

export function clearSummaries(sessionId) {
  db.prepare('DELETE FROM memory_summaries WHERE session_id = ?').run(sessionId);
}

// --- Documents ---
export function getDocuments(sessionId) {
  return db.prepare('SELECT * FROM documents WHERE session_id = ? ORDER BY uploaded_at ASC').all(sessionId);
}

export function getDocument(id) {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}

export function addDocument(id, sessionId, filename, fileType, contentText) {
  db.prepare('INSERT INTO documents (id, session_id, filename, file_type, content_text) VALUES (?, ?, ?, ?, ?)').run(id, sessionId, filename, fileType, contentText);
}

export function deleteDocument(id) {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
}

// --- Forget History ---
export function forgetSession(sessionId) {
  clearSessionMessages(sessionId);
  clearSummaries(sessionId);
  console.log(`[DB] Forgot all history for session ${sessionId}`);
}

export default db;
