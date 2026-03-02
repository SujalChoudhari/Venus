import React, { useState, useEffect, useMemo } from "react";
import { Box, Text } from "ink";
import { getDatabase } from "../core/memory";
import { Theme } from "../core/theme";

/**
 * Simplified Cinematic Knowledge Graph (Node-Only)
 * Clean spherical view with 3-axis rotation and recent highlights.
 */

interface GraphNode { id: string; topic: string; }

type CellType = 'none' | 'node' | 'recent';
interface RenderCell { char: string; type: CellType; }

export const KnowledgeGraphPanel: React.FC<{ panelWidth?: number }> = ({ panelWidth = 40 }) => {
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [angles, setAngles] = useState({ x: 0, y: 0, z: 0 });

    const graphW = panelWidth - 4;
    const graphH = 12;
    const cx = Math.floor(graphW / 2);
    const cy = Math.floor(graphH / 2);

    useEffect(() => {
        const fetch = () => {
            try {
                const db = getDatabase();
                const n = db.query(`
                    SELECT id, topic FROM long_term_memory ORDER BY updated_at DESC LIMIT 150
                `).all() as GraphNode[];
                setNodes(n);
            } catch { }
        };
        fetch();
        const id = setInterval(fetch, 6000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const id = setInterval(() => {
            setAngles(a => ({
                x: (a.x + 0.011) % (Math.PI * 2),
                y: (a.y + 0.017) % (Math.PI * 2),
                z: (a.z + 0.007) % (Math.PI * 2)
            }));
        }, 80);
        return () => clearInterval(id);
    }, []);

    const baseNodes = useMemo(() => {
        if (nodes.length === 0) return [];
        const r = 20;

        // Simple deterministic hash function for semi-stable random distribution
        const stringToSeed = (s: string) => {
            let hash = 0;
            for (let i = 0; i < s.length; i++) {
                hash = ((hash << 5) - hash) + s.charCodeAt(i);
                hash |= 0; // Convert to 32bit integer
            }
            return Math.abs(hash);
        };

        // Pseudo-random number generator using a seed
        const mulberry32 = (seed: number) => {
            return () => {
                seed |= 0;
                seed = seed + 0x6D2B79F5 | 0;
                let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
                t = t + Math.imul(t ^ t >>> 13, 1 | t) | 0;
                return ((t ^ t >>> 16) >>> 0) / 4294967296;
            };
        };

        return nodes.map((node, i) => {
            const seed = stringToSeed(node.id);
            const rand = mulberry32(seed);

            const phi = rand() * Math.PI; // 0 to PI
            const theta = rand() * 2 * Math.PI; // 0 to 2PI

            // Minimal jitter for organic sphere feel
            const jitter = 0.9 + (rand() * 0.2); // 0.9 to 1.1

            return {
                ...node,
                x3d: r * jitter * Math.sin(phi) * Math.cos(theta),
                y3d: r * jitter * Math.cos(phi),
                z3d: r * jitter * Math.sin(phi) * Math.sin(theta),
                isRecent: i < 8
            };
        });
    }, [nodes]);

    const renderedRows = useMemo(() => {
        const charBuf: RenderCell[][] = Array(graphH).fill(0).map(() =>
            Array(graphW).fill(0).map(() => ({ char: " ", type: 'none' }))
        );

        if (baseNodes.length === 0) return charBuf;

        // 3D Rotation Projection
        const projRaw = baseNodes.map(n => {
            let { x3d: x, y3d: y, z3d: z } = n;
            let y1 = y * Math.cos(angles.x) - z * Math.sin(angles.x);
            let z1 = y * Math.sin(angles.x) + z * Math.cos(angles.x);
            let x2 = x * Math.cos(angles.y) + z1 * Math.sin(angles.y);
            let z2 = -x * Math.sin(angles.y) + z1 * Math.cos(angles.y);
            let x3 = x2 * Math.cos(angles.z) - y1 * Math.sin(angles.z);
            let y3 = x2 * Math.sin(angles.z) + y1 * Math.cos(angles.z);
            return { ...n, rx: x3, ry: y3, rz: z2 };
        });

        // Auto-Zoom
        let maxAbsX = 0, maxAbsY = 0;
        projRaw.forEach(p => {
            maxAbsX = Math.max(maxAbsX, Math.abs(p.rx));
            maxAbsY = Math.max(maxAbsY, Math.abs(p.ry));
        });
        const scale = Math.min(
            maxAbsX > 0 ? (graphW * 0.45) / maxAbsX : 1,
            maxAbsY > 0 ? (graphH * 0.45) / maxAbsY : 1
        );

        const proj = projRaw.map(p => ({
            ...p,
            sx: Math.floor(cx + p.rx * scale * 2),
            sy: Math.floor(cy + p.ry * scale),
            depth: p.rz
        }));

        // Render Nodes
        proj.sort((a, b) => a.depth - b.depth);
        proj.forEach(n => {
            if (n.sx >= 0 && n.sx < graphW && n.sy >= 0 && n.sy < graphH) {
                charBuf[n.sy][n.sx] = {
                    char: n.isRecent ? "●" : (n.depth > 0 ? "●" : "·"),
                    type: n.isRecent ? 'recent' : 'node'
                };
            }
        });

        return charBuf;
    }, [baseNodes, angles, graphW, graphH, cx, cy]);

    const renderLine = (row: RenderCell[], y: number) => {
        const segments: React.ReactNode[] = [];
        let currentType: CellType = 'none';
        let currentStr = "";

        const flush = (key: string) => {
            if (!currentStr) return;
            segments.push(
                <Text
                    key={key}
                    color={currentType === 'recent' ? Theme.colors.primary : Theme.colors.text.muted}
                    dimColor={currentType === 'node'}
                >
                    {currentStr}
                </Text>
            );
        };

        row.forEach((cell, x) => {
            if (cell.type !== currentType) {
                flush(`${y}-${x}`);
                currentStr = cell.char;
                currentType = cell.type;
            } else currentStr += cell.char;
        });
        flush(`${y}-end`);
        return <Box key={y} height={1}>{segments}</Box>;
    };

    return (
        <Box flexDirection="column" width={panelWidth} marginBottom={1}>
            <Box flexDirection="row" alignItems="center" flexShrink={0}>
                <Text color={Theme.colors.secondary}>┌─ </Text>
                <Text color={Theme.colors.primary} bold>NEURAL CORE</Text>
                <Text color={Theme.colors.secondary}> </Text>
                <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
                <Text color={Theme.colors.text.muted}> {nodes.length}n </Text>
                <Text color={Theme.colors.secondary}>┐</Text>
            </Box>
            <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} height={14} paddingX={1} flexDirection="column" justifyContent="center">
                {renderedRows.map((row, y) => renderLine(row, y))}
            </Box>
        </Box>
    );
};