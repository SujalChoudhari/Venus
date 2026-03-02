import { describe, expect, it } from "bun:test";
import {
  SYSTEM_PROMPT,
  buildFullSystemPrompt,
  buildRagPrompt,
  buildToolPrompt,
} from "../../../src/core/chat/prompts";
import type { ToolDefinition } from "../../../src/core/mcp/types";

describe("chat prompts", () => {
  it("exposes a stable base system prompt", () => {
    expect(SYSTEM_PROMPT).toContain("You are Venus.");
    expect(SYSTEM_PROMPT).toContain("PROACTIVE MEMORY");
  });

  it("builds tool prompt with fallback description", () => {
    const tools: ToolDefinition[] = [
      {
        name: "alpha_tool",
        parametersJsonSchema: {
          type: "object",
          properties: { a: { type: "string" } },
          required: [],
        },
      },
    ];

    const prompt = buildToolPrompt(tools);
    expect(prompt).toContain("### alpha_tool");
    expect(prompt).toContain("No description.");
    expect(prompt).toContain('"a"');
    expect(prompt).toContain("<tool_call>");
  });

  it("builds full system prompt by concatenating system and tools", () => {
    const full = buildFullSystemPrompt([]);
    expect(full).toContain("You are Venus.");
    expect(full).toContain("## Tool Calling");
  });

  it("returns raw query when no memories are found", () => {
    expect(buildRagPrompt("hello", [])).toBe("hello");
  });

  it("formats rag prompt with relevance details when present", () => {
    const rag = buildRagPrompt("What is my project?", [
      { topic: "project", content: "You are building Venus.", relevance: 0.88 },
      { topic: "prefs", content: "User likes TypeScript." },
    ]);

    expect(rag).toContain("RELEVANT MEMORIES FROM SECOND BRAIN");
    expect(rag).toContain("Topic: project (Relevance: 88%)");
    expect(rag).toContain("Topic: prefs");
    expect(rag).toContain("USER QUERY:\nWhat is my project?");
  });
});
