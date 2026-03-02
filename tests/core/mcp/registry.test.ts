import { afterAll, describe, expect, it, mock } from "bun:test";
import type { ToolDefinition, ToolResult } from "../../../src/core/mcp/types";

const okResult: ToolResult = { content: [{ type: "text", text: "ok" }] };
const okHandler = mock(async () => okResult);

const buildDef = (name: string): ToolDefinition => ({
  name,
  description: `${name} description`,
  parametersJsonSchema: {
    type: "object",
    properties: { q: { type: "string" } },
    required: [],
  },
});

const operationsMockFactory = () => ({
  readFileText: okHandler,
  readFileDefinition: buildDef("read_file"),
  writeFileText: okHandler,
  writeFileDefinition: buildDef("write_file"),
  listFiles: okHandler,
  listFilesDefinition: buildDef("list_files"),
  storeMemoryTool: okHandler,
  storeMemoryDefinition: buildDef("store_memory"),
  searchMemoryTool: okHandler,
  searchMemoryDefinition: buildDef("search_memory"),
  linkMemoriesTool: okHandler,
  linkMemoriesDefinition: buildDef("link_memories"),
  getLinkedMemoriesTool: okHandler,
  getLinkedMemoriesDefinition: buildDef("get_linked_memories"),
  modifyMemoryTool: okHandler,
  modifyMemoryDefinition: buildDef("modify_memory"),
  searchChatHistoryTool: okHandler,
  searchChatHistoryDefinition: buildDef("search_chat_history"),
});
mock.module("../../../src/core/mcp/operations", operationsMockFactory);
mock.module("../../../src/core/mcp/operations.ts", operationsMockFactory);

const { toolRegistry } = await import("../../../src/core/mcp/registry");

describe("tool registry", () => {
  it("registers and retrieves tools", () => {
    expect(toolRegistry.getTool("read_file")).toBeDefined();
    expect(toolRegistry.getTool("missing")).toBeUndefined();
  });

  it("returns cloned definitions with see_output injection", () => {
    const a = toolRegistry.getAllTools();
    const b = toolRegistry.getAllTools();
    const readA = a.find((d) => d.name === "read_file");
    const readB = b.find((d) => d.name === "read_file");

    expect(readA?.parametersJsonSchema.properties.see_output).toBeDefined();
    expect(readA).not.toBe(readB);

    if (readA) readA.parametersJsonSchema.properties.changed = true;
    const c = toolRegistry.getAllTools();
    expect(c.find((d) => d.name === "read_file")?.parametersJsonSchema.properties.changed)
      .toBeUndefined();
  });

  it("calls tools and handles unknown/throwing tools", async () => {
    const ok = await toolRegistry.callTool("read_file", {});
    expect(ok.content[0].text).toBe("ok");

    const missing = await toolRegistry.callTool("nope", {});
    expect(missing.isError).toBe(true);

    toolRegistry.registerTool(buildDef("throws"), async () => {
      throw new Error("boom");
    });
    const failed = await toolRegistry.callTool("throws", {});
    expect(failed.isError).toBe(true);

    toolRegistry.registerTool(buildDef("throws-string"), async () => {
      throw "boom2";
    });
    const failedString = await toolRegistry.callTool("throws-string", {});
    expect(failedString.isError).toBe(true);
  });

  afterAll(() => {
    mock.restore();
  });
});
