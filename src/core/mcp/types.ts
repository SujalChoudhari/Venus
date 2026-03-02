/**
 * MCP-inspired tool types for Venus
 */

export interface ToolDefinition {
    name: string;
    description?: string;
    parametersJsonSchema: {
        type: "object";
        properties: Record<string, any>;
        required: string[];
    };
}

export interface ToolResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    isError?: boolean;
}

export interface ToolContext {
    sessionId?: string;
}

export type ToolHandler = (args: any, context?: ToolContext) => Promise<ToolResult>;

export interface RegisteredTool {
    definition: ToolDefinition;
    handler: ToolHandler;
}
