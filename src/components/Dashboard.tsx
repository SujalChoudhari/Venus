import React from "react";
import { Box, Text, useStdout } from "ink";
import { ChatWindow, type Message } from "./ChatWindow";
import { KnowledgeGraphPanel } from "./KnowledgeGraphPanel";
import { ActivityPanel, type ToolActivity } from "./ActivityPanel";
import { SystemStatsPanel } from "./SystemStatsPanel";
import { Theme } from "../core/theme";

interface DashboardProps {
    messages: Message[];
    isLoading: boolean;
    modelName: string;
    memoryCount: number;
    toolCount: number;
    mcpStatus: string;
    activities: ToolActivity[];
}

export const Dashboard: React.FC<DashboardProps> = ({
    messages,
    isLoading,
    modelName,
    memoryCount,
    toolCount,
    mcpStatus,
    activities,
}) => {
    const { stdout } = useStdout();
    const termWidth = stdout?.columns ?? 120;

    const sidebarWidth = Math.max(30, Math.min(60, Math.floor(termWidth * 0.45)));

    return (
        <Box flexDirection="row" flexGrow={1}>
            {/* Main Chat */}
            <Box flexDirection="column" flexGrow={1}>
                <Box flexDirection="row" alignItems="center" flexShrink={0}>
                    <Text color={Theme.colors.secondary}>┌─ </Text>
                    <Text color={Theme.colors.primary} bold>CHAT</Text>
                    <Text color={Theme.colors.secondary}> </Text>
                    <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                    <Text color={Theme.colors.secondary}>┐</Text>
                </Box>
                <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} flexGrow={1} overflow="hidden">
                    <ChatWindow messages={messages} isStreaming={isLoading} />
                </Box>
            </Box>

            {/* Sidebar */}
            <Box flexDirection="column" width={sidebarWidth} flexShrink={0}>
                <KnowledgeGraphPanel panelWidth={sidebarWidth} />
                <ActivityPanel activities={activities} />
                <SystemStatsPanel panelWidth={sidebarWidth} />
            </Box>
        </Box>
    );
};
