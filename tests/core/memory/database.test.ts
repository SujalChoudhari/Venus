import { describe, expect, it } from "bun:test";
import {
  closeDatabase,
  getDatabase,
  initializeDatabase,
} from "../../../src/core/memory/database";

describe("memory database", () => {
  it("initializes schema with expected tables", () => {
    const db = initializeDatabase();
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const names = new Set(tables.map((t) => t.name));

    expect(names.has("long_term_memory")).toBe(true);
    expect(names.has("working_scratchpad")).toBe(true);
    expect(names.has("session_context")).toBe(true);
    expect(names.has("chat_sessions")).toBe(true);
    expect(names.has("chat_messages")).toBe(true);
    expect(names.has("memory_links")).toBe(true);
    expect(names.has("chat_history_rag")).toBe(true);

    db.close();
  });

  it("returns singleton database and can close/reset it", () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    expect(db1).toBe(db2);

    closeDatabase();

    const db3 = getDatabase();
    expect(db3).not.toBe(db1);
    closeDatabase();
  });
});
