import React from "react";
import { Box, Text } from "ink";
import type { ToolActivity } from "./ActivityPanel";
import { Theme } from "../core/theme";

export interface ToolLogEntry extends ToolActivity {
    args?: Record<string, any>;
    output?: string;
    isError?: boolean;
}

interface ToolLogProps {
    entries: ToolLogEntry[];
}

export const ToolLog: React.FC<ToolLogProps> = ({ entries = [] }) => {
    const safeEntries = entries || [];
    return (
        <Box flexDirection="column" width="100%" flexGrow={1} paddingX={1}>
            <Box marginBottom={1}>
                <Text color={Theme.colors.primary} bold>
                    ◆ TOOL ACTIVITY LOG
                </Text>
                <Text color={Theme.colors.text.muted}> — {safeEntries.length} calls</Text>
            </Box>

            {safeEntries.length === 0 ? (
                <Text color={Theme.colors.text.muted} italic>
                    No tool calls yet. Ask Venus to read or list files.
                </Text>
            ) : (
                safeEntries.map((entry) => (
                    <Box
                        key={entry.id}
                        flexDirection="column"
                        borderStyle="round"
                        borderColor={entry.isError ? Theme.colors.status.error : entry.status === "running" ? Theme.colors.status.loading : Theme.colors.primary}
                        paddingX={1}
                        marginBottom={1}
                    >
                        <Box>
                            <Text
                                color={entry.isError ? Theme.colors.status.error : entry.status === "running" ? Theme.colors.status.loading : Theme.colors.status.success}
                                bold
                            >
                                {entry.status === "running" ? "◌" : entry.isError ? "✗" : "✓"}
                            </Text>
                            <Text color={Theme.colors.text.primary} bold>
                                {" "}{entry.name}
                            </Text>
                            <Text color={Theme.colors.text.muted}>
                                {" "}at {entry.timestamp.toLocaleTimeString()}
                            </Text>
                        </Box>
                        {entry.args && Object.keys(entry.args).length > 0 && (
                            <Box marginLeft={2}>
                                <Text color={Theme.colors.text.muted}>Args: </Text>
                                <Text color={Theme.colors.text.primary}>{JSON.stringify(entry.args)}</Text>
                            </Box>
                        )}
                        {entry.output && (
                            <Box marginLeft={2} flexDirection="column">
                                <Text color={Theme.colors.text.muted}>Output:</Text>
                                <Text color={Theme.colors.text.primary}>
                                    {entry.output.length > 300 ? entry.output.slice(0, 300) + "\n... (truncated)" : entry.output}
                                </Text>
                            </Box>
                        )}
                    </Box>
                ))
            )}
        </Box>
    );
};
