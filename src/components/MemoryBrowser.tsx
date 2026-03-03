import React, { useState } from "react";
import { Box, Text, useStdout, useInput } from "ink";
import { Theme } from "../core/theme";

interface MemoryItem {
    id?: string;
    topic: string;
    content: string;
    embedding_model: string | null;
    has_embedding: number;
}

interface MemoryBrowserProps {
    memories: MemoryItem[];
    appMode?: "CHAT" | "COMMAND" | "INSERT";
}

export const MemoryBrowser: React.FC<MemoryBrowserProps> = ({ memories, appMode = "CHAT" }) => {
    const { stdout } = useStdout();
    const termHeight = stdout?.rows ?? 40;
    const pageSize = Math.max(3, Math.floor((termHeight - 10) / 3));

    const [scrollOffset, setScrollOffset] = useState(0);

    // Group by topic
    const grouped = memories.reduce<Record<string, MemoryItem[]>>((acc, m) => {
        if (!acc[m.topic]) acc[m.topic] = [];
        acc[m.topic].push(m);
        return acc;
    }, {});

    const topics = Object.keys(grouped);

    // Flatten into a list of renderable items for scrolling
    const allItems: ({ type: "topic"; topic: string; count: number } | { type: "memory"; memory: MemoryItem; topic: string })[] = [];

    for (const topic of topics) {
        allItems.push({ type: "topic", topic, count: grouped[topic].length });
        for (const m of grouped[topic]) {
            allItems.push({ type: "memory", memory: m, topic });
        }
    }

    // Scroll limits
    const maxScroll = Math.max(0, allItems.length - pageSize);

    // Keyboard scroll
    useInput((_char, key) => {
        if (key.pageUp || (key.shift && key.upArrow)) {
            setScrollOffset(prev => Math.min(maxScroll, prev + pageSize));
        } else if (key.pageDown || (key.shift && key.downArrow)) {
            setScrollOffset(prev => Math.max(0, prev - pageSize));
        }
    }, { isActive: appMode !== "CHAT" });

    // Visible slice (from end, scrollOffset pushes up)
    const endIdx = allItems.length - scrollOffset;
    const startIdx = Math.max(0, endIdx - pageSize);
    const visible = allItems.slice(startIdx, endIdx);
    const canScrollUp = startIdx > 0;
    const canScrollDown = scrollOffset > 0;

    return (
        <Box flexDirection="column" width="100%" flexGrow={1} borderStyle="single" borderColor={Theme.colors.secondary}>
            <Box paddingX={1} marginBottom={0}>
                <Text color={Theme.colors.primary} bold>◆ MEMORY BROWSER</Text>
                <Text color={Theme.colors.text.muted}> — {memories.length} total memories across {topics.length} topics</Text>
            </Box>

            {canScrollUp && (
                <Box justifyContent="center">
                    <Text color={Theme.colors.text.muted} dimColor>▲ Shift+↑ ({startIdx} more above) ▲</Text>
                </Box>
            )}

            {topics.length === 0 ? (
                <Box paddingX={2} flexGrow={1}>
                    <Text color={Theme.colors.text.muted} italic>
                        No memories stored yet. Use /memorize to add some.
                    </Text>
                </Box>
            ) : (
                <Box flexDirection="column" paddingX={1} flexGrow={1}>
                    {visible.map((item, i) => {
                        if (item.type === "topic") {
                            return (
                                <Box key={`t-${item.topic}-${i}`} marginTop={i > 0 ? 1 : 0}>
                                    <Text color={Theme.colors.primary} bold>
                                        ┌─ {item.topic} ({item.count}) ─
                                    </Text>
                                </Box>
                            );
                        }

                        const m = item.memory;
                        return (
                            <Box key={`m-${item.topic}-${i}`} marginLeft={1} flexDirection="column">
                                <Box>
                                    <Text color={m.has_embedding ? Theme.colors.status.success : Theme.colors.status.error}>
                                        {m.has_embedding ? "✔" : "○"}{" "}
                                    </Text>
                                    <Text color={Theme.colors.text.primary} wrap="wrap">
                                        {m.content}
                                    </Text>
                                </Box>
                                <Box marginLeft={2}>
                                    <Text color={Theme.colors.text.muted} dimColor>
                                        {m.embedding_model ? `[${m.embedding_model}]` : "[no vec]"}
                                        {m.has_embedding ? "" : " ⚠ needs embedding"}
                                    </Text>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}

            {canScrollDown && (
                <Box justifyContent="center">
                    <Text color={Theme.colors.text.muted} dimColor>▼ Shift+↓ ({scrollOffset} more below) ▼</Text>
                </Box>
            )}
        </Box>
    );
};
