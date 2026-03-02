import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

const generateContentMock = mock(async () => ({}));

mock.module("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
    constructor(_args: { apiKey: string }) {}
  },
}));

const registry = await import("../../src/core/mcp/registry");
const memory = await import("../../src/core/memory");
const service = await import("../../src/core/chat/service");

async function collectEvents(prompt: string, history: service.GeminiMessage[], sessionId?: string) {
  const events: Array<Record<string, unknown>> = [];
  for await (const event of service.runAgentLoop(prompt, history, sessionId)) {
    events.push(event as unknown as Record<string, unknown>);
  }
  return events;
}

describe("chat service", () => {
  const getAllToolsSpy = spyOn(registry.toolRegistry, "getAllTools").mockImplementation(() => []);
  const callToolSpy = spyOn(registry.toolRegistry, "callTool").mockImplementation(
    async () => ({ content: [{ type: "text", text: "ok" }] }),
  );
  const addMessageSpy = spyOn(memory, "addChatMessage").mockImplementation(() => ({ id: "msg-id" } as any));
  const indexSpy = spyOn(memory, "indexChatMessageForRAG").mockImplementation(async () => {});

  beforeEach(() => {
    generateContentMock.mockClear();
    getAllToolsSpy.mockClear();
    callToolSpy.mockClear();
    addMessageSpy.mockClear();
    indexSpy.mockClear();
    delete process.env.GEMINI_MODEL;
  });

  afterAll(() => {
    getAllToolsSpy.mockRestore();
    callToolSpy.mockRestore();
    addMessageSpy.mockRestore();
    indexSpy.mockRestore();
  });

  it("throws when AI is not initialized", async () => {
    await expect(async () => {
      for await (const _ of service.runAgentLoop("hello", [])) {
        // no-op
      }
    }).toThrow("AI Service not initialized.");
  });

  it("returns plain text response", async () => {
    service.initializeAi("key");
    generateContentMock.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "Hello from Venus" }] } }],
    });
    const history: service.GeminiMessage[] = [];
    const events = await collectEvents("Hi", history, "s1");
    expect(events).toEqual([{ type: "text", text: "Hello from Venus" }]);
    expect(addMessageSpy).toHaveBeenCalled();
    expect(history.at(-1)).toEqual({ role: "model", parts: [{ text: "Hello from Venus" }] });
  });

  it("handles tool call with see_output false", async () => {
    service.initializeAi("key");
    callToolSpy.mockResolvedValueOnce({ content: [{ type: "text", text: "stored" }], isError: false });
    generateContentMock.mockResolvedValueOnce({
      candidates: [{
        content: {
          parts: [{
            text: `Planning\n<tool_call>\n{"name":"store_memory","arguments":{"see_output":false}}\n</tool_call>`,
          }],
        },
      }],
    });
    const events = await collectEvents("remember", []);
    expect(events.some((e) => e.type === "tool_call")).toBe(true);
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("continues loop when see_output true", async () => {
    service.initializeAi("key");
    callToolSpy.mockResolvedValueOnce({ content: [{ type: "text", text: "tool output" }] });
    generateContentMock
      .mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              text: `<tool_call>\n{"name":"read_file","arguments":{"see_output":true}}\n</tool_call>`,
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: "final answer" }] } }],
      });
    const events = await collectEvents("read", [], "sid");
    expect(events.some((e) => e.type === "text" && e.text === "final answer")).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it("handles malformed tool block, empty output, and generic error", async () => {
    service.initializeAi("key");
    generateContentMock
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: "<tool_call>{bad}</tool_call>Visible" }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [] } }],
      });
    expect(await collectEvents("x", [])).toEqual([{ type: "text", text: "Visible" }]);
    expect(await collectEvents("x", [])).toEqual([]);

    generateContentMock.mockRejectedValueOnce(new Error("network down"));
    expect(await collectEvents("x", [])).toEqual([{ type: "error", message: "network down" }]);
  });

  it("retries 429 responses and eventually recovers", async () => {
    service.initializeAi("key");
    process.env.GEMINI_MODEL = "custom-model";
    const timeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((fn: Function) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    generateContentMock
      .mockRejectedValueOnce({ status: "RESOURCE_EXHAUSTED", message: "retry in 0.1 seconds" })
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: "recovered" }] } }] });

    const events = await collectEvents("x", []);
    expect(events[0]).toEqual({ type: "waiting", seconds: 8 });
    expect(events[1]).toEqual({ type: "text", text: "recovered" });
    timeoutSpy.mockRestore();
  });

  it("emits max-retry quota error after repeated 429s", async () => {
    service.initializeAi("key");
    const timeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((fn: Function) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    generateContentMock
      .mockRejectedValueOnce({ status: "RESOURCE_EXHAUSTED", details: [{ retryDelay: "0" }] })
      .mockRejectedValueOnce({ status: "RESOURCE_EXHAUSTED", message: "429" })
      .mockRejectedValueOnce({ status: "RESOURCE_EXHAUSTED", message: "429" })
      .mockRejectedValueOnce({ status: "RESOURCE_EXHAUSTED", message: "429" });

    const events = await collectEvents("x", []);
    expect(events.at(-1)).toEqual({
      type: "error",
      message:
        "Exceeded max 429 retries. Your daily or minute quota for 'gemma-3-27b-it' is likely fully exhausted.",
    });
    timeoutSpy.mockRestore();
  });

  it("keeps running when db writes fail", async () => {
    service.initializeAi("key");
    addMessageSpy
      .mockImplementationOnce(() => {
        throw new Error("user write fail");
      })
      .mockImplementationOnce(() => {
        throw new Error("tool-call write fail");
      })
      .mockImplementationOnce(() => {
        throw new Error("tool-result write fail");
      });
    indexSpy.mockRejectedValueOnce(new Error("index fail"));
    callToolSpy.mockResolvedValueOnce({ content: [{ type: "text", text: "done" }], isError: false });
    generateContentMock.mockResolvedValueOnce({
      candidates: [{
        content: { parts: [{ text: `<tool_call>\n{"name":"x","arguments":{"see_output":false}}\n</tool_call>` }] },
      }],
    });

    const events = await collectEvents("x", [], "sid");
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
  });
});
