import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { notepadService, NoteState } from "../core/notes/service";
import { Theme } from "../core/theme";
import { useMouseScroll } from "../core/hooks/useMouseScroll";
import { Scrollbar } from "./Scrollbar";

interface NotepadViewProps {
    mode?: "CHAT" | "COMMAND" | "INSERT";
    panelWidth?: number;
    panelHeight?: number;
}

interface Pos {
    x: number;
    y: number;
}

const normalizeLineEndings = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const clampPos = (pos: Pos, rows: string[]): Pos => {
    const maxY = Math.max(0, rows.length - 1);
    const y = Math.max(0, Math.min(maxY, pos.y));
    const lineLen = rows[y]?.length || 0;
    const x = Math.max(0, Math.min(lineLen, pos.x));
    return { x, y };
};

export const NotepadView: React.FC<NotepadViewProps> = ({ mode = "CHAT", panelWidth, panelHeight }) => {
    const { stdout } = useStdout();
    // Micro UI reserves 1 line for tabs, 1 line for status bar, 1 line for hints = 3 lines.
    const editorHeight = panelHeight ?? ((stdout?.rows ?? 24) - 7);
    const termRows = Math.max(1, editorHeight - 3);
    const editorWidth = panelWidth ?? (stdout?.columns ?? 80);
    const gutterWidth = 7; // " 9999 │ "
    const viewportWidth = Math.max(1, editorWidth - gutterWidth - 1);

    const isInsert = mode === "INSERT";
    const isActive = mode === "COMMAND" || mode === "INSERT";

    // --- State: Tabs ---
    const [tabs, setTabs] = useState<NoteState[]>([notepadService.getState()]);
    const [activeTabIdx, setActiveTabIdx] = useState(0);
    const activeTab = tabs[activeTabIdx];

    // --- State: Editor Buffer ---
    const [content, setContent] = useState(normalizeLineEndings(activeTab?.content || ""));
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
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [renameInput, setRenameInput] = useState("");
    const [renameError, setRenameError] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Sync content when switching tabs
    useEffect(() => {
        if (activeTab && activeTab.content !== content) {
            setContent(normalizeLineEndings(activeTab.content));
            setCursor({ x: 0, y: 0 });
            setPreferredX(0);
            setScrollOffset(0);
            setSelectionAnchor(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTabIdx, tabs]);

    useEffect(() => {
        const clampedCursor = clampPos(cursor, lines);
        if (clampedCursor.x !== cursor.x || clampedCursor.y !== cursor.y) {
            setCursor(clampedCursor);
            setPreferredX(clampedCursor.x);
        }
        if (selectionAnchor) {
            const clampedAnchor = clampPos(selectionAnchor, lines);
            if (clampedAnchor.x !== selectionAnchor.x || clampedAnchor.y !== selectionAnchor.y) {
                setSelectionAnchor(clampedAnchor);
            }
        }
    }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

    // Async Load Synchronization
    // If NotepadView mounts immediately on boot, init() might still be loading scratchpad.txt
    useEffect(() => {
        const interval = setInterval(() => {
                const currentState = notepadService.getState();
                if (activeTabIdx === 0 && tabs.length === 1 && currentState.filename === "scratchpad.txt") {
                const normalizedContent = normalizeLineEndings(currentState.content);
                if (normalizedContent !== tabs[0].content) {
                    setTabs([{ ...currentState, content: normalizedContent }]);
                }
            }
        }, 500);
        return () => clearInterval(interval);
    }, [activeTabIdx, tabs]);

    // Update current buffer
    const updateContent = (newContent: string, newCursor?: Pos) => {
        const normalized = normalizeLineEndings(newContent);
        setContent(normalized);
        notepadService.updateContent(normalized);
        setTabs((prev) => {
            const next = [...prev];
            if (next[activeTabIdx]) {
                next[activeTabIdx] = { ...next[activeTabIdx], content: normalized, isDirty: true };
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
        const c = clampPos(cursor, lines);
        const s = clampPos(selectionAnchor, lines);
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
        if (!lines[start.y] || !lines[end.y]) return "";
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
        if (!currentLines[start.y] || !currentLines[end.y]) return null;
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

    const findWordLeft = (line: string, x: number): number => {
        let i = Math.max(0, Math.min(line.length, x));
        while (i > 0 && /\s/.test(line[i - 1])) i--;
        while (i > 0 && /\S/.test(line[i - 1])) i--;
        return i;
    };

    const findWordRight = (line: string, x: number): number => {
        let i = Math.max(0, Math.min(line.length, x));
        while (i < line.length && /\s/.test(line[i])) i++;
        while (i < line.length && /\S/.test(line[i])) i++;
        return i;
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

        const shiftHeld = !!key.shift || /\x1b\[[0-9;]*;[26][A-Za-z~]/.test(input);
        const isHome = key.home || input === "\x1b[H" || input === "\x1b[1~" || input === "\x1bOH";
        const isEnd = key.end || input === "\x1b[F" || input === "\x1b[4~" || input === "\x1bOF";
        const isCtrlLeft = (key.ctrl && key.leftArrow) || input === "\x1b[1;5D" || input === "\x1b[5D";
        const isCtrlRight = (key.ctrl && key.rightArrow) || input === "\x1b[1;5C" || input === "\x1b[5C";
        const isCtrlUp = (key.ctrl && key.upArrow) || input === "\x1b[1;5A" || input === "\x1b[5A";
        const isCtrlDown = (key.ctrl && key.downArrow) || input === "\x1b[1;5B" || input === "\x1b[5B";
        const isCtrlHome = (key.ctrl && isHome) || input === "\x1b[1;5H" || input === "\x1b[7;5~";
        const isCtrlEnd = (key.ctrl && isEnd) || input === "\x1b[1;5F" || input === "\x1b[8;5~";
        const isCtrlDelete = (key.ctrl && key.delete) || input === "\x1b[3;5~";
        const isCtrlBackspace = key.ctrl && key.backspace;

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
                    const newState = {
                        ...notepadService.getState(),
                        content: normalizeLineEndings(notepadService.getState().content),
                    };
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
            if (input === "r") {
                if (activeTab) {
                    setRenameInput(activeTab.filename);
                    setRenameError(null);
                    setShowRenameDialog(true);
                }
                return;
            }
            if (input === "d") {
                if (activeTab) {
                    setDeleteError(null);
                    setShowDeleteDialog(true);
                }
                return;
            }
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
            if (input === "n") {
                const filename = await notepadService.createNote("untitled.txt");
                if (activeTab?.isDirty) await notepadService.save();
                await notepadService.load(filename);
                const newState = {
                    ...notepadService.getState(),
                    content: normalizeLineEndings(notepadService.getState().content),
                };
                setTabs((prev) => [...prev, newState]);
                setActiveTabIdx(tabs.length);
                setSelectionAnchor(null);
                setScrollOffset(0);
                setCursor({ x: 0, y: 0 });
                setPreferredX(0);
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
                if (notepadService.undo()) {
                    const newState = notepadService.getState();
                    const normalized = normalizeLineEndings(newState.content);
                    setContent(normalized);
                    setTabs((prev) => {
                        const next = [...prev];
                        if (next[activeTabIdx]) next[activeTabIdx] = { ...next[activeTabIdx], content: normalized, isDirty: true };
                        return next;
                    });
                    setSelectionAnchor(null);
                }
                return;
            }
            if (input === "y") { // Redo
                if (notepadService.redo()) {
                    const newState = notepadService.getState();
                    const normalized = normalizeLineEndings(newState.content);
                    setContent(normalized);
                    setTabs((prev) => {
                        const next = [...prev];
                        if (next[activeTabIdx]) next[activeTabIdx] = { ...next[activeTabIdx], content: normalized, isDirty: true };
                        return next;
                    });
                    setSelectionAnchor(null);
                }
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
                const endY = Math.max(0, lines.length - 1);
                const endX = lines[endY]?.length || 0;
                setSelectionAnchor({ x: 0, y: 0 });
                handleMove(endX, endY, true);
                return;
            }
            if (input === "e") { // Was End, remove this or keep it as alternative
                handleMove(lines[cursor.y]?.length || 0, cursor.y, shiftHeld);
                return;
            }
            if (isCtrlLeft) { // Word jump left
                if (cursor.x > 0) {
                    handleMove(findWordLeft(lines[cursor.y], cursor.x), cursor.y, shiftHeld);
                } else if (cursor.y > 0) {
                    handleMove(lines[cursor.y - 1].length, cursor.y - 1, shiftHeld);
                }
                return;
            }
            if (isCtrlRight) { // Word jump right
                const line = lines[cursor.y];
                if (cursor.x < line.length) {
                    handleMove(findWordRight(line, cursor.x), cursor.y, shiftHeld);
                } else if (cursor.y < lines.length - 1) {
                    handleMove(0, cursor.y + 1, shiftHeld);
                }
                return;
            }
            if (isCtrlUp) { // Scroll Up
                setScrollOffset((prev) => Math.max(0, prev - 1));
                return;
            }
            if (isCtrlDown) { // Scroll Down
                setScrollOffset((prev) => Math.min(Math.max(0, lines.length - termRows), prev + 1));
                return;
            }
            if (isCtrlHome) {
                handleMove(0, 0, shiftHeld);
                return;
            }
            if (isCtrlEnd) {
                const lastY = Math.max(0, lines.length - 1);
                const lastX = lines[lastY]?.length || 0;
                handleMove(lastX, lastY, shiftHeld);
                return;
            }
        }

        // --- Rename Overlay ---
        if (showRenameDialog) {
            if (key.escape) {
                setShowRenameDialog(false);
                setRenameError(null);
                return;
            }
            if (key.return) {
                if (!activeTab) return;
                const nextName = renameInput.trim();
                if (!nextName) {
                    setRenameError("Filename cannot be empty");
                    return;
                }
                try {
                    if (activeTab.isDirty) {
                        await notepadService.save();
                    }
                    const oldName = activeTab.filename;
                    const renamed = await notepadService.renameFile(oldName, nextName);
                    setTabs((prev) =>
                        prev.map((t, i) =>
                            i === activeTabIdx
                                ? { ...t, filename: renamed, isDirty: false }
                                : (t.filename === oldName ? { ...t, filename: renamed } : t)
                        )
                    );
                    setShowRenameDialog(false);
                    setRenameError(null);
                } catch (e: unknown) {
                    setRenameError(e instanceof Error ? e.message : "Rename failed");
                }
                return;
            }
            if (key.backspace || key.delete) {
                setRenameInput((prev) => prev.slice(0, -1));
                return;
            }
            if (input) {
                const cleanInput = input.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
                if (cleanInput.length > 0) {
                    setRenameInput((prev) => prev + cleanInput);
                    setRenameError(null);
                }
            }
            return;
        }

        // --- Delete Overlay ---
        if (showDeleteDialog) {
            if (key.escape || input.toLowerCase() === "n") {
                setShowDeleteDialog(false);
                setDeleteError(null);
                return;
            }
            if (key.return || input.toLowerCase() === "y") {
                if (!activeTab) return;
                try {
                    const deletingName = activeTab.filename;
                    await notepadService.deleteFile(deletingName);

                    if (tabs.length > 1) {
                        const remaining = tabs.filter((_, i) => i !== activeTabIdx);
                        const nextIdx = Math.max(0, activeTabIdx - 1);
                        const nextTab = remaining[nextIdx];
                        setTabs(remaining);
                        setActiveTabIdx(nextIdx);
                        setContent(normalizeLineEndings(nextTab.content));
                        setCursor({ x: 0, y: 0 });
                        setPreferredX(0);
                        setScrollOffset(0);
                        setSelectionAnchor(null);
                        await notepadService.load(nextTab.filename);
                    } else {
                        await notepadService.load("scratchpad.txt");
                        const fallback = {
                            ...notepadService.getState(),
                            content: normalizeLineEndings(notepadService.getState().content),
                        };
                        setTabs([fallback]);
                        setActiveTabIdx(0);
                        setContent(fallback.content);
                        setCursor({ x: 0, y: 0 });
                        setPreferredX(0);
                        setScrollOffset(0);
                        setSelectionAnchor(null);
                    }

                    setShowDeleteDialog(false);
                    setDeleteError(null);
                } catch (e: unknown) {
                    setDeleteError(e instanceof Error ? e.message : "Delete failed");
                }
                return;
            }
            return;
        }

        // --- Navigation ---
        if (key.upArrow) {
            const newY = Math.max(0, cursor.y - 1);
            const lineLen = lines[newY]?.length || 0;
            handleMove(Math.min(preferredX, lineLen), newY, shiftHeld, true);
            return;
        }

        if (key.downArrow) {
            const newY = Math.min(lines.length - 1, cursor.y + 1);
            const lineLen = lines[newY]?.length || 0;
            handleMove(Math.min(preferredX, lineLen), newY, shiftHeld, true);
            return;
        }
        if (key.leftArrow) {
            if (cursor.x > 0) handleMove(cursor.x - 1, cursor.y, shiftHeld);
            else if (cursor.y > 0) handleMove(lines[cursor.y - 1].length, cursor.y - 1, shiftHeld);
            return;
        }
        if (key.rightArrow) {
            const lineLen = lines[cursor.y]?.length || 0;
            if (cursor.x < lineLen) handleMove(cursor.x + 1, cursor.y, shiftHeld);
            else if (cursor.y < lines.length - 1) handleMove(0, cursor.y + 1, shiftHeld);
            return;
        }
        if (key.pageUp) {
            handleMove(cursor.x, Math.max(0, cursor.y - termRows), shiftHeld);
            return;
        }
        if (key.pageDown) {
            handleMove(cursor.x, Math.min(lines.length - 1, cursor.y + termRows), shiftHeld);
            return;
        }

        if (isHome) {
            handleMove(0, cursor.y, shiftHeld);
            return;
        }
        if (isEnd) {
            handleMove(lines[cursor.y]?.length || 0, cursor.y, shiftHeld);
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
        } else if (isCtrlBackspace || isCtrlDelete || key.backspace || key.delete) {
            const delRes = deleteSelection();
            if (delRes) {
                updateContent(delRes.newLines.join("\n"), delRes.newCursor);
                setSelectionAnchor(null);
                return;
            }
            if (isCtrlBackspace) {
                if (cursor.x > 0) {
                    const line = lines[cursor.y];
                    const newX = findWordLeft(line, cursor.x);
                    const newLines = [...lines];
                    newLines[cursor.y] = line.slice(0, newX) + line.slice(cursor.x);
                    updateContent(newLines.join("\n"), { x: newX, y: cursor.y });
                } else if (cursor.y > 0) {
                    const prevLen = lines[cursor.y - 1].length;
                    const newLines = [...lines];
                    newLines.splice(cursor.y - 1, 2, lines[cursor.y - 1] + lines[cursor.y]);
                    updateContent(newLines.join("\n"), { x: prevLen, y: cursor.y - 1 });
                }
            } else if (isCtrlDelete) {
                const line = lines[cursor.y];
                if (cursor.x < line.length) {
                    const newX = findWordRight(line, cursor.x);
                    const newLines = [...lines];
                    newLines[cursor.y] = line.slice(0, cursor.x) + line.slice(newX);
                    updateContent(newLines.join("\n"), { x: cursor.x, y: cursor.y });
                } else if (cursor.y < lines.length - 1) {
                    const newLines = [...lines];
                    newLines.splice(cursor.y, 2, lines[cursor.y] + lines[cursor.y + 1]);
                    updateContent(newLines.join("\n"), { x: cursor.x, y: cursor.y });
                }
            } else {
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

    const renderRow = (lineStr: string, actualY: number): React.ReactNode => {
        const isCursorLine = actualY === cursor.y && isActive;
        const safeCursor = Math.max(0, Math.min(lineStr.length, cursor.x));
        const viewStart = isCursorLine
            ? Math.max(0, Math.min(Math.max(0, lineStr.length - viewportWidth), safeCursor - Math.floor(viewportWidth / 2)))
            : 0;
        const viewEnd = viewStart + viewportWidth;

        const parts: React.ReactNode[] = [];
        let runText = "";
        let runKey = "normal";

        const flushRun = (k: string) => {
            if (!runText) return;
            if (runKey === "cursor") {
                parts.push(<Text key={k} backgroundColor={Theme.colors.primary} color={Theme.colors.text.inverse}>{runText}</Text>);
            } else if (runKey === "selected") {
                parts.push(<Text key={k} backgroundColor={Theme.colors.secondary} color={Theme.colors.text.inverse}>{runText}</Text>);
            } else {
                parts.push(<Text key={k} color={Theme.colors.text.primary}>{runText}</Text>);
            }
            runText = "";
        };

        for (let absX = viewStart; absX < viewEnd; absX++) {
            const isCursorCell = isCursorLine && absX === safeCursor;
            const inLine = absX < lineStr.length;
            const ch = inLine ? lineStr[absX] : " ";
            const isSel = inLine && isSelected(absX, actualY);
            const nextKey = isCursorCell ? "cursor" : (isSel ? "selected" : "normal");
            if (nextKey !== runKey) {
                flushRun(`${actualY}-${absX}`);
                runKey = nextKey;
            }
            runText += ch;
        }
        flushRun(`${actualY}-end`);
        return <Text wrap="truncate-end">{parts.length > 0 ? parts : " "}</Text>;
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
            ) : showRenameDialog ? (
                <Box flexGrow={1} justifyContent="center" alignItems="center">
                    <Box flexDirection="column" borderStyle="round" borderColor={Theme.colors.primary} padding={1} width="80%">
                        <Text color={Theme.colors.primary} bold>Rename File (Enter to apply, Esc to cancel)</Text>
                        <Box marginTop={1}>
                            <Text>{renameInput || " "}</Text>
                        </Box>
                        {renameError ? (
                            <Box marginTop={1}>
                                <Text color={Theme.colors.status.error}>{renameError}</Text>
                            </Box>
                        ) : null}
                    </Box>
                </Box>
            ) : showDeleteDialog ? (
                <Box flexGrow={1} justifyContent="center" alignItems="center">
                    <Box flexDirection="column" borderStyle="round" borderColor={Theme.colors.status.error} padding={1} width="80%">
                        <Text color={Theme.colors.status.error} bold>Delete file permanently?</Text>
                        <Box marginTop={1}>
                            <Text color={Theme.colors.text.primary}>
                                {activeTab ? activeTab.filename : "(no active file)"}
                            </Text>
                        </Box>
                        <Box marginTop={1}>
                            <Text color={Theme.colors.text.muted}>Enter/Y = delete | Esc/N = cancel</Text>
                        </Box>
                        {deleteError ? (
                            <Box marginTop={1}>
                                <Text color={Theme.colors.status.error}>{deleteError}</Text>
                            </Box>
                        ) : null}
                    </Box>
                </Box>
            ) : (
                <Box flexGrow={1} flexDirection="row" overflow="hidden">
                    <Box flexDirection="column" flexGrow={1} overflow="hidden">
                        {visibleLines.map((lineStr, idx) => {
                            const actualY = idx + scrollOffset;
                            const lineNum = String(actualY + 1).padStart(4, " ");
                            return (
                                <Box key={actualY} height={1} flexDirection="row" overflow="hidden" width="100%">
                                    <Box width={gutterWidth} flexShrink={0} overflow="hidden">
                                        <Text color={Theme.colors.text.primary}>{` ${lineNum} │`}</Text>
                                    </Box>
                                    <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                                        {renderRow(lineStr, actualY)}
                                    </Box>
                                </Box>
                            );
                        })}
                        {visibleLines.length < termRows &&
                            Array.from({ length: termRows - visibleLines.length }).map((_, i) => (
                                <Box key={`empty-${i}`} height={1} width="100%" flexDirection="row" overflow="hidden">
                                    <Box width={gutterWidth} flexShrink={0} overflow="hidden">
                                        <Text color={Theme.colors.secondary} bold dimColor>{"   ~ │"}</Text>
                                    </Box>
                                    <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                                        <Text>{" "}</Text>
                                    </Box>
                                </Box>
                            ))
                        }
                    </Box>
                    {lines.length > termRows && (
                        <Box width={1} marginLeft={1} flexShrink={0}>
                            <Scrollbar show={termRows} current={scrollOffset} total={lines.length} />
                        </Box>
                    )}
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
                    ^S Save | ^N New | ^O Open | ^R Rename | ^D Delete | ^Q Close Tab | ^C/^V Copy/Paste | ^Z/^Y Undo/Redo
                </Text>
            </Box>
        </Box>
    );
};
