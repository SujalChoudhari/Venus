import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useStdout, useInput } from "ink";
import { getDatabase } from "../core/memory";
import { Theme } from "../core/theme";
import { useMouseScroll } from "../core/hooks/useMouseScroll";

/**
 * Fullscreen Knowledge Graph - High-Res Braille Redesign
 * Uses 2x4 Braille sub-pixels for ultra-smooth lines and reduced density.
 */

interface GNode { id: string; topic: string; content: string; linkCount: number; }
interface GEdge { source: string; target: string; relation: string; }

// Braille mapping: 2x4 sub-pixels to single char
function getBrailleChar(bits: number[]): string {
    let code = 0;
    if (bits[0]) code |= 1;
    if (bits[1]) code |= 2;
    if (bits[2]) code |= 4;
    if (bits[3]) code |= 8;
    if (bits[4]) code |= 16;
    if (bits[5]) code |= 32;
    if (bits[6]) code |= 64;
    if (bits[7]) code |= 128;
    return String.fromCharCode(0x2800 + code);
}

interface GraphViewProps {
    appMode?: "CHAT" | "COMMAND" | "INSERT";
}

export const GraphView: React.FC<GraphViewProps> = ({ appMode = "CHAT" }) => {
    const { stdout } = useStdout();
    const fullW = (stdout?.columns ?? 120);
    const fullH = (stdout?.rows ?? 40);

    const sidebarW = Math.max(30, Math.min(60, Math.floor(fullW * 0.40)));
    const W = fullW - sidebarW - 6;
    const H = fullH - 10;

    const [nodes, setNodes] = useState<GNode[]>([]);
    const [edges, setEdges] = useState<GEdge[]>([]);
    const [angle, setAngle] = useState(0);
    const [mode, setMode] = useState<"latest" | "dense" | "labels">("latest");
    const tilt = 0.2;
    const isInteractive = appMode !== "CHAT";

    const cx = Math.floor(W / 2);
    const cy = Math.floor(H / 2);

    useEffect(() => {
        const fetchData = () => {
            try {
                const db = getDatabase();
                const n = db.query(`
                    SELECT id, topic, substr(content, 1, 20) as content,
                    (SELECT COUNT(*) FROM memory_links WHERE source_id = m.id OR target_id = m.id) as linkCount
                    FROM long_term_memory m ORDER BY updated_at DESC LIMIT 100
                `).all() as GNode[];
                const e = db.query(`
                    SELECT source_id as source, target_id as target, relation_type as relation
                    FROM memory_links ORDER BY created_at DESC 
                `).all() as GEdge[];
                setNodes(n);
                setEdges(e);
            } catch { }
        };
        fetchData();
        const id = setInterval(fetchData, 5000);
        return () => clearInterval(id);
    }, []);

    useInput((input, _key) => {
        if (input === "g") {
            setMode(prev => {
                if (prev === "latest") return "dense";
                if (prev === "dense") return "labels";
                return "latest";
            });
        }
    }, { isActive: isInteractive });

    useMouseScroll({
        isActive: isInteractive,
        onScrollDown: () => {
            setMode(prev => {
                if (prev === "latest") return "dense";
                if (prev === "dense") return "labels";
                return "latest";
            });
        },
        onScrollUp: () => {
            setMode(prev => {
                if (prev === "labels") return "dense";
                if (prev === "dense") return "latest";
                return "labels";
            });
        },
    });

    useEffect(() => {
        const id = setInterval(() => setAngle(a => (a + 0.02) % (Math.PI * 2)), 60);
        return () => clearInterval(id);
    }, []);

    const baseNodes = useMemo(() => {
        if (nodes.length === 0) return [];
        const displayNodes = mode === "latest" ? nodes.slice(0, 20) : nodes;
        const r = Math.min(W / 4, H / 2);
        return displayNodes.map((node, i) => {
            const phi = Math.acos(1 - 2 * (i + 0.5) / displayNodes.length);
            const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
            return {
                ...node,
                x3d: r * Math.sin(phi) * Math.cos(theta),
                y3d: r * Math.cos(phi),
                z3d: r * Math.sin(phi) * Math.sin(theta),
            };
        });
    }, [nodes, mode, W, H]);

    const { rows } = useMemo(() => {
        if (baseNodes.length === 0) return { rows: ["Awaiting memories..."] };
        const subW = W * 2;
        const subH = H * 4;
        const subBuf = new Uint8Array(subW * subH);
        const charBuf: string[][] = Array(H).fill(0).map(() => Array(W).fill(" "));

        const proj = baseNodes.map(n => {
            const rx = n.x3d * Math.cos(angle) - n.z3d * Math.sin(angle);
            const rz = n.x3d * Math.sin(angle) + n.z3d * Math.cos(angle);
            const ry = n.y3d * Math.cos(tilt) - rz * Math.sin(tilt);
            const rz2 = n.y3d * Math.sin(tilt) + rz * Math.cos(tilt);
            const sx = Math.floor(cx + rx * 2.2);
            const sy = Math.floor(cy + ry);
            const subX = Math.floor((cx + rx * 2.2) * 2);
            const subY = Math.floor((cy + ry) * 4);
            return { ...n, sx, sy, subX, subY, depth: rz2 };
        });

        edges.forEach(e => {
            const s = proj.find(p => p.id === e.source);
            const t = proj.find(p => p.id === e.target);
            if (!s || !t) return;
            let x0 = s.subX, y0 = s.subY, x1 = t.subX, y1 = t.subY;
            let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
            let dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
            let err = dx - dy;
            while (true) {
                if (x0 >= 0 && x0 < subW && y0 >= 0 && y0 < subH) {
                    subBuf[y0 * subW + x0] = 1;
                }
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        });

        const sorted = [...proj].sort((a, b) => a.depth - b.depth);
        const maxD = Math.max(...proj.map(p => Math.abs(p.depth)), 1);

        sorted.forEach(n => {
            if (n.sx < 0 || n.sx >= W || n.sy < 0 || n.sy >= H) return;
            const isHub = n.linkCount >= 3;
            charBuf[n.sy][n.sx] = isHub ? "O" : "●";
            if (mode !== "dense") {
                if ((isHub || n.depth > maxD * 0.5) && n.depth > 0) {
                    const label = ` ${n.topic.slice(0, 15)}`;
                    for (let i = 0; i < label.length && n.sx + 1 + i < W; i++) {
                        if (charBuf[n.sy][n.sx + 1 + i] === " ") {
                            charBuf[n.sy][n.sx + 1 + i] = label[i];
                        }
                    }
                }
            }
        });

        const finalRows: string[] = [];
        for (let y = 0; y < H; y++) {
            let row = "";
            for (let x = 0; x < W; x++) {
                if (charBuf[y][x] !== " ") {
                    row += charBuf[y][x];
                } else {
                    const remapped = [
                        subBuf[(y * 4 + 0) * subW + (x * 2 + 0)],
                        subBuf[(y * 4 + 1) * subW + (x * 2 + 0)],
                        subBuf[(y * 4 + 2) * subW + (x * 2 + 0)],
                        subBuf[(y * 4 + 0) * subW + (x * 2 + 1)],
                        subBuf[(y * 4 + 1) * subW + (x * 2 + 1)],
                        subBuf[(y * 4 + 2) * subW + (x * 2 + 1)],
                        subBuf[(y * 4 + 3) * subW + (x * 2 + 0)],
                        subBuf[(y * 4 + 3) * subW + (x * 2 + 1)],
                    ];
                    const ch = getBrailleChar(remapped);
                    row += ch === "⠀" ? " " : ch;
                }
            }
            finalRows.push(row);
        }
        return { rows: finalRows };
    }, [baseNodes, edges, angle, W, H, cx, cy, mode]);

    return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
            <Box flexDirection="row" alignItems="center" flexShrink={0}>
                <Text color={Theme.colors.secondary}>┌─ </Text>
                <Text color={Theme.colors.primary} bold>NEURAL ARCHIVE EXPLORER [MODE: {mode.toUpperCase()}]</Text>
                <Text color={Theme.colors.secondary}> </Text>
                <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                <Text color={Theme.colors.primary}> {baseNodes.length}n·{edges.length}c </Text>
                <Text color={Theme.colors.secondary}>┐</Text>
            </Box>
            <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} flexGrow={1} flexDirection="column">
                <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={1}>
                    {rows.map((row, i) => (
                        <Box key={i} height={1}>
                            <Text color={Theme.colors.primary} dimColor={row.includes("●") || row.includes("O") ? false : true}>{row}</Text>
                        </Box>
                    ))}
                </Box>

                <Box flexDirection="column" marginTop={1}>
                    <Box flexDirection="row" alignItems="center" flexShrink={0}>
                        <Text color={Theme.colors.secondary}>├─ </Text>
                        <Text color={Theme.colors.primary} bold>LEGEND</Text>
                        <Text color={Theme.colors.secondary}> </Text>
                        <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                        <Text color={Theme.colors.secondary}>┤</Text>
                    </Box>
                    <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} paddingX={1} justifyContent="space-between">
                        <Box>
                            <Text color={Theme.colors.primary}>● hub </Text>
                            <Text color={Theme.colors.primary} dimColor>· node </Text>
                            <Text color={Theme.colors.secondary}>░ far </Text>
                            <Text color={Theme.colors.secondary} dimColor>⣿ high-res edge</Text>
                        </Box>
                        <Box>
                            <Text color={Theme.colors.primary} bold>G: </Text>
                            <Text color={Theme.colors.text.muted}>cycle mode</Text>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
