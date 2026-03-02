import React from "react";
import { Box, Text } from "ink";
import { Theme } from "../core/theme";

interface SystemPanelProps {
    modelName: string;
    memoryCount: number;
    toolCount: number;
    mcpStatus: string;
}

export const SystemPanel: React.FC<SystemPanelProps> = ({
    modelName,
    memoryCount,
    toolCount,
    mcpStatus,
}) => {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row" alignItems="center" flexShrink={0}>
                <Text color={Theme.colors.secondary}>┌─ </Text>
                <Text color={Theme.colors.primary} bold>SYSTEM</Text>
                <Text color={Theme.colors.secondary}> </Text>
                <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                <Text color={Theme.colors.secondary}>┐</Text>
            </Box>
            <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} paddingX={1} flexDirection="column">
                <Box flexDirection="column" marginTop={1}>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.primary}>Model:</Text>
                        <Text color={Theme.colors.primary}>{modelName}</Text>
                    </Box>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.primary}>Memories:</Text>
                        <Text color={Theme.colors.primary}>{memoryCount}</Text>
                    </Box>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.primary}>Tools:</Text>
                        <Text color={Theme.colors.primary}>{toolCount}</Text>
                    </Box>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.primary}>Status:</Text>
                        <Text color={mcpStatus === "ready" ? Theme.colors.status.success : Theme.colors.status.error}>{mcpStatus}</Text>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
