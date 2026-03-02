import React from "react";
import { Box, Text } from "ink";
import { toolRegistry } from "../core/mcp/registry";
import { Theme } from "../core/theme";

export const McpManagerView: React.FC = () => {
    const tools = toolRegistry.getAllTools();

    return (
        <Box flexDirection="column" width="100%" flexGrow={1} paddingX={1}>
            <Box flexDirection="column" flexGrow={1}>
                <Box flexDirection="row" alignItems="center" flexShrink={0}>
                    <Text color={Theme.colors.secondary}>┌─ </Text>
                    <Text color={Theme.colors.primary} bold>MCP ORCHESTRATOR</Text>
                    <Text color={Theme.colors.secondary}> </Text>
                    <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                    <Text color={Theme.colors.text.muted}> {tools.length} active </Text>
                    <Text color={Theme.colors.secondary}>┐</Text>
                </Box>
                <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} flexGrow={1} paddingX={1} flexDirection="column">
                    <Box flexDirection="column" flexGrow={1} marginTop={1}>
                        {/* Internal Tools Section */}
                        <Box flexDirection="column" marginBottom={1}>
                            <Text color={Theme.colors.text.primary} bold underline>INTERNAL TOOLS (Core)</Text>
                            <Box flexDirection="column" marginTop={1} marginLeft={1}>
                                {tools.map((t) => (
                                    <Box key={t.name} marginBottom={0}>
                                        <Text color={Theme.colors.primary}>● {t.name.padEnd(20)}</Text>
                                        <Text color={Theme.colors.text.muted}> {t.description}</Text>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        {/* External MCP Servers Section */}
                        <Box flexDirection="column" marginTop={1}>
                            <Text color={Theme.colors.text.primary} bold underline>EXTERNAL MCP SERVERS</Text>
                            <Box flexDirection="column" marginTop={1} marginLeft={1}>
                                <Box marginBottom={1} borderStyle="round" borderColor={Theme.colors.secondary} paddingX={1}>
                                    <Text color={Theme.colors.text.muted} italic>
                                        No external servers connected.
                                        Edit .env to add MCP_SERVERS config.
                                    </Text>
                                </Box>

                                <Text color={Theme.colors.text.primary}>Configured Servers:</Text>
                                <Text color={Theme.colors.text.muted} dimColor> (Coming soon: Bridge to brave-search, google-maps, etc.)</Text>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>

            <Box borderStyle="single" borderColor={Theme.colors.primary} paddingX={1} marginBottom={1} marginTop={1}>
                <Text color={Theme.colors.primary}>TIP: Use tools to automate memory storage and retrieval.</Text>
            </Box>
        </Box>
    );
};
