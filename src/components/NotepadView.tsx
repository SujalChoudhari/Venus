import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { notepadService, NoteState } from "../core/notes/service";
import { Theme } from "../core/theme";
import { useMouseScroll } from "../core/hooks/useMouseScroll";

interface NotepadViewProps {
    mode?: "CHAT" | "COMMAND" | "INSERT";
}

interface Pos {
    x: number;
    y: number;
}

export const NotepadView: React.FC<NotepadViewProps> = ({ mode = "CHAT" }) => {
    const { stdout } = useStdout();
    // Micro UI reserves 1 line for tabs, 1 line for status bar, 1 line for hints = 3 lines.
    // Plus any container borders from parent = another ~4 lines.
    const termRows = (stdout?.rows ?? 24) - 7;
    const termCols = (stdout?.columns ?? 80) - 8;

    const isInsert = mode === "INSERT";
    const isActive = mode === "COMMAND" || mode === "INSERT";

    // --- State: Tabs ---
    const [tabs, setTabs] = useState<NoteState[]>([notepadService.getState()]);
    const [activeTabIdx, setActiveTabIdx] = useState(0);
    const activeTab = tabs[activeTabIdx];

    // --- State: Editor Buffer ---
    const [content, setContent] = useState(activeTab?.content || "");
    const lines = content.split("\n");

    // --- State: Cursor & View ---
    const [cursor, setCursor] = useState<Pos>({ x: 0, y: 0 });
    const [preferredX, setPreferredX] = useState<number>(0);
    const [scrollOffset, setScrollOffset] = useState<number>(0);
    const [selectionAnchor, setSelectionAnchor] = useState<Pos | null>(null);

    // --- State: Overlays ---
    const [showFileSwitcher, setShowFileSwitcher] = useState(false);
    const [fileList, setFileList] = useState<string[]>([]);
    const [fileSwitcherIndex, setFileSwitcherIndex] = useState(0);

    // Sync content when switching tabs
    useEffect(() => {
        if (activeTab && activeTab.content !== content) {
            setContent(activeTab.content);
            setCursor({ x: 0, y: 0 });
            setPreferredX(0);
            setScrollOffset(0);
            setSelectionAnchor(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTabIdx, tabs]);

    // Async Load Synchronization
    // If NotepadView mounts immediately on boot, init() might still be loading scratchpad.txt
    useEffect(() => {
        const interval = setInterval(() => {
            const currentState = notepadService.getState();
            if (activeTabIdx === 0 && tabs.length === 1 && currentState.filename === "scratchpad.txt") {
                if (currentState.content !== tabs[0].content) {
                    setTabs([currentState]);
                }
            }
        }, 500);
        return () => clearInterval(interval);
    }, [activeTabIdx, tabs]);

    // Update current buffer
    const updateContent = (newContent: string, newCursor?: Pos) => {
        setContent(newContent);
        notepadService.updateContent(newContent);
        setTabs((prev) => {
            const next = [...prev];
            if (next[activeTabIdx]) {
                next[activeTabIdx] = { ...next[activeTabIdx], content: newContent, isDirty: true };
            }
            return next;
        });

        if (newCursor) {
            setCursor(newCursor);
            setPreferredX(newCursor.x);
            adjustScroll(newCursor.y);
        }
    };

    const adjustScroll = (targetY: number) => {
        setScrollOffset((prev) => {
            if (targetY < prev) return targetY;
            if (targetY >= prev + termRows) return targetY - termRows + 1;
            return prev;
        });
    };

    // --- Editor Math & Selections ---
    const getSelectionBounds = () => {
        if (!selectionAnchor) return null;
        const c = cursor;
        const s = selectionAnchor;
        if (c.y < s.y || (c.y === s.y && c.x < s.x)) {
            return { start: c, end: s };
        }
        return { start: s, end: c };
    };

    const isSelected = (x: number, y: number): boolean => {
        const bounds = getSelectionBounds();
        if (!bounds) return false;
        const { start, end } = bounds;
        if (y < start.y || y > end.y) return false;
        if (y === start.y && y === end.y) return x >= start.x && x < end.x;
        if (y === start.y) return x >= start.x;
        if (y === end.y) return x < end.x;
        return true;
    };

    const getSelectedText = (): string => {
        const bounds = getSelectionBounds();
        if (!bounds) return "";
        const { start, end } = bounds;
        if (start.y === end.y) return lines[start.y].slice(start.x, end.x);
        let text = lines[start.y].slice(start.x) + "\n";
        for (let i = start.y + 1; i < end.y; i++) text += lines[i] + "\n";
        text += lines[end.y].slice(0, end.x);
        return text;
    };

    const deleteSelection = (): { newLines: string[]; newCursor: Pos } | null => {
        const bounds = getSelectionBounds();
        if (!bounds) return null;
        const currentLines = [...lines];
        const { start, end } = bounds;
        currentLines[start.y] = currentLines[start.y].slice(0, start.x) + currentLines[end.y].slice(end.x);
        currentLines.splice(start.y + 1, end.y - start.y);
        return { newLines: currentLines, newCursor: start };
    };

    const handleMove = (newX: number, newY: number, setAnchor: boolean, keepPreferredX: boolean = false) => {
        if (setAnchor && !selectionAnchor) {
            setSelectionAnchor(cursor);
        } else if (!setAnchor) {
            setSelectionAnchor(null);
        }
        setCursor({ x: newX, y: newY });
        if (!keepPreferredX) {
            setPreferredX(newX);
        }
        adjustScroll(newY);
    };

    // --- Input Handling ---
    const swallowState = useRef(false);

    useInput(async (rawInput: string, key: any) => {
        if (!isActive) return;

        let input = rawInput || "";

        // Swallower for Mouse Scroll ANSI Sequences
        if (swallowState.current) {
            const match = input.match(/[mM]/);
            if (match) {
                swallowState.current = false;
                input = input.slice(match.index! + 1);
            } else {
                return; // Wait for rest of sequence
            }
        }
        while (input.includes("[<")) {
            const startIdx = input.indexOf("[<");
            const match = input.substring(startIdx).match(/[mM]/);
            if (match) {
                input = input.substring(0, startIdx) + input.substring(startIdx + match.index! + 1);
            } else {
                swallowState.current = true;
                input = input.substring(0, startIdx);
                break;
            }
        }

        // --- File Switcher Overlay ---
        if (showFileSwitcher) {
            if (key.escape) {
                setShowFileSwitcher(false);
                return;
            }
            if (key.upArrow) {
                setFileSwitcherIndex((prev) => Math.max(0, prev - 1));
            } else if (key.downArrow) {
                setFileSwitcherIndex((prev) => Math.min(fileList.length - 1, prev + 1));
            } else if (key.return) {
                const filename = fileList[fileSwitcherIndex];
                if (filename) {
                    if (activeTab?.isDirty) await notepadService.save();
                    await notepadService.load(filename);
                    const newState = notepadService.getState();
                    const existingIdx = tabs.findIndex((t) => t.filename === filename);
                    if (existingIdx !== -1) {
                        setTabs((prev) => {
                            const next = [...prev];
                            next[existingIdx] = newState;
                            return next;
                        });
                        setActiveTabIdx(existingIdx);
                    } else {
                        setTabs((prev) => [...prev, newState]);
                        setActiveTabIdx(tabs.length);
                    }
                }
                setShowFileSwitcher(false);
            }
            return;
        }

        // --- Global Micro Shortcuts ---
        if (key.ctrl) {
            if (input === "s") {
                await notepadService.save();
                setTabs((prev) => {
                    const next = [...prev];
                    next[activeTabIdx] = { ...next[activeTabIdx], isDirty: false };
                    return next;
                });
                return;
            }
            if (input === "w" || input === "q") { // Ctrl+Q or W to close tab
                if (tabs.length > 1) {
                    setTabs((prev) => prev.filter((_, i) => i !== activeTabIdx));
                    setActiveTabIdx((prev) => Math.max(0, prev - 1));
                }
                return;
            }
            if (input === "o") {
                const list = await notepadService.listFiles();
                setFileList(list);
                setFileSwitcherIndex(0);
                setShowFileSwitcher(true);
                return;
            }
            if (input === "z") { // Undo
                if (notepadService.undo()) setContent(notepadService.getState().content);
                return;
            }
            if (input === "y" || input === "r") { // Redo
                if (notepadService.redo()) setContent(notepadService.getState().content);
                return;
            }
            if (input === "c") { // Copy
                const text = getSelectedText();
                if (text) await notepadService.copyToClipboard(text);
                return;
            }
            if (input === "x") { // Cut
                const text = getSelectedText();
                if (text) {
                    await notepadService.copyToClipboard(text);
                    const delRes = deleteSelection();
                    if (delRes) {
                        updateContent(delRes.newLines.join("\n"), delRes.newCursor);
                        setSelectionAnchor(null);
                    }
                }
                return;
            }
            if (input === "v") { // Paste
                const text = await notepadService.readFromClipboard();
                if (!text) return;
                let baseLines = lines;
                let baseCur = cursor;
                const delRes = deleteSelection();
                if (delRes) {
                    baseLines = delRes.newLines;
                    baseCur = delRes.newCursor;
                }
                const pasteLines = text.replace(/\r\n/g, "\n").split("\n");
                const newLines = [...baseLines];
                const lineBefore = newLines[baseCur.y].slice(0, baseCur.x);
                const lineAfter = newLines[baseCur.y].slice(baseCur.x);

                if (pasteLines.length === 1) {
                    newLines[baseCur.y] = lineBefore + pasteLines[0] + lineAfter;
                    updateContent(newLines.join("\n"), { y: baseCur.y, x: baseCur.x + pasteLines[0].length });
                } else {
                    newLines[baseCur.y] = lineBefore + pasteLines[0];
                    const midLines = pasteLines.slice(1, -1);
                    const lastLine = pasteLines[pasteLines.length - 1];
                    newLines.splice(baseCur.y + 1, 0, ...midLines, lastLine + lineAfter);
                    updateContent(newLines.join("\n"), { y: baseCur.y + pasteLines.length - 1, x: lastLine.length });
                }
                setSelectionAnchor(null);
                return;
            }
            if (input === "a") { // Select All
                setSelectionAnchor({ x: 0, y: 0 });
                handleMove(lines[lines.length - 1].length, lines.length - 1, true);
                return;
            }
            if (input === "e") { // Was End, remove this or keep it as alternative
                handleMove(lines[cursor.y]?.length || 0, cursor.y, key.shift);
                return;
            }
            if (key.leftArrow) { // Word jump left
                const line = lines[cursor.y];
                const before = line.slice(0, cursor.x);
                const match = before.match(/(\w+\W*|\W+)$/);
                if (match) handleMove(Math.max(0, cursor.x - match[0].length), cursor.y, key.shift);
                else if (cursor.y > 0) handleMove(lines[cursor.y - 1].length, cursor.y - 1, key.shift);
                return;
            }
            if (key.rightArrow) { // Word jump right
                const line = lines[cursor.y];
                const after = line.slice(cursor.x);
                const match = after.match(/^(\W*\w+|\W+)/);
                if (match) handleMove(Math.min(line.length, cursor.x + match[0].length), cursor.y, key.shift);
                else if (cursor.y < lines.length - 1) handleMove(0, cursor.y + 1, key.shift);
                return;
            }
            if (key.upArrow) { // Scroll Up
                setScrollOffset((prev) => Math.max(0, prev - 1));
                return;
            }
            if (key.downArrow) { // Scroll Down
                setScrollOffset((prev) => Math.min(Math.max(0, lines.length - termRows), prev + 1));
                return;
            }
        }

        // --- Navigation ---
        if (key.upArrow) {
            const newY = Math.max(0, cursor.y - 1);
            const lineLen = lines[newY]?.length || 0;
            handleMove(Math.min(preferredX, lineLen), newY, key.shift, true);
            return;
        }
        if (key.downArrow) {
            const newY = Math.min(lines.length - 1, cursor.y + 1);
            const lineLen = lines[newY]?.length || 0;
            handleMove(Math.min(preferredX, lineLen), newY, key.shift, true);
            return;
        }
        if (key.leftArrow) {
            if (cursor.x > 0) handleMove(cursor.x - 1, cursor.y, key.shift);
            else if (cursor.y > 0) handleMove(lines[cursor.y - 1].length, cursor.y - 1, key.shift);
            return;
        }
        if (key.rightArrow) {
            const lineLen = lines[cursor.y]?.length || 0;
            if (cursor.x < lineLen) handleMove(cursor.x + 1, cursor.y, key.shift);
            else if (cursor.y < lines.length - 1) handleMove(0, cursor.y + 1, key.shift);
            return;
        }
        if (key.pageUp) {
            handleMove(cursor.x, Math.max(0, cursor.y - termRows), key.shift);
            return;
        }
        if (key.pageDown) {
            handleMove(cursor.x, Math.min(lines.length - 1, cursor.y + termRows), key.shift);
            return;
        }

        // Home & End parsing (Ink doesn't strictly type these, but passes them in `key.name` or raw `input`)
        if (key.home || input === '\x1b[H' || input === '\x1b[1~' || input === '\x1bOH') {
            handleMove(0, cursor.y, key.shift);
            return;
        }
        if (key.end || input === '\x1b[F' || input === '\x1b[4~' || input === '\x1bOF') {
            handleMove(lines[cursor.y]?.length || 0, cursor.y, key.shift);
            return;
        }

        // --- Typing / Buffering (requires INSERT mode) ---
        if (!isInsert) return;

        if (key.return) {
            const delRes = deleteSelection();
            let baseLines = lines;
            let baseCur = cursor;
            if (delRes) {
                baseLines = delRes.newLines;
                baseCur = delRes.newCursor;
            }
            const line = baseLines[baseCur.y];
            const newLines = [...baseLines];
            newLines[baseCur.y] = line.substring(0, baseCur.x);
            newLines.splice(baseCur.y + 1, 0, line.substring(baseCur.x));
            updateContent(newLines.join("\n"), { x: 0, y: baseCur.y + 1 });
            setSelectionAnchor(null);
        } else if (key.backspace || key.delete) {
            const delRes = deleteSelection();
            if (delRes) {
                updateContent(delRes.newLines.join("\n"), delRes.newCursor);
                setSelectionAnchor(null);
                return;
            }
            if (key.backspace || key.delete) {
                // Windows terminal often maps Backspace to key.delete. We enforce backward deletion for both.
                if (cursor.x > 0) {
                    const newLines = [...lines];
                    newLines[cursor.y] = lines[cursor.y].slice(0, cursor.x - 1) + lines[cursor.y].slice(cursor.x);
                    updateContent(newLines.join("\n"), { ...cursor, x: cursor.x - 1 });
                } else if (cursor.y > 0) {
                    const prevLen = lines[cursor.y - 1].length;
                    const newLines = [...lines];
                    newLines.splice(cursor.y - 1, 2, lines[cursor.y - 1] + lines[cursor.y]);
                    updateContent(newLines.join("\n"), { x: prevLen, y: cursor.y - 1 });
                }
            }
        } else if (input) {
            const cleanInput = input.replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // strip controls
            if (cleanInput.length > 0) {
                let baseLines = lines;
                let baseCur = cursor;
                const delRes = deleteSelection();
                if (delRes) {
                    baseLines = delRes.newLines;
                    baseCur = delRes.newCursor;
                }
                const newLines = [...baseLines];
                newLines[baseCur.y] = baseLines[baseCur.y].slice(0, baseCur.x) + cleanInput + baseLines[baseCur.y].slice(baseCur.x);
                updateContent(newLines.join("\n"), { ...baseCur, x: baseCur.x + cleanInput.length });
                setSelectionAnchor(null);
            }
        }
    });

    useMouseScroll({
        isActive: isActive,
        onScrollUp: () => setScrollOffset((prev) => Math.max(0, prev - 3)),
        onScrollDown: () => setScrollOffset((prev) => Math.min(Math.max(0, lines.length - termRows), prev + 3))
    });

    // --- Render Logic ---
    const visibleLines = lines.slice(scrollOffset, scrollOffset + termRows);

    const renderLine = (lineStr: string, actualY: number) => {
        const isCursorLine = actualY === cursor.y && isActive;
        const lineLen = lineStr.length;

        let chars = [];
        for (let x = 0; x <= lineLen; x++) {
            const isCursor = isCursorLine && x === cursor.x;
            const isSel = isSelected(x, actualY);
            const char = lineStr[x] || " ";

            chars.push(
                <Text
                    key={x}
                    backgroundColor={isCursor ? Theme.colors.primary : isSel ? Theme.colors.secondary : undefined}
                    color={isCursor || isSel ? Theme.colors.text.inverse : Theme.colors.text.primary}
                >
                    {char}
                </Text>
            );
        }

        // Horizontal overflow handling (very simple approach)
        if (chars.length > termCols) {
            if (cursor.x >= termCols - 5 && isCursorLine) {
                chars = chars.slice(cursor.x - termCols + 10, cursor.x + 10);
            } else {
                chars = chars.slice(0, termCols);
            }
        }
        return <Box flexGrow={1} overflow="hidden"><Text wrap="truncate-end">{chars}</Text></Box>;
    };

    return (
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {/* 1. Header Array (TabBar) */}
            <Box flexDirection="row" paddingX={1} flexShrink={0}>
                {tabs.map((tab, idx) => {
                    const isTabActive = idx === activeTabIdx;
                    return (
                        <Box key={idx} marginRight={2}>
                            <Text
                                color={isTabActive ? Theme.colors.text.inverse : Theme.colors.text.primary}
                                backgroundColor={isTabActive ? Theme.colors.primary : undefined}
                                bold={isTabActive}
                            >
                                {` ${tab.filename}${tab.isDirty ? "*" : ""} `}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            {/* 2. Main Buffer Area */}
            {showFileSwitcher ? (
                <Box flexGrow={1} justifyContent="center" alignItems="center">
                    <Box flexDirection="column" borderStyle="round" borderColor={Theme.colors.primary} padding={1} width="80%">
                        <Text color={Theme.colors.primary} bold>Select File (Enter to load, Esc to cancel)</Text>
                        <Box flexDirection="column" marginTop={1}>
                            {fileList.length === 0 ? <Text dimColor>No files...</Text> : null}
                            {fileList.map((f, i) => (
                                <Text key={f} color={i === fileSwitcherIndex ? Theme.colors.primary : Theme.colors.text.primary}>
                                    {i === fileSwitcherIndex ? "> " : "  "}{f}
                                </Text>
                            ))}
                        </Box>
                    </Box>
                </Box>
            ) : (
                <Box flexGrow={1} flexDirection="column" overflow="hidden">
                    {visibleLines.map((lineStr, idx) => {
                        const actualY = idx + scrollOffset;
                        const lineNum = String(actualY + 1).padStart(4, " ");
                        return (
                            <Box key={actualY} height={1} flexDirection="row" overflow="hidden">
                                <Text color={Theme.colors.secondary} bold> {lineNum} │ </Text>
                                {renderLine(lineStr, actualY)}
                            </Box>
                        );
                    })}
                    {visibleLines.length < termRows &&
                        Array.from({ length: termRows - visibleLines.length }).map((_, i) => (
                            <Box key={`empty-${i}`} height={1}>
                                <Text color={Theme.colors.secondary} bold dimColor>   ~ │</Text>
                            </Box>
                        ))
                    }
                </Box>
            )}

            {/* 3. Micro Status Bar */}
            <Box flexDirection="row" paddingX={1} flexShrink={0} justifyContent="space-between">
                <Text color={Theme.colors.text.inverse} bold>
                    {activeTab?.filename} {activeTab?.isDirty ? "[+]" : ""}
                </Text>
                <Text color={Theme.colors.text.inverse}>
                    {cursor.y + 1}, {cursor.x + 1}
                </Text>
            </Box>

            {/* 4. Helper/Hint Bar */}
            <Box flexDirection="row" paddingX={1} flexShrink={0}>
                <Text color={Theme.colors.text.muted} italic>
                    ^S Save | ^O Open | ^Q Close Tab | ^C/^V Copy/Paste | ^Z Undo | ^A/^E Home/End
                </Text>
            </Box>
        </Box>
    );
};
