import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import os from "os";
import { Theme } from "../core/theme";

interface SystemStatsPanelProps {
    panelWidth?: number;
}

/**
 * Generates a simple sparkline/bar graph from data points
 */
function renderGraph(data: number[], width: number, color: string): React.ReactNode {
    const chars = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
    const max = Math.max(...data, 1);
    const sparkline = data
        .slice(-width)
        .map((val) => {
            const idx = Math.floor((val / max) * (chars.length - 1));
            return chars[idx];
        })
        .join("");

    return <Text color={color}>{sparkline.padStart(width, " ")}</Text>;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

export const SystemStatsPanel: React.FC<SystemStatsPanelProps> = ({
    panelWidth = 30,
}) => {
    const [cpuLoad, setCpuLoad] = useState<number[]>(new Array(20).fill(0));
    const [memUsage, setMemUsage] = useState<number[]>(new Array(20).fill(0));
    const [netActivity, setNetActivity] = useState<number[]>(new Array(20).fill(0));
    const [memDetails, setMemDetails] = useState({ used: 0, total: 0 });

    const prevCpuRef = useRef<{ idle: number; total: number }[]>([]);

    useEffect(() => {
        const timer = setInterval(() => {
            // CPU Load (Delta based for Windows support)
            const currentCpus = os.cpus();
            let avgUsage = 0;

            if (prevCpuRef.current.length > 0) {
                let totalIdle = 0;
                let totalTick = 0;
                for (let i = 0; i < currentCpus.length; i++) {
                    const prev = prevCpuRef.current[i];
                    const t = currentCpus[i].times;
                    const currTotal = t.user + t.nice + t.sys + t.idle + t.irq;

                    totalIdle += t.idle - prev.idle;
                    totalTick += currTotal - prev.total;
                }
                avgUsage = totalTick > 0 ? (1 - totalIdle / totalTick) * 100 : 0;
            }

            prevCpuRef.current = currentCpus.map(c => ({
                idle: c.times.idle,
                total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
            }));

            setCpuLoad((prev) => [...prev.slice(1), avgUsage]);

            // Memory Usage
            const total = os.totalmem();
            const free = os.freemem();
            const used = total - free;
            const usedPercent = (used / total) * 100;
            setMemUsage((prev) => [...prev.slice(1), usedPercent]);
            setMemDetails({ used, total });

            // Network Activity (Simulated)
            const net = Math.random() * 100;
            setNetActivity((prev) => [...prev.slice(1), net]);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const availableWidth = Math.max(10, panelWidth - 4);
    const graphWidth = Math.max(5, availableWidth - 10);

    return (
        <Box flexDirection="column" flexGrow={1} marginBottom={0}>
            <Box flexDirection="row" alignItems="center" flexShrink={0}>
                <Text color={Theme.colors.secondary}>┌─ </Text>
                <Text color={Theme.colors.primary} bold>SYSTEM MONITOR</Text>
                <Text color={Theme.colors.secondary}> </Text>
                <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                <Text color={Theme.colors.secondary}>┐</Text>
            </Box>
            <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} flexGrow={1} paddingX={1} flexDirection="column">
                <Box flexDirection="column" marginTop={0}>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.primary}>CPU </Text>
                        {renderGraph(cpuLoad, graphWidth, Theme.colors.secondary)}
                        <Text color={Theme.colors.primary}> {cpuLoad[cpuLoad.length - 1].toFixed(1)}%</Text>
                    </Box>

                    <Box justifyContent="space-between" marginTop={1}>
                        <Text color={Theme.colors.text.primary}>MEM </Text>
                        {renderGraph(memUsage, graphWidth, Theme.colors.secondary)}
                        <Text color={Theme.colors.primary}> {memUsage[memUsage.length - 1].toFixed(0)}%</Text>
                    </Box>
                    <Box justifyContent="flex-end">
                        <Text color={Theme.colors.text.muted} dimColor>
                            {formatBytes(memDetails.used)} / {formatBytes(memDetails.total)}
                        </Text>
                    </Box>

                    <Box justifyContent="space-between" marginTop={0}>
                        <Text color={Theme.colors.text.primary}>NET </Text>
                        {renderGraph(netActivity, graphWidth, Theme.colors.secondary)}
                        <Text color={Theme.colors.primary}> {netActivity[netActivity.length - 1].toFixed(0)}kb</Text>
                    </Box>
                </Box>

                <Box marginTop={1} flexDirection="column" gap={0}>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.muted} dimColor>CORES</Text>
                        <Text color={Theme.colors.text.primary}>{os.cpus().length}</Text>
                    </Box>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.muted} dimColor>ARCH</Text>
                        <Text color={Theme.colors.text.primary}>{os.arch().toUpperCase()}</Text>
                    </Box>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.muted} dimColor>PLATFORM</Text>
                        <Text color={Theme.colors.text.primary}>{os.platform().toUpperCase()}</Text>
                    </Box>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.muted} dimColor>HOST</Text>
                        <Text color={Theme.colors.text.primary}>{os.hostname().split(".")[0]}</Text>
                    </Box>
                    <Box justifyContent="space-between">
                        <Text color={Theme.colors.text.muted} dimColor>UPTIME</Text>
                        <Text color={Theme.colors.text.primary}>{Math.floor(os.uptime() / 3600)}h {Math.floor((os.uptime() % 3600) / 60)}m</Text>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
