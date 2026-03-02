import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Database } from "bun:sqlite";

let db: Database;

const generateEmbeddingMock = mock(async (text: string) => [
  text.length,
  text.length > 0 ? 1 : 0,
  0.5,
  0.25,
]);

mock.module("../../../src/core/memory/database", () => ({
  initializeDatabase: () => db,
  getDatabase: () => db,
  closeDatabase: () => {
    if (db) db.close();
  },
}));

mock.module("../../../src/core/memory/embeddings", () => ({
  EMBEDDING_MODEL: "test-embedding-model",
  generateEmbedding: generateEmbeddingMock,
  cosineSimilarity: (vecA: number[], vecB: number[]) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  },
}));

const manager = await import("../../../src/core/memory/manager");

function createSchema() {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE long_term_memory (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      embedding_model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source_session_id TEXT,
      source_message_id TEXT,
      metadata TEXT
    );
  `);
  db.exec(`
    CREATE TABLE working_scratchpad (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
  `);
  db.exec(`
    CREATE TABLE session_context (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT,
      total_tokens INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      tokens INTEGER DEFAULT 0,
      embedding BLOB,
      FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
  `);
  db.exec(`
    CREATE TABLE memory_links (
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
  db.exec(`
    CREATE TABLE chat_history_rag (
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
}

describe("memory manager", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    createSchema();
    generateEmbeddingMock.mockClear();
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    mock.restore();
  });

  it("stores and links memories while skipping invalid linked IDs", async () => {
    const target = await manager.storeMemory("prefs", "TypeScript preferred");
    await manager.storeMemory("profile", "User named Venus", undefined, {
      linkedIds: [target.id, target.id, "", "missing-id"],
      metadata: { kind: "identity" },
      source_session_id: "s1",
      source_message_id: "m1",
    });

    const links = manager.getAllMemoryLinks();
    expect(links.length).toBe(1);
    expect(links[0].target_id).toBe(target.id);
  });

  it("queries, updates, and deletes memories", async () => {
    const m1 = await manager.storeMemory("project", "Build tests for Venus");
    await manager.storeMemory("project_plan", "Milestones and timeline");

    expect(manager.queryMemoryByTopic("project").length).toBeGreaterThanOrEqual(2);
    expect(manager.getMemoryById(m1.id)?.id).toBe(m1.id);
    expect(manager.getMemoryById("nope")).toBeNull();

    const updated = await manager.updateMemory(m1.id, "Build strict tests");
    expect(updated?.content).toBe("Build strict tests");
    expect(await manager.updateMemory("unknown", "text")).toBeNull();

    expect(manager.deleteMemory(m1.id)).toBe(true);
    expect(manager.deleteMemory("missing")).toBe(false);
    expect(manager.deleteMemoriesByTopic("project_plan")).toBe(1);
  });

  it("supports semantic memory search and topics", async () => {
    await manager.storeMemory("alpha", "aaaaaaaa");
    await manager.storeMemory("beta", "bbbbb");

    expect((await manager.queryMemoryByVector("search-term", 10, -1)).length).toBeGreaterThan(0);
    expect(await manager.queryMemoryByVector("search-term", 5, 1.1)).toEqual([]);

    const topics = manager.getAllTopics();
    expect(topics.includes("alpha")).toBe(true);
    expect(topics.includes("beta")).toBe(true);
  });

  it("manages scratchpad and session context", async () => {
    const now = Date.now();
    manager.storeScratchpad("temporary", now - 1000);
    await new Promise((resolve) => setTimeout(resolve, 2));
    manager.storeScratchpad("current");
    expect(manager.getScratchpad()?.content).toBe("current");
    expect(manager.pruneExpiredScratchpad()).toBe(1);
    expect(manager.clearScratchpad()).toBe(1);
    expect(manager.getScratchpad()).toBeNull();

    manager.storeSessionContext("s1", "mode", "chat");
    await new Promise((resolve) => setTimeout(resolve, 2));
    manager.storeSessionContext("s1", "mode", "command");
    manager.storeSessionContext("s1", "theme", "orange");
    expect(manager.getSessionContextValue("s1", "mode")).toBe("command");
    expect(manager.getSessionContextValue("s1", "none")).toBeNull();
    expect(manager.getSessionContext("s1")).toEqual({ mode: "command", theme: "orange" });
    expect(manager.clearSessionContext("s1")).toBe(3);
  });

  it("handles chat sessions and chat messages", () => {
    const session = manager.createChatSession("A", "model-x");
    expect(manager.getChatSessions().length).toBe(1);
    manager.addChatMessage({
      session_id: session.id,
      role: "user",
      content: "hello",
      type: "text",
      tokens: 2,
    });
    expect(manager.getChatMessages(session.id).length).toBe(1);
    manager.updateChatSession(session.id, { title: "Renamed", total_tokens: 20 });
    const updated = manager.getChatSessions()[0];
    expect(updated.title).toBe("Renamed");
    expect(updated.total_tokens).toBe(20);
    expect(manager.deleteChatSession(session.id)).toBe(true);
    expect(manager.deleteChatSession("missing")).toBe(false);
  });

  it("links/unlinks memory nodes and validates IDs", async () => {
    const a = await manager.storeMemory("a", "A");
    const b = await manager.storeMemory("b", "B");
    const c = await manager.storeMemory("c", "C");

    manager.linkMemories(a.id, b.id, "related_to", 0.8);
    manager.linkMemories(c.id, a.id, "depends_on", 1);
    const linked = manager.getLinkedMemories(a.id);
    expect(linked.some((l) => l.direction === "outgoing")).toBe(true);
    expect(linked.some((l) => l.direction === "incoming")).toBe(true);
    expect(manager.unlinkMemories(a.id, b.id)).toBe(true);
    expect(manager.unlinkMemories(a.id, b.id)).toBe(false);
    expect(() => manager.linkMemories("missing", b.id, "x")).toThrow();
    expect(() => manager.linkMemories(a.id, "missing", "x")).toThrow();
  });

  it("modifies memories and reports stats", async () => {
    const m = await manager.storeMemory("old_topic", "old");
    const changed = await manager.modifyMemory(m.id, {
      content: "new content",
      topic: "new_topic",
      metadata: { priority: "high" },
    });
    expect(changed?.topic).toBe("new_topic");
    expect(await manager.modifyMemory("missing", { topic: "x" })).toBeNull();

    manager.storeScratchpad("scratch");
    db.prepare(`
      INSERT INTO chat_history_rag (id, content, embedding, embedding_model, created_at, source_session_id, source_message_id, metadata)
      VALUES ('rag1', 'content', ?, 'test', ?, 's', 'm', '{}')
    `).run(Buffer.from(new Float32Array([1, 2, 3, 4]).buffer), Date.now());

    const stats = manager.getMemoryStats();
    expect(stats.totalMemories).toBeGreaterThan(0);
    expect(stats.totalChatHistory).toBe(1);
    expect(stats.scratchpadSize).toBe(1);
  });

  it("indexes and searches chat-history vectors", async () => {
    const vec = Buffer.from(new Float32Array([10, 1, 0.5, 0.25]).buffer);
    db.prepare(`
      INSERT INTO chat_history_rag (id, content, embedding, embedding_model, created_at, source_session_id, source_message_id, metadata)
      VALUES ('h1', 'existing context', ?, 'test', ?, 's', 'm', '{"role":"user"}')
    `).run(vec, Date.now());

    expect((await manager.queryChatHistoryByVector("abcdefghij", 3, -1)).length).toBe(1);
    expect(await manager.queryChatHistoryByVector("x", 3, 1.1)).toEqual([]);

    await manager.indexChatMessageForRAG("s1", "msg1", "user", "This message is definitely long enough.");
    const indexed = db
      .query("SELECT COUNT(*) as c FROM chat_history_rag WHERE source_message_id = 'msg1'")
      .get() as { c: number };
    expect(indexed.c).toBe(1);

    await manager.indexChatMessageForRAG("s1", "msg2", "assistant", "This should be skipped due to role.");
    await manager.indexChatMessageForRAG("s1", "msg3", "user", "short");
    const skipped = db
      .query("SELECT COUNT(*) as c FROM chat_history_rag WHERE source_message_id IN ('msg2','msg3')")
      .get() as { c: number };
    expect(skipped.c).toBe(0);
  });

  it("handles indexing errors gracefully", async () => {
    generateEmbeddingMock.mockRejectedValueOnce(new Error("embedding down"));
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    await manager.indexChatMessageForRAG(
      "s1",
      "msg-fail",
      "model",
      "This content is long enough to index.",
    );
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
