import type { ToolDefinition, RegisteredTool, ToolResult, ToolHandler } from "./types";
import {
    readFileText, readFileDefinition,
    writeFileText, writeFileDefinition,
    listFiles, listFilesDefinition,
    storeMemoryTool, storeMemoryDefinition,
    searchMemoryTool, searchMemoryDefinition,
    linkMemoriesTool, linkMemoriesDefinition,
    getLinkedMemoriesTool, getLinkedMemoriesDefinition,
    modifyMemoryTool, modifyMemoryDefinition,
    searchChatHistoryTool, searchChatHistoryDefinition,
} from "./operations";

class ToolRegistry {
    private tools: Map<string, RegisteredTool> = new Map();

    constructor() {
        this.registerInternalTools();
    }

    private registerInternalTools() {
        this.registerTool(readFileDefinition, readFileText);
        this.registerTool(writeFileDefinition, writeFileText);
        this.registerTool(listFilesDefinition, listFiles);
        this.registerTool(storeMemoryDefinition, storeMemoryTool);
        this.registerTool(searchMemoryDefinition, searchMemoryTool);
        this.registerTool(linkMemoriesDefinition, linkMemoriesTool);
        this.registerTool(getLinkedMemoriesDefinition, getLinkedMemoriesTool);
        this.registerTool(modifyMemoryDefinition, modifyMemoryTool);
        this.registerTool(searchChatHistoryDefinition, searchChatHistoryTool);
    }

    public registerTool(definition: ToolDefinition, handler: ToolHandler) {
        this.tools.set(definition.name, { definition, handler });
    }

    public getTool(name: string): RegisteredTool | undefined {
        return this.tools.get(name);
    }

    public getAllTools(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(t => {
            // Deep clone to avoid mutating the original registry definition permanently
            const def = JSON.parse(JSON.stringify(t.definition)) as ToolDefinition;
            if (def.parametersJsonSchema && def.parametersJsonSchema.properties) {
                def.parametersJsonSchema.properties.see_output = {
                    type: "boolean",
                    description: "Set to true if you need the output immediately to continue reasoning (e.g. reading a file or searching). Set to false or omit to defer output formatting and save time (e.g. storing memory). Defaults to false."
                };
            }
            return def;
        });
    }

    public async callTool(name: string, args: any, context?: any): Promise<ToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return {
                content: [{ type: "text", text: `Tool not found: ${name}` }],
                isError: true,
            };
        }

        try {
            return await tool.handler(args, context);
        } catch (error) {
            return {
                content: [{ type: "text", text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
}

export const toolRegistry = new ToolRegistry();
