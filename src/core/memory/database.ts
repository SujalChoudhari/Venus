/**
 * SQLite Database Initialization & Schema
 * Uses Bun's native bun:sqlite module
 */

import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { existsSync, mkdirSync } from "fs";

const DB_PATH = join(import.meta.dir, "../../db/venus.db");

/**
 * Initialize SQLite database and create schema if needed
 */
export function initializeDatabase(): Database {
  // Ensure db directory exists
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Enable foreign keys
  db.exec("PRAGMA foreign_keys = ON;");

  // Create long_term_memory table
  db.exec(`
    CREATE TABLE IF NOT EXISTS long_term_memory (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      embedding_model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create index on topic for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_topic 
    ON long_term_memory(topic);
  `);

  // Create index on created_at for chronological queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_created_at 
    ON long_term_memory(created_at);
  `);

  // Create working_scratchpad table
  db.exec(`
    CREATE TABLE IF NOT EXISTS working_scratchpad (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
  `);

  // Create index on expiration for cleanup queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expires_at 
    ON working_scratchpad(expires_at);
  `);

  // Create session_context table
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_context (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Create index on session_id for fast session queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_session_id 
    ON session_context(session_id);
  `);

  // Create composite index for session-key lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_session_key 
    ON session_context(session_id, key);
  `);

  // Create chat_sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT,
      total_tokens INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create venus_logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS venus_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      content TEXT NOT NULL,
      role TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT
    );
  `);

  // Create chat_messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL, -- 'text', 'tool_call', 'tool_result'
      timestamp INTEGER NOT NULL,
      tokens INTEGER DEFAULT 0,
      FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_session ON chat_messages(session_id);`);

  // --- Knowledge Graph Additions ---

  // Add graph columns to long_term_memory (safe: silently fail if already exists)
  try { db.exec(`ALTER TABLE long_term_memory ADD COLUMN source_session_id TEXT;`); } catch { }
  try { db.exec(`ALTER TABLE long_term_memory ADD COLUMN source_message_id TEXT;`); } catch { }
  try { db.exec(`ALTER TABLE long_term_memory ADD COLUMN metadata TEXT;`); } catch { }

  // Add embedding column to chat_messages for conversation RAG
  try { db.exec(`ALTER TABLE chat_messages ADD COLUMN embedding BLOB;`); } catch { }

  // Create memory_links table for Knowledge Graph edges
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_links (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      strength REAL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(source_id) REFERENCES long_term_memory(id) ON DELETE CASCADE,
      FOREIGN KEY(target_id) REFERENCES long_term_memory(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_source ON memory_links(source_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_target ON memory_links(target_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ltm_session ON long_term_memory(source_session_id);`);

  // --- Chat history RAG (separated from memories) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history_rag (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      embedding BLOB,
      embedding_model TEXT,
      created_at INTEGER NOT NULL,
      source_session_id TEXT,
      source_message_id TEXT,
      metadata TEXT
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_chr_session ON chat_history_rag(source_session_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chr_created ON chat_history_rag(created_at);`);

  return db;
}

/**
 * Get singleton database instance
 */
let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = initializeDatabase();
  }
  return dbInstance;
}

/**
 * Close database connection (cleanup)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
