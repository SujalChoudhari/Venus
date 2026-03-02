import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Theme } from "../core/theme";

export interface ToolActivity {
    id: string;
    name: string;
    status: "running" | "done" | "error";
    timestamp: Date;
    args?: Record<string, any>;
    output?: string;
}

interface ActivityPanelProps {
    activities: ToolActivity[];
}

function formatCountdown(ms: number) {
    if (ms <= 0) return "Running soon...";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({ activities }) => {

    return (
        <Box flexDirection="column" flexGrow={1} marginBottom={1}>
            <Box flexDirection="row" alignItems="center" flexShrink={0}>
                <Text color={Theme.colors.secondary}>┌─ </Text>
                <Text color={Theme.colors.primary} bold>ACTIVITY</Text>

                <Text color={Theme.colors.secondary}> </Text>
                <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                <Text color={Theme.colors.secondary}>┐</Text>
            </Box>
            <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} flexGrow={1} paddingX={1} flexDirection="column">
                {activities.length === 0 ? (
                    <Box paddingY={1}>
                        <Text color={Theme.colors.text.muted} italic>Awaiting commands...</Text>
                    </Box>
                ) : (
                    activities.slice(-5).map((act) => (
                        <Box key={act.id} gap={1}>
                            <Text color={act.status === "running" ? Theme.colors.status.loading : act.status === "error" ? Theme.colors.status.error : Theme.colors.status.success}>
                                {act.status === "running" ? "◌" : act.status === "error" ? "✗" : "✓"}
                            </Text>
                            <Text color={Theme.colors.text.primary} bold>{act.name}</Text>
                            <Text color={Theme.colors.text.muted} dimColor>[{act.timestamp.toLocaleTimeString()}]</Text>
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
};
