import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { ToolResult, ToolDefinition, ToolContext } from "./types";
import {
    storeMemory as dbStore,
    queryMemoryByVector as dbSearch,
    linkMemories as dbLink,
    getLinkedMemories as dbGetLinks,
    modifyMemory as dbModify,
    queryChatHistoryByVector as dbSearchChat,
} from "../memory";

/**
 * Read content from a file
 */
export async function readFileText(args: { path: string }): Promise<ToolResult> {
    try {
        const absolutePath = resolve(process.cwd(), args.path);
        const content = await readFile(absolutePath, "utf-8");
        return {
            content: [{ type: "text", text: content }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error reading file: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const readFileDefinition: ToolDefinition = {
    name: "read_file",
    description: "Read the contents of a file from the local file system",
    parametersJsonSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Relative or absolute path to the file",
            },
        },
        required: ["path"],
    },
};

/**
 * Write content to a file
 */
export async function writeFileText(args: { path: string, content: string }): Promise<ToolResult> {
    try {
        const absolutePath = resolve(process.cwd(), args.path);
        await writeFile(absolutePath, args.content, "utf-8");
        return {
            content: [{ type: "text", text: `Successfully wrote to ${args.path}` }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error writing file: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const writeFileDefinition: ToolDefinition = {
    name: "write_file",
    description: "Write content to a file in the local file system",
    parametersJsonSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Relative or absolute path to the file",
            },
            content: {
                type: "string",
                description: "The content to write to the file",
            },
        },
        required: ["path", "content"],
    },
};

/**
 * List files in a directory
 */
export async function listFiles(args: { path: string }): Promise<ToolResult> {
    try {
        const absolutePath = resolve(process.cwd(), args.path || ".");
        const files = await readdir(absolutePath);
        return {
            content: [{ type: "text", text: files.join("\n") }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error listing directory: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const listFilesDefinition: ToolDefinition = {
    name: "list_files",
    description: "List the contents of a directory in the local file system",
    parametersJsonSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "The path to list (defaults to '.')",
            },
        },
        required: [],
    },
};

/**
 * Store one or more memories for long-term persistence (with optional graph links)
 */
export async function storeMemoryTool(args: { memories: Array<{ content: string, topic?: string, linked_ids?: string[] }> }, context?: ToolContext): Promise<ToolResult> {
    try {
        const results = [];
        for (const memory of args.memories) {
            const result = await dbStore(memory.topic || "general", memory.content, undefined, {
                linkedIds: memory.linked_ids,
                source_session_id: context?.sessionId,
            });
            results.push(result.id);
        }

        return {
            content: [{
                type: "text",
                text: `Successfully stored ${results.length} memories. IDs: ${results.join(", ")}`
            }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error storing memory: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const storeMemoryDefinition: ToolDefinition = {
    name: "store_memory",
    description: "Store information in the Knowledge Graph. Supports batching multiple memories. Returns the new IDs. Optionally link to existing memories.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            memories: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        content: {
                            type: "string",
                            description: "The detailed information to remember",
                        },
                        topic: {
                            type: "string",
                            description: "Category/topic for the memory (reuse existing topics if possible)",
                        },
                        linked_ids: {
                            type: "array",
                            items: { type: "string" },
                            description: "Optional list of existing memory IDs to link this new memory to",
                        },
                    },
                    required: ["content"],
                },
                description: "List of memories to store",
            },
        },
        required: ["memories"],
    },
};

/**
 * Search long-term memory via semantic similarity
 */
export async function searchMemoryTool(args: { query: string, limit?: number }): Promise<ToolResult> {
    try {
        const results = await dbSearch(args.query, args.limit || 5);
        if (results.length === 0) {
            return { content: [{ type: "text", text: "No relevant memories found." }] };
        }

        const text = results
            .map(r => `[ID: ${r.id}] [Topic: ${r.topic}] (Relevance: ${(r.relevance || 0).toFixed(2)})\n${r.content}`)
            .join("\n\n---\n\n");

        return {
            content: [{ type: "text", text: `Found ${results.length} memories:\n\n${text}` }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error searching memory: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const searchMemoryDefinition: ToolDefinition = {
    name: "search_memory",
    description: "Search the Knowledge Graph for relevant memories (concepts, facts, etc.) via semantic similarity.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The search query (natural language)",
            },
            limit: {
                type: "number",
                description: "Maximum number of results to return (default: 5)",
            },
        },
        required: ["query"],
    },
};

/**
 * Search chat history via semantic similarity
 */
export async function searchChatHistoryTool(args: { query: string, limit?: number }): Promise<ToolResult> {
    try {
        const results = await dbSearchChat(args.query, args.limit || 5);
        if (results.length === 0) {
            return { content: [{ type: "text", text: "No relevant chat history found." }] };
        }

        const text = results
            .map(r => {
                const metadata = r.metadata ? JSON.parse(r.metadata) : {};
                const role = metadata.role || "unknown";
                const date = new Date(r.created_at).toLocaleString();
                return `[ID: ${r.id}] [Role: ${role}] [Date: ${date}]\n${r.content}`;
            })
            .join("\n\n---\n\n");

        return {
            content: [{ type: "text", text: `Found ${results.length} chat history records:\n\n${text}` }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error searching chat history: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const searchChatHistoryDefinition: ToolDefinition = {
    name: "search_chat_history",
    description: "Search indexed chat history (past conversations) for relevant information via semantic similarity.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The search query (natural language)",
            },
            limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)",
            },
        },
        required: ["query"],
    },
};

// =============================================================================
// KNOWLEDGE GRAPH TOOLS
// =============================================================================

/**
 * Link two memories in the Knowledge Graph
 */
export async function linkMemoriesTool(args: { source_id: string; target_id: string; relation: string }): Promise<ToolResult> {
    try {
        const link = dbLink(args.source_id, args.target_id, args.relation);
        return {
            content: [{ type: "text", text: `Linked memory ${args.source_id} → ${args.target_id} (relation: "${args.relation}", link id: ${link.id})` }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error linking memories: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const linkMemoriesDefinition: ToolDefinition = {
    name: "link_memories",
    description: "Create a directed relationship between two memories in the Knowledge Graph.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            source_id: { type: "string", description: "ID of the source memory" },
            target_id: { type: "string", description: "ID of the target memory" },
            relation: { type: "string", description: "Type of relationship (e.g. 'related_to', 'derived_from', 'contradicts', 'supports')" },
        },
        required: ["source_id", "target_id", "relation"],
    },
};

/**
 * Get memories linked to a given memory
 */
export async function getLinkedMemoriesTool(args: { memory_id: string }): Promise<ToolResult> {
    try {
        const linked = dbGetLinks(args.memory_id);
        if (linked.length === 0) {
            return { content: [{ type: "text", text: "No linked memories found." }] };
        }

        const text = linked
            .map(l => `[${l.direction}] (${l.relation}) ID: ${l.id}\nTopic: ${l.topic}\n${l.content}`)
            .join("\n\n---\n\n");

        return {
            content: [{ type: "text", text: `Found ${linked.length} linked memories:\n\n${text}` }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const getLinkedMemoriesDefinition: ToolDefinition = {
    name: "get_linked_memories",
    description: "Traverse the Knowledge Graph to find all memories linked to a specific memory node.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            memory_id: { type: "string", description: "ID of the memory to find connections for" },
        },
        required: ["memory_id"],
    },
};

/**
 * Modify an existing memory (content, topic, or metadata)
 */
export async function modifyMemoryTool(args: { memory_id: string; content?: string; topic?: string; metadata?: Record<string, any> }): Promise<ToolResult> {
    try {
        const updated = await dbModify(args.memory_id, {
            content: args.content,
            topic: args.topic,
            metadata: args.metadata,
        });

        if (!updated) {
            return { content: [{ type: "text", text: "Memory not found." }], isError: true };
        }

        return {
            content: [{ type: "text", text: `Memory ${args.memory_id} updated successfully. Topic: ${updated.topic}` }],
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}

export const modifyMemoryDefinition: ToolDefinition = {
    name: "modify_memory",
    description: "Update an existing memory's content, topic, or metadata in the Knowledge Graph.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            memory_id: { type: "string", description: "ID of the memory to modify" },
            content: { type: "string", description: "New content (will re-embed automatically)" },
            topic: { type: "string", description: "New topic/category" },
            metadata: { type: "object", description: "JSON metadata to attach to the memory" },
        },
        required: ["memory_id"],
    },
};
