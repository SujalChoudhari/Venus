import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { ToolActivity } from "./ActivityPanel";
import { Theme } from "../core/theme";
import { useMouseScroll } from "../core/hooks/useMouseScroll";
import { Scrollbar } from "./Scrollbar";

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
    const { stdout } = useStdout();
    const pageSize = Math.max(3, (stdout?.rows ?? 40) - 12);
    const maxScroll = Math.max(0, safeEntries.length - pageSize);
    const [scrollOffset, setScrollOffset] = useState(maxScroll);

    useEffect(() => {
        setScrollOffset(Math.max(0, safeEntries.length - pageSize));
    }, [safeEntries.length, pageSize]);

    useInput((_input, key) => {
        if (key.pageUp || (key.shift && key.upArrow)) {
            setScrollOffset((prev) => Math.max(0, prev - 2));
            return;
        }
        if (key.pageDown || (key.shift && key.downArrow)) {
            setScrollOffset((prev) => Math.min(maxScroll, prev + 2));
        }
    });

    useMouseScroll({
        onScrollUp: () => setScrollOffset((prev) => Math.max(0, prev - 2)),
        onScrollDown: () => setScrollOffset((prev) => Math.min(maxScroll, prev + 2)),
    });

    const visibleEntries = safeEntries.slice(scrollOffset, scrollOffset + pageSize);

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
                <Box flexDirection="row" flexGrow={1}>
                    <Box flexDirection="column" flexGrow={1} overflow="hidden">
                        {visibleEntries.map((entry) => (
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
                        ))}
                    </Box>
                    {safeEntries.length > pageSize && (
                        <Box width={1} marginLeft={1} flexShrink={0}>
                            <Scrollbar show={pageSize} current={scrollOffset} total={safeEntries.length} />
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};
