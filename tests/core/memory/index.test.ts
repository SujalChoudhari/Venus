import { describe, expect, it } from "bun:test";
import * as memory from "../../../src/core/memory";

describe("memory index exports", () => {
  it("re-exports key database and manager APIs", () => {
    expect(memory.initializeDatabase).toBeTypeOf("function");
    expect(memory.getDatabase).toBeTypeOf("function");
    expect(memory.closeDatabase).toBeTypeOf("function");
    expect(memory.storeMemory).toBeTypeOf("function");
    expect(memory.queryMemoryByTopic).toBeTypeOf("function");
    expect(memory.createChatSession).toBeTypeOf("function");
    expect(memory.addChatMessage).toBeTypeOf("function");
    expect(memory.linkMemories).toBeTypeOf("function");
    expect(memory.indexChatMessageForRAG).toBeTypeOf("function");
  });
});
