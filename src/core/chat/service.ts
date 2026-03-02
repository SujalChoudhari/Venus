import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, buildFullSystemPrompt } from "./prompts";
import { toolRegistry } from "../mcp/registry";
import { addChatMessage, indexChatMessageForRAG } from "../memory";

let ai: GoogleGenAI | null = null;

export function initializeAi(apiKey: string) {
    ai = new GoogleGenAI({ apiKey });
}

export interface GeminiMessage {
    role: "user" | "model";
    parts: Array<{ text: string }>;
    _isSystemPrompt?: boolean;
}

/**
 * Agentic event types emitted during AI response generation
 */
export type AgentEvent =
    | { type: "text"; text: string }
    | { type: "tool_call"; name: string; args: Record<string, unknown> }
    | { type: "tool_result"; name: string; output: string; isError: boolean }
    | { type: "waiting"; seconds: number }
    | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Manual tool call parsing for non-function-calling models (gemma-3-27b-it)
// ---------------------------------------------------------------------------

interface ParsedToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

interface ParseResult {
    /** The model's text with <tool_call> blocks stripped out */
    cleanText: string;
    /** Parsed tool calls extracted from the text */
    toolCalls: ParsedToolCall[];
}

/**
 * Extract <tool_call>...</tool_call> blocks from the model's raw text output.
 * Returns the clean text (with blocks removed) and the parsed tool calls.
 */
function parseToolCalls(rawText: string): ParseResult {
    const toolCalls: ParsedToolCall[] = [];
    const TOOL_CALL_REGEX = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

    let match: RegExpExecArray | null;
    while ((match = TOOL_CALL_REGEX.exec(rawText)) !== null) {
        const jsonStr = match[1].trim();
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.name && typeof parsed.name === "string") {
                toolCalls.push({
                    name: parsed.name,
                    arguments: parsed.arguments || parsed.args || {},
                });
            }
        } catch {
            // Malformed JSON in tool call block — skip it
        }
    }

    // Strip tool call blocks from the text to get the "clean" response
    const cleanText = rawText.replace(TOOL_CALL_REGEX, "").trim();

    return { cleanText, toolCalls };
}

/**
 * Sanitize conversation history for Gemma API compatibility.
 * - Only allows "user" and "model" roles
 * - Merges consecutive same-role messages (required by Gemma)
 * - Strips internal properties like _isSystemPrompt
 */
function sanitizeHistory(history: GeminiMessage[]): GeminiMessage[] {
    const result: GeminiMessage[] = [];

    for (const msg of history) {
        const role = msg.role === "model" ? "model" : "user";
        const parts = msg.parts;

        const last = result[result.length - 1];
        if (last && last.role === role) {
            // Merge consecutive same-role messages
            last.parts.push(...parts);
        } else {
            result.push({ role, parts: [...parts] });
        }
    }

    return result;
}

/**
 * Estimate token count for a message (~4 chars per token).
 */
function estimateTokens(msg: GeminiMessage): number {
    const text = (msg.parts || [])
        .map((p) => p.text || "")
        .join("");
    return Math.ceil(text.length / 4);
}

/**
 * Trim conversation history to fit within a token budget.
 * Preserves:
 *   - System prompt pair (first 2 messages with _isSystemPrompt)
 *   - The most recent messages
 * Removes oldest middle messages first.
 */
function trimToTokenBudget(history: GeminiMessage[], maxTokens: number): void {
    let totalTokens = history.reduce((sum, msg) => sum + estimateTokens(msg), 0);

    if (totalTokens <= maxTokens) return;

    // Find where system prompt ends
    let systemEnd = 0;
    while (systemEnd < history.length && history[systemEnd]._isSystemPrompt) {
        systemEnd++;
    }

    // Remove oldest non-system messages until we fit
    while (totalTokens > maxTokens && history.length > systemEnd + 1) {
        const removed = history.splice(systemEnd, 1)[0];
        totalTokens -= estimateTokens(removed);
    }
}

/**
 * Run the agentic loop: send prompt, handle tool calls, yield events.
 * Uses text-based tool call extraction for gemma-3-27b-it.
 * Accepts conversationHistory so context persists across user turns.
 */
export async function* runAgentLoop(
    prompt: string,
    conversationHistory: GeminiMessage[],
    sessionId?: string
): AsyncGenerator<AgentEvent> {
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    if (!ai) throw new Error("AI Service not initialized.");

    const MODEL_NAME = process.env.GEMINI_MODEL || "gemma-3-27b-it";

    // Build the full system prompt with tool descriptions injected
    const fullSystemPrompt = buildFullSystemPrompt(toolRegistry.getAllTools());

    // Gemma models don't support systemInstruction — inject as first message pair
    if (conversationHistory.length === 0 || conversationHistory[0]._isSystemPrompt !== true) {
        conversationHistory.unshift(
            { role: "user", parts: [{ text: `[SYSTEM INSTRUCTIONS — follow these at all times]\n\n${fullSystemPrompt}` }], _isSystemPrompt: true },
            { role: "model", parts: [{ text: "Understood. I will follow these instructions and use tools via <tool_call> blocks when needed." }], _isSystemPrompt: true },
        );
    }

    // Append user turn to history
    conversationHistory.push({
        role: "user",
        parts: [{ text: prompt }],
    });

    if (sessionId) {
        try {
            const msg = addChatMessage({
                session_id: sessionId,
                role: "user",
                content: prompt,
                type: "text"
            });
            indexChatMessageForRAG(sessionId, msg.id, "user", prompt).catch(() => { });
        } catch (e) {
            // DB write failed, continue anyway
        }
    }

    let loopCount = 0;
    let consecutive429s = 0;
    const MAX_TOOL_ROUNDS = 10;
    const MAX_429_RETRIES = 3;

    while (loopCount < MAX_TOOL_ROUNDS) {
        loopCount++;

        // Trim history to fit within the API token budget (15k input tokens/min)
        // ~4 chars per token → budget ~60k chars, leave headroom for safety
        trimToTokenBudget(conversationHistory, 7000);

        // Sanitize history: merge consecutive same-role messages, strip extra props
        // Gemma requires strict user/model alternation and only accepts those two roles
        const sanitizedContents = sanitizeHistory(conversationHistory);

        type ResponsePart = { text?: string };
        type GenerateContentResponse = {
            candidates?: Array<{
                content?: {
                    parts?: ResponsePart[];
                };
            }>;
        };

        let response: GenerateContentResponse;
        try {
            response = (await ai.models.generateContent({
                model: MODEL_NAME,
                contents: sanitizedContents,
                // No systemInstruction or tools — Gemma doesn't support either
            })) as GenerateContentResponse;
            consecutive429s = 0; // Reset on success
        } catch (err: unknown) {
            // Handle 429 Resource Exhausted / Quota Exceeded
            const error = err as {
                status?: string;
                message?: string;
                details?: Array<{ retryDelay?: string }>;
            };

            if (error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("429") || error?.message?.includes("Quota exceeded")) {
                consecutive429s++;
                if (consecutive429s > MAX_429_RETRIES) {
                    yield { type: "error", message: `Exceeded max 429 retries. Your daily or minute quota for '${MODEL_NAME}' is likely fully exhausted.` };
                    return;
                }

                let retryAfterSeconds = 40; // Default fallback

                // Attempt to parse retry delay from error message or details
                const retryMatch = error.message?.match(/retry in\s+([\d.]+)/i);
                if (retryMatch && retryMatch[1]) {
                    retryAfterSeconds = Math.ceil(parseFloat(retryMatch[1]));
                } else if (error.details?.[0]?.retryDelay) {
                    const delayStr = error.details[0].retryDelay;
                    retryAfterSeconds = parseInt(delayStr);
                }

                const waitTime = retryAfterSeconds + 7;
                yield { type: "waiting", seconds: waitTime };
                await sleep(waitTime * 1000);

                loopCount--; // Don't count this failed attempt against the tool round limit
                continue;
            }

            yield { type: "error", message: err instanceof Error ? err.message : String(err) };
            return;
        }

        // Extract the raw text from the response
        const textParts = response.candidates?.[0]?.content?.parts?.filter((p) => typeof p.text === "string") ?? [];
        const rawText = textParts.map((p) => p.text ?? "").join("") || "";

        if (!rawText) {
            // Empty response — done
            break;
        }

        // Parse tool calls from the raw text
        const { cleanText, toolCalls } = parseToolCalls(rawText);

        // If model returned text (outside of tool calls), yield it and add to history
        if (cleanText) {
            yield { type: "text", text: cleanText };

            if (sessionId) {
                try {
                    const msg = addChatMessage({
                        session_id: sessionId,
                        role: "model",
                        content: cleanText,
                        type: "text"
                    });
                    indexChatMessageForRAG(sessionId, msg.id, "model", cleanText).catch(() => { });
                } catch (e) {
                    // DB write failed, continue anyway
                }
            }
        }

        // If tool calls were found, execute them — then STOP (no second API call)
        if (toolCalls.length > 0) {
            // Add the full raw model response to history (preserving <tool_call> blocks)
            conversationHistory.push({
                role: "model",
                parts: [{ text: rawText }],
            });

            const toolResultTexts: string[] = [];
            let shouldContinue = false;

            for (const call of toolCalls) {
                if (call.arguments.see_output === true) {
                    shouldContinue = true;
                }

                yield { type: "tool_call", name: call.name, args: call.arguments };

                if (sessionId) {
                    try {
                        addChatMessage({
                            session_id: sessionId,
                            role: "assistant",
                            content: JSON.stringify({ name: call.name, args: call.arguments }),
                            type: "tool_call"
                        });
                    } catch (e) { /* continue */ }
                }

                const result = await toolRegistry.callTool(call.name, call.arguments, { sessionId });
                const output = result.content.map((c) => c.text).join("\n");

                yield { type: "tool_result", name: call.name, output, isError: !!result.isError };

                if (sessionId) {
                    try {
                        addChatMessage({
                            session_id: sessionId,
                            role: "system",
                            content: output,
                            type: "tool_result"
                        });
                    } catch (e) { /* continue */ }
                }

                toolResultTexts.push(
                    `<tool_result name="${call.name}">\n${output}\n</tool_result>`
                );
            }

            // Feed tool results back so the model can use them in its response
            conversationHistory.push({
                role: "user",
                parts: [{ text: toolResultTexts.join("\n\n") }],
            });

            if (shouldContinue) {
                // Continue the loop — model will process tool results
                continue;
            } else {
                // If all tools requested deferred output (see_output: false), 
                // we break and return control to the user to save LLM tokens.
                break;
            }
        }

        // No tool calls — add the clean text to history and we're done
        conversationHistory.push({
            role: "model",
            parts: [{ text: cleanText }],
        });

        break;
    }
}
