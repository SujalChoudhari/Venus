import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const storeMemoryMock = mock(async () => ({ id: "id" }));
const queryMemoryByVectorMock = mock(async () => []);
const linkMemoriesMock = mock(() => ({ id: "link-id" }));
const getLinkedMemoriesMock = mock(() => []);
const modifyMemoryMock = mock(async () => null);
const queryChatHistoryByVectorMock = mock(async () => []);

const memoryMockFactory = () => ({
  initializeDatabase: mock(() => null),
  getDatabase: mock(() => null),
  closeDatabase: mock(() => null),
  storeMemory: storeMemoryMock,
  queryMemoryByTopic: mock(() => []),
  queryMemoryByVector: queryMemoryByVectorMock,
  createChatSession: mock(() => ({ id: "s" })),
  addChatMessage: mock(() => ({ id: "m" })),
  indexChatMessageForRAG: mock(async () => {}),
  linkMemories: linkMemoriesMock,
  getLinkedMemories: getLinkedMemoriesMock,
  modifyMemory: modifyMemoryMock,
  queryChatHistoryByVector: queryChatHistoryByVectorMock,
});
mock.module("../../../src/core/memory", memoryMockFactory);
mock.module("../../../src/core/memory/index.ts", memoryMockFactory);

const ops = await import("../../../src/core/mcp/operations");

describe("mcp operations", () => {
  let cwdBefore = "";
  let sandboxDir = "";

  beforeEach(async () => {
    cwdBefore = process.cwd();
    sandboxDir = await mkdtemp(join(tmpdir(), "venus-ops-"));
    process.chdir(sandboxDir);
    storeMemoryMock.mockClear();
    queryMemoryByVectorMock.mockClear();
    linkMemoriesMock.mockClear();
    getLinkedMemoriesMock.mockClear();
    modifyMemoryMock.mockClear();
    queryChatHistoryByVectorMock.mockClear();
  });

  afterEach(async () => {
    process.chdir(cwdBefore);
    await rm(sandboxDir, { recursive: true, force: true });
  });

  afterAll(() => {
    mock.restore();
  });

  it("reads/writes/lists and handles io errors", async () => {
    const wrote = await ops.writeFileText({ path: "a.txt", content: "hello" });
    expect(wrote.content[0].text).toContain("Successfully wrote");

    const read = await ops.readFileText({ path: "a.txt" });
    expect(read.content[0].text).toBe("hello");

    const readErr = await ops.readFileText({ path: "missing.txt" });
    expect(readErr.isError).toBe(true);

    const writeErr = await ops.writeFileText({
      path: "missing/out.txt",
      content: "x",
    });
    expect(writeErr.isError).toBe(true);

    const listed = await ops.listFiles({ path: "." });
    expect(listed.content[0].text).toContain("a.txt");

    const listErr = await ops.listFiles({ path: "missing-dir" });
    expect(listErr.isError).toBe(true);
  });

  it("stores memory and surfaces errors", async () => {
    storeMemoryMock
      .mockResolvedValueOnce({ id: "id1" })
      .mockResolvedValueOnce({ id: "id2" });

    const ok = await ops.storeMemoryTool(
      {
        memories: [{ content: "a", topic: "t", linked_ids: ["l"] }, { content: "b" }],
      },
      { sessionId: "s1" },
    );
    expect(ok.content[0].text).toContain("Successfully stored 2 memories");

    storeMemoryMock.mockRejectedValueOnce(new Error("db fail"));
    const err = await ops.storeMemoryTool({ memories: [{ content: "x" }] });
    expect(err.isError).toBe(true);
  });

  it("searches memory/chat and handles empty + error flows", async () => {
    queryMemoryByVectorMock.mockResolvedValueOnce([]);
    const none = await ops.searchMemoryTool({ query: "x" });
    expect(none.content[0].text).toContain("No relevant memories");

    queryMemoryByVectorMock.mockResolvedValueOnce([
      { id: "m1", topic: "p", relevance: 0.5, content: "txt" },
    ]);
    const some = await ops.searchMemoryTool({ query: "x", limit: 1 });
    expect(some.content[0].text).toContain("Found 1 memories");

    queryMemoryByVectorMock.mockRejectedValueOnce(new Error("vector fail"));
    const searchErr = await ops.searchMemoryTool({ query: "x" });
    expect(searchErr.isError).toBe(true);

    queryChatHistoryByVectorMock.mockResolvedValueOnce([]);
    const chatNone = await ops.searchChatHistoryTool({ query: "x" });
    expect(chatNone.content[0].text).toContain("No relevant chat history");

    queryChatHistoryByVectorMock.mockResolvedValueOnce([
      { id: "h1", content: "msg", created_at: Date.now(), metadata: '{"role":"model"}' },
    ]);
    const chatSome = await ops.searchChatHistoryTool({ query: "x", limit: 2 });
    expect(chatSome.content[0].text).toContain("Found 1 chat history records");

    queryChatHistoryByVectorMock.mockRejectedValueOnce(new Error("chat fail"));
    const chatErr = await ops.searchChatHistoryTool({ query: "x" });
    expect(chatErr.isError).toBe(true);
  });

  it("links, traverses, and modifies memories with errors", async () => {
    const link = await ops.linkMemoriesTool({
      source_id: "a",
      target_id: "b",
      relation: "rel",
    });
    expect(link.content[0].text).toContain("Linked memory");

    linkMemoriesMock.mockImplementationOnce(() => {
      throw new Error("link fail");
    });
    const linkErr = await ops.linkMemoriesTool({
      source_id: "a",
      target_id: "b",
      relation: "rel",
    });
    expect(linkErr.isError).toBe(true);

    getLinkedMemoriesMock.mockReturnValueOnce([]);
    const none = await ops.getLinkedMemoriesTool({ memory_id: "x" });
    expect(none.content[0].text).toContain("No linked memories");

    getLinkedMemoriesMock.mockReturnValueOnce([
      { id: "m", topic: "t", content: "c", relation: "r", direction: "incoming" },
    ]);
    const some = await ops.getLinkedMemoriesTool({ memory_id: "x" });
    expect(some.content[0].text).toContain("Found 1 linked memories");

    getLinkedMemoriesMock.mockImplementationOnce(() => {
      throw new Error("read fail");
    });
    const linksErr = await ops.getLinkedMemoriesTool({ memory_id: "x" });
    expect(linksErr.isError).toBe(true);

    modifyMemoryMock.mockResolvedValueOnce({ topic: "new" });
    const ok = await ops.modifyMemoryTool({ memory_id: "m", topic: "new" });
    expect(ok.content[0].text).toContain("updated successfully");

    modifyMemoryMock.mockResolvedValueOnce(null);
    const missing = await ops.modifyMemoryTool({ memory_id: "m" });
    expect(missing.isError).toBe(true);

    modifyMemoryMock.mockRejectedValueOnce(new Error("modify fail"));
    const modErr = await ops.modifyMemoryTool({ memory_id: "m" });
    expect(modErr.isError).toBe(true);
  });
});
