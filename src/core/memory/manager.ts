/**
 * Memory Manager
 * Provides clean API for long-term and working memory operations
 */

import { randomUUID } from "crypto";
import { getDatabase } from "./database";
import type {
  MemoryRecord,
  WorkingMemory,
  SessionContext,
  MemoryQuery,
  MemorySearchResult,
  ChatSession,
  ChatMessage,
  MemoryLink,
  ChatHistoryRecord,
  ChatHistorySearchResult,
} from "../../types/memory";
import {
  generateEmbedding,
  cosineSimilarity,
  EMBEDDING_MODEL,
} from "./embeddings";

/**
 * Store a new memory in long-term storage
 */
export async function storeMemory(
  topic: string,
  content: string,
  embedding?: number[],
  opts?: {
    source_session_id?: string;
    source_message_id?: string;
    metadata?: Record<string, any>;
    linkedIds?: string[];
  }
): Promise<MemoryRecord> {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  // Generate embedding if not provided
  const finalEmbedding = embedding || (await generateEmbedding(content));

  const stmt = db.prepare(`
    INSERT INTO long_term_memory 
    (id, topic, content, embedding, embedding_model, created_at, updated_at, source_session_id, source_message_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const metadataJson = opts?.metadata ? JSON.stringify(opts.metadata) : null;

  stmt.run(
    id,
    topic,
    content,
    finalEmbedding ? Buffer.from(new Float32Array(finalEmbedding).buffer) : null,
    finalEmbedding ? EMBEDDING_MODEL : null,
    now,
    now,
    opts?.source_session_id ?? null,
    opts?.source_message_id ?? null,
    metadataJson
  );

  // Auto-link to related memories if specified
  if (opts?.linkedIds) {
    for (const targetId of opts.linkedIds) {
      linkMemories(id, targetId, "related");
    }
  }

  return {
    id,
    topic,
    content,
    embedding: finalEmbedding,
    embedding_model: finalEmbedding ? EMBEDDING_MODEL : undefined,
    created_at: now,
    updated_at: now,
    source_session_id: opts?.source_session_id,
    source_message_id: opts?.source_message_id,
    metadata: metadataJson ?? undefined,
  };
}

/**
 * Query memory by topic (exact match or prefix search)
 */
export function queryMemoryByTopic(
  topic: string,
  limit: number = 10
): MemoryRecord[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, topic, content, embedding_model, created_at, updated_at
    FROM long_term_memory
    WHERE topic LIKE ? OR topic = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `);

  const results = stmt.all(`${topic}%`, topic, limit) as Array<
    Omit<MemoryRecord, "embedding">
  >;

  return results.map((row) => ({
    ...row,
    embedding: undefined,
  }));
}

/**
 * Get memory by ID
 */
export function getMemoryById(id: string): MemoryRecord | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, topic, content, embedding_model, created_at, updated_at
    FROM long_term_memory
    WHERE id = ?
  `);

  const result = stmt.get(id) as
    | (Omit<MemoryRecord, "embedding"> & { embedding_model?: string })
    | undefined;

  if (!result) return null;

  return {
    ...result,
    embedding: undefined,
  };
}

/**
 * Update existing memory
 */
export async function updateMemory(
  id: string,
  content: string,
  embedding?: number[]
): Promise<MemoryRecord | null> {
  const db = getDatabase();
  const now = Date.now();

  // Generate embedding if not provided
  const finalEmbedding = embedding || (await generateEmbedding(content));

  const stmt = db.prepare(`
    UPDATE long_term_memory
    SET content = ?, embedding = ?, embedding_model = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    content,
    finalEmbedding ? Buffer.from(new Float32Array(finalEmbedding).buffer) : null,
    finalEmbedding ? EMBEDDING_MODEL : null,
    now,
    id
  );

  return getMemoryById(id);
}

/**
 * Delete memory by ID
 */
export function deleteMemory(id: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare("DELETE FROM long_term_memory WHERE id = ?");
  const result = stmt.run(id);

  return (result.changes ?? 0) > 0;
}

/**
 * Delete all memories under a topic
 */
export function deleteMemoriesByTopic(topic: string): number {
  const db = getDatabase();

  const stmt = db.prepare("DELETE FROM long_term_memory WHERE topic = ?");
  const result = stmt.run(topic);

  return result.changes ?? 0;
}

/**
 * Semantic search using vector embeddings
 */
export async function queryMemoryByVector(
  query: string,
  limit: number = 5,
  threshold: number = 0.3
): Promise<MemorySearchResult[]> {
  const db = getDatabase();
  const queryEmbedding = await generateEmbedding(query);

  const stmt = db.prepare(`
    SELECT id, topic, content, embedding_model, embedding, created_at, updated_at
    FROM long_term_memory
    WHERE embedding IS NOT NULL
  `);

  const results = stmt.all() as Array<
    Omit<MemoryRecord, "embedding"> & { embedding: Buffer }
  >;

  const scoredResults: MemorySearchResult[] = results
    .map((row) => {
      // row.embedding is a Buffer. Float32Array needs a multiple of 4 bytes.
      // 384 floats = 1536 bytes.
      const floatCount = row.embedding.byteLength / 4;
      const vector = Array.from(
        new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          floatCount
        )
      );
      const similarity = cosineSimilarity(queryEmbedding, vector);

      return {
        ...row,
        embedding: vector,
        relevance: similarity,
      };
    })
    .filter((res) => (res.relevance ?? 0) >= threshold)
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, limit);

  return scoredResults;
}

/**
 * Get all memory topics
 */
export function getAllTopics(): string[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT DISTINCT topic
    FROM long_term_memory
    ORDER BY topic ASC
  `);

  const results = stmt.all() as Array<{ topic: string }>;
  return results.map((r) => r.topic);
}

/**
 * Store content in working scratchpad (short-term memory)
 */
export function storeScratchpad(
  content: string,
  expiresAt?: number
): WorkingMemory {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO working_scratchpad (id, content, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(id, content, now, expiresAt ?? null);

  return {
    id,
    content,
    created_at: now,
    expires_at: expiresAt,
  };
}

/**
 * Get current scratchpad content
 */
export function getScratchpad(): WorkingMemory | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, content, created_at, expires_at
    FROM working_scratchpad
    ORDER BY created_at DESC
    LIMIT 1
  `);

  return (stmt.get() as WorkingMemory) || null;
}

/**
 * Clear all scratchpad entries
 */
export function clearScratchpad(): number {
  const db = getDatabase();

  const stmt = db.prepare("DELETE FROM working_scratchpad");
  const result = stmt.run();

  return result.changes ?? 0;
}

/**
 * Clear expired scratchpad entries
 */
export function pruneExpiredScratchpad(): number {
  const db = getDatabase();
  const now = Date.now();

  const stmt = db.prepare(
    "DELETE FROM working_scratchpad WHERE expires_at IS NOT NULL AND expires_at < ?"
  );
  const result = stmt.run(now);

  return result.changes ?? 0;
}

/**
 * Store session context (key-value pairs)
 */
export function storeSessionContext(
  sessionId: string,
  key: string,
  value: string
): SessionContext {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO session_context (id, session_id, key, value, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, sessionId, key, value, now);

  return {
    id,
    session_id: sessionId,
    key,
    value,
    created_at: now,
  };
}

/**
 * Get session context value
 */
export function getSessionContextValue(
  sessionId: string,
  key: string
): string | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT value
    FROM session_context
    WHERE session_id = ? AND key = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const result = stmt.get(sessionId, key) as { value: string } | undefined;
  return result?.value ?? null;
}

/**
 * Get all context for a session
 */
export function getSessionContext(sessionId: string): Record<string, string> {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT key, value
    FROM session_context
    WHERE session_id = ?
    ORDER BY created_at DESC
  `);

  const results = stmt.all(sessionId) as Array<{ key: string; value: string }>;
  const context: Record<string, string> = {};

  for (const { key, value } of results) {
    if (!(key in context)) {
      context[key] = value; // Keep most recent value for each key
    }
  }

  return context;
}

/**
 * Clear session context
 */
export function clearSessionContext(sessionId: string): number {
  const db = getDatabase();

  const stmt = db.prepare("DELETE FROM session_context WHERE session_id = ?");
  const result = stmt.run(sessionId);

  return result.changes ?? 0;
}

/**
 * Get database statistics
 */
export function getMemoryStats(): {
  totalMemories: number;
  totalTopics: number;
  totalChatHistory: number;
  scratchpadSize: number;
  oldestMemory: number | null;
  newestMemory: number | null;
} {
  const db = getDatabase();

  const countStmt = db.prepare("SELECT COUNT(*) as count FROM long_term_memory");
  const totalMemories = ((countStmt.get() as { count: number })?.count ?? 0);

  const topicsStmt = db.prepare(
    "SELECT COUNT(DISTINCT topic) as count FROM long_term_memory"
  );
  const totalTopics = ((topicsStmt.get() as { count: number })?.count ?? 0);

  const chatHistoryStmt = db.prepare(
    "SELECT COUNT(*) as count FROM chat_history_rag"
  );
  const totalChatHistory = ((chatHistoryStmt.get() as { count: number })?.count ?? 0);

  const scratchStmt = db.prepare(
    "SELECT COUNT(*) as count FROM working_scratchpad"
  );
  const scratchpadSize = ((scratchStmt.get() as { count: number })?.count ?? 0);

  const oldestStmt = db.prepare(
    "SELECT MIN(created_at) as oldest FROM long_term_memory"
  );
  const oldestMemory =
    ((oldestStmt.get() as { oldest: number | null })?.oldest ?? null);

  const newestStmt = db.prepare(
    "SELECT MAX(created_at) as newest FROM long_term_memory"
  );
  const newestMemory =
    ((newestStmt.get() as { newest: number | null })?.newest ?? null);

  return {
    totalMemories,
    totalTopics,
    totalChatHistory,
    scratchpadSize,
    oldestMemory,
    newestMemory,
  };
}

/**
 * Create a new chat session
 */
export function createChatSession(title: string, model?: string): ChatSession {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO chat_sessions (id, title, model, total_tokens, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, title, model ?? null, 0, now, now);

  return {
    id,
    title,
    model,
    total_tokens: 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get all chat sessions
 */
export function getChatSessions(): ChatSession[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM chat_sessions ORDER BY updated_at DESC");
  return stmt.all() as ChatSession[];
}

/**
 * Get messages for a session
 */
export function getChatMessages(sessionId: string): ChatMessage[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC");
  return stmt.all(sessionId) as ChatMessage[];
}

/**
 * Add a message to a session
 */
export function addChatMessage(message: Omit<ChatMessage, "id" | "timestamp">): ChatMessage {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, type, timestamp, tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, message.session_id, message.role, message.content, message.type, now, message.tokens ?? 0);

  // Update session's updated_at
  db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(now, message.session_id);

  return {
    ...message,
    id,
    timestamp: now,
  };
}

/**
 * Update session metadata
 */
export function updateChatSession(id: string, updates: Partial<Pick<ChatSession, "title" | "total_tokens">>): void {
  const db = getDatabase();
  const now = Date.now();

  if (updates.title !== undefined) {
    db.prepare("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?").run(updates.title, now, id);
  }

  if (updates.total_tokens !== undefined) {
    db.prepare("UPDATE chat_sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?").run(updates.total_tokens, now, id);
  }
}

/**
 * Delete a chat session
 */
export function deleteChatSession(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM chat_sessions WHERE id = ?");
  const result = stmt.run(id);
  return (result.changes ?? 0) > 0;
}

// =============================================================================
// KNOWLEDGE GRAPH OPERATIONS
// =============================================================================

/**
 * Link two memories together in the graph
 */
export function linkMemories(sourceId: string, targetId: string, relationType: string, strength: number = 1.0): MemoryLink {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO memory_links (id, source_id, target_id, relation_type, strength, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sourceId, targetId, relationType, strength, now);

  return { id, source_id: sourceId, target_id: targetId, relation_type: relationType, strength, created_at: now };
}

/**
 * Get all memories linked to a given memory
 */
export function getLinkedMemories(memoryId: string): Array<MemoryRecord & { relation: string; direction: "outgoing" | "incoming" }> {
  const db = getDatabase();

  const outgoing = db.prepare(`
    SELECT m.*, ml.relation_type as relation
    FROM long_term_memory m
    JOIN memory_links ml ON ml.target_id = m.id
    WHERE ml.source_id = ?
  `).all(memoryId) as any[];

  const incoming = db.prepare(`
    SELECT m.*, ml.relation_type as relation
    FROM long_term_memory m
    JOIN memory_links ml ON ml.source_id = m.id
    WHERE ml.target_id = ?
  `).all(memoryId) as any[];

  return [
    ...outgoing.map((r: any) => ({ ...r, embedding: undefined, direction: "outgoing" as const })),
    ...incoming.map((r: any) => ({ ...r, embedding: undefined, direction: "incoming" as const })),
  ];
}

/**
 * Remove a link between two memories
 */
export function unlinkMemories(sourceId: string, targetId: string): boolean {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM memory_links WHERE source_id = ? AND target_id = ?").run(sourceId, targetId);
  return (result.changes ?? 0) > 0;
}

/**
 * Modify existing memory content, metadata, or topic
 */
export async function modifyMemory(
  id: string,
  updates: { content?: string; topic?: string; metadata?: Record<string, any> }
): Promise<MemoryRecord | null> {
  const db = getDatabase();
  const now = Date.now();

  if (updates.content) {
    const newEmbedding = await generateEmbedding(updates.content);
    db.prepare("UPDATE long_term_memory SET content = ?, embedding = ?, embedding_model = ?, updated_at = ? WHERE id = ?")
      .run(updates.content, Buffer.from(new Float32Array(newEmbedding).buffer), EMBEDDING_MODEL, now, id);
  }

  if (updates.topic) {
    db.prepare("UPDATE long_term_memory SET topic = ?, updated_at = ? WHERE id = ?").run(updates.topic, now, id);
  }

  if (updates.metadata) {
    db.prepare("UPDATE long_term_memory SET metadata = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(updates.metadata), now, id);
  }

  return getMemoryById(id);
}

/**
 * Get all links in the database (for graph visualization)
 */
export function getAllMemoryLinks(): MemoryLink[] {
  const db = getDatabase();
  return db.prepare("SELECT * FROM memory_links ORDER BY created_at DESC").all() as MemoryLink[];
}

/**
 * Semantic search in chat history RAG
 */

export async function queryChatHistoryByVector(
  query: string,
  limit: number = 5,
  threshold: number = 0.3
): Promise<ChatHistorySearchResult[]> {
  const db = getDatabase();
  const queryEmbedding = await generateEmbedding(query);

  const stmt = db.prepare(`
    SELECT id, content, embedding_model, embedding, created_at, source_session_id, source_message_id, metadata
    FROM chat_history_rag
    WHERE embedding IS NOT NULL
  `);

  const results = stmt.all() as Array<
    Omit<ChatHistoryRecord, "embedding"> & { embedding: Buffer }
  >;

  const scoredResults: ChatHistorySearchResult[] = results
    .map((row) => {
      const floatCount = row.embedding.byteLength / 4;
      const vector = Array.from(
        new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          floatCount
        )
      );
      const similarity = cosineSimilarity(queryEmbedding, vector);

      return {
        ...row,
        embedding: vector,
        relevance: similarity,
      };
    })
    .filter((res) => (res.relevance ?? 0) >= threshold)
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, limit);

  return scoredResults;
}

// =============================================================================
// CHAT RAG AUTO-INDEXING
// =============================================================================

/**
 * Index a chat message into chat_history_rag for RAG.
 * Only indexes user+model text messages of sufficient length.
 */
export async function indexChatMessageForRAG(
  sessionId: string,
  messageId: string,
  role: string,
  content: string
): Promise<void> {
  // Only index meaningful text (skip short replies and tool calls)
  if (content.length < 20) return;
  if (role !== "user" && role !== "model") return;

  try {
    const db = getDatabase();
    const id = messageId || randomUUID();
    const now = Date.now();
    const embedding = await generateEmbedding(content);

    const stmt = db.prepare(`
      INSERT INTO chat_history_rag 
      (id, content, embedding, embedding_model, created_at, source_session_id, source_message_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      content,
      embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
      embedding ? EMBEDDING_MODEL : null,
      now,
      sessionId,
      messageId,
      JSON.stringify({ role, indexed_at: now })
    );
  } catch (error) {
    console.error("Failed to index chat message:", error);
    // Silently fail — indexing is best-effort
  }
}
