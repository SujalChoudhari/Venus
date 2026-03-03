import React from "react";
import { Box, Text } from "ink";
import { type ViewId } from "../index";
import { Theme } from "../core/theme";

interface ViewSwitcherProps {
    activeView: ViewId;
    memoryCount: number;
    toolCount: number;
    status: string;
    viewHotkeys?: Partial<Record<ViewId, string>>;
}

const VIEWS: { id: ViewId; label: string }[] = [
    { id: "dashboard", label: "CHAT" },
    { id: "notes", label: "NOTES" },
    { id: "memory", label: "MEMORY" },
    { id: "tools", label: "TOOLS" },
    { id: "mcp", label: "MCP" },
    { id: "graph", label: "GRAPH" },
    { id: "config", label: "CONFIG" },
];

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({
    activeView,
    memoryCount,
    toolCount,
    status,
    viewHotkeys = {},
}) => {
    return (
        <Box flexDirection="column" width="100%" marginBottom={0}>
            <Box
                borderStyle="double"
                borderColor={Theme.colors.secondary}
                paddingX={1}
                justifyContent="space-between"
            >
                <Box>
                    <Text color={Theme.colors.primary} bold>
                        VENUS CONSOLE
                    </Text>
                    <Box marginLeft={2} flexDirection="row">
                        {VIEWS.map((v, idx) => {
                            const isActive = activeView === v.id;
                            return (
                                <Box key={v.id} marginRight={2}>
                                    <Text
                                        color={isActive ? Theme.colors.text.inverse : Theme.colors.text.muted}
                                        backgroundColor={isActive ? Theme.colors.background.highlight : undefined}
                                        bold={isActive}
                                    >
                                        {` ${viewHotkeys[v.id] ?? idx + 1} ${v.label} `}
                                    </Text>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>

                <Box>
                    <Text color={Theme.colors.primary}>MEM:</Text>
                    <Text color={Theme.colors.text.primary}> {memoryCount} </Text>
                    <Text color={Theme.colors.primary}>TOOLS:</Text>
                    <Text color={Theme.colors.text.primary}> {toolCount} </Text>
                    <Text color={Theme.colors.primary}> STATE:</Text>
                    <Text color={status === "ready" ? Theme.colors.text.primary : Theme.colors.status.error}>
                        {" "}
                        {status.toUpperCase()}{" "}
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};
