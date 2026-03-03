import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { Theme } from "../core/theme";
import { notepadService } from "../core/notes/service";
import { useMouseScroll } from "../core/hooks/useMouseScroll";

interface ConfigPanelProps {
  mode?: "CHAT" | "COMMAND" | "INSERT";
  configPath: string;
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

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ mode = "CHAT", configPath, panelWidth, panelHeight }) => {
  const { stdout } = useStdout();
  const editorHeight = panelHeight ?? ((stdout?.rows ?? 24) - 7);
  const termRows = Math.max(1, editorHeight - 3);
  const editorWidth = panelWidth ?? (stdout?.columns ?? 80);
  const gutterWidth = 7; // " 9999 │ "
  const viewportWidth = Math.max(1, editorWidth - gutterWidth - 1);

  const isInsert = mode === "INSERT";
  const isActive = mode === "COMMAND" || mode === "INSERT";

  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [cursor, setCursor] = useState<Pos>({ x: 0, y: 0 });
  const [preferredX, setPreferredX] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectionAnchor, setSelectionAnchor] = useState<Pos | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const lines = content.split("\n");
  const filename = basename(configPath);

  useEffect(() => {
    const load = async () => {
      try {
        const text = await readFile(configPath, "utf8");
        setContent(normalizeLineEndings(text));
      } catch {
        setContent("");
      }
      setIsDirty(false);
      setCursor({ x: 0, y: 0 });
      setPreferredX(0);
      setScrollOffset(0);
      setSelectionAnchor(null);
      setUndoStack([]);
      setRedoStack([]);
    };
    void load();
  }, [configPath]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const adjustScroll = (targetY: number) => {
    setScrollOffset((prev) => {
      if (targetY < prev) return targetY;
      if (targetY >= prev + termRows) return targetY - termRows + 1;
      return prev;
    });
  };

  const getSelectionBounds = () => {
    if (!selectionAnchor) return null;
    const c = clampPos(cursor, lines);
    const s = clampPos(selectionAnchor, lines);
    if (c.y < s.y || (c.y === s.y && c.x < s.x)) return { start: c, end: s };
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

  const updateContent = (newContent: string, newCursor?: Pos, skipHistory: boolean = false) => {
    const normalized = normalizeLineEndings(newContent);
    if (!skipHistory && content !== normalized) {
      setUndoStack((prev) => {
        const next = [...prev, content];
        if (next.length > 100) next.shift();
        return next;
      });
      setRedoStack([]);
    }
    setContent(normalized);
    setIsDirty(true);
    if (newCursor) {
      setCursor(newCursor);
      setPreferredX(newCursor.x);
      adjustScroll(newCursor.y);
    }
  };

  const handleMove = (newX: number, newY: number, setAnchor: boolean, keepPreferredX: boolean = false) => {
    if (setAnchor && !selectionAnchor) setSelectionAnchor(cursor);
    else if (!setAnchor) setSelectionAnchor(null);
    setCursor({ x: newX, y: newY });
    if (!keepPreferredX) setPreferredX(newX);
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

  const swallowState = useRef(false);

  useInput(async (rawInput: string, key: any) => {
    if (!isActive) return;
    let input = rawInput || "";

    if (swallowState.current) {
      const match = input.match(/[mM]/);
      if (match) {
        swallowState.current = false;
        input = input.slice(match.index! + 1);
      } else {
        return;
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
    const isCtrlBackspace = (key.ctrl && key.backspace) || input === "\x08";

    if (key.ctrl) {
      if (input === "s") {
        await writeFile(configPath, content, "utf8");
        setIsDirty(false);
        return;
      }
      if (input === "z") {
        setUndoStack((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const restore = next.pop()!;
          setRedoStack((rPrev) => [...rPrev, content]);
          setContent(restore);
          setSelectionAnchor(null);
          setIsDirty(true);
          return next;
        });
        return;
      }
      if (input === "y" || input === "r") {
        setRedoStack((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const restore = next.pop()!;
          setUndoStack((uPrev) => [...uPrev, content]);
          setContent(restore);
          setSelectionAnchor(null);
          setIsDirty(true);
          return next;
        });
        return;
      }
      if (input === "c") {
        const text = getSelectedText();
        if (text) await notepadService.copyToClipboard(text);
        return;
      }
      if (input === "x") {
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
      if (input === "v") {
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
      if (input === "a") {
        const endY = Math.max(0, lines.length - 1);
        const endX = lines[endY]?.length || 0;
        setSelectionAnchor({ x: 0, y: 0 });
        handleMove(endX, endY, true);
        return;
      }
      if (input === "e") {
        handleMove(lines[cursor.y]?.length || 0, cursor.y, shiftHeld);
        return;
      }
      if (isCtrlLeft) {
        if (cursor.x > 0) {
          handleMove(findWordLeft(lines[cursor.y], cursor.x), cursor.y, shiftHeld);
        } else if (cursor.y > 0) {
          handleMove(lines[cursor.y - 1].length, cursor.y - 1, shiftHeld);
        }
        return;
      }
      if (isCtrlRight) {
        const line = lines[cursor.y];
        if (cursor.x < line.length) {
          handleMove(findWordRight(line, cursor.x), cursor.y, shiftHeld);
        } else if (cursor.y < lines.length - 1) {
          handleMove(0, cursor.y + 1, shiftHeld);
        }
        return;
      }
      if (isCtrlUp) {
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (isCtrlDown) {
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
      } else if (cursor.x > 0) {
        const newLines = [...lines];
        newLines[cursor.y] = lines[cursor.y].slice(0, cursor.x - 1) + lines[cursor.y].slice(cursor.x);
        updateContent(newLines.join("\n"), { ...cursor, x: cursor.x - 1 });
      } else if (cursor.y > 0) {
        const prevLen = lines[cursor.y - 1].length;
        const newLines = [...lines];
        newLines.splice(cursor.y - 1, 2, lines[cursor.y - 1] + lines[cursor.y]);
        updateContent(newLines.join("\n"), { x: prevLen, y: cursor.y - 1 });
      }
    } else if (input) {
      const cleanInput = input.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
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
    isActive,
    onScrollUp: () => setScrollOffset((prev) => Math.max(0, prev - 3)),
    onScrollDown: () => setScrollOffset((prev) => Math.min(Math.max(0, lines.length - termRows), prev + 3)),
  });

  const visibleLines = lines.slice(scrollOffset, scrollOffset + termRows);

  const renderRow = (lineStr: string, actualY: number): { before: string; cursor: string | null; after: string } => {
    const isCursorLine = actualY === cursor.y && isActive;
    const safeCursor = Math.max(0, Math.min(lineStr.length, cursor.x));
    const viewStart = isCursorLine
      ? Math.max(0, Math.min(Math.max(0, lineStr.length - viewportWidth), safeCursor - Math.floor(viewportWidth / 2)))
      : 0;
    const viewEnd = viewStart + viewportWidth;

    if (!isCursorLine) {
      const visible = lineStr.slice(viewStart, viewEnd);
      return { before: visible || " ", cursor: null, after: "" };
    }

    const clampedCursor = Math.max(viewStart, Math.min(viewEnd - 1, safeCursor));
    const before = lineStr.slice(viewStart, clampedCursor);
    const cursorChar = lineStr[clampedCursor] ?? " ";
    const after = lineStr.slice(clampedCursor + 1, viewEnd);
    return { before, cursor: cursorChar, after };
  };

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box flexDirection="row" paddingX={1} flexShrink={0}>
        <Text color={Theme.colors.text.inverse} backgroundColor={Theme.colors.primary} bold>
          {` ${filename}${isDirty ? "*" : ""} `}
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        {visibleLines.map((lineStr, idx) => {
          const actualY = idx + scrollOffset;
          const lineNum = String(actualY + 1).padStart(4, " ");
          return (
            <Box key={actualY} height={1} flexDirection="row" overflow="hidden" width="100%">
              <Box width={gutterWidth} flexShrink={0} overflow="hidden">
                <Text color={Theme.colors.text.primary}>{` ${lineNum} │`}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                {(() => {
                  const row = renderRow(lineStr, actualY);
                  if (row.cursor === null) {
                    return (
                      <Text color={Theme.colors.text.primary} wrap="truncate-end">
                        {row.before}
                      </Text>
                    );
                  }
                  return (
                    <Text wrap="truncate-end">
                      <Text color={Theme.colors.text.primary}>{row.before}</Text>
                      <Text backgroundColor={Theme.colors.primary} color={Theme.colors.text.inverse}>{row.cursor}</Text>
                      <Text color={Theme.colors.text.primary}>{row.after}</Text>
                    </Text>
                  );
                })()}
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
          ))}
      </Box>

      <Box flexDirection="row" paddingX={1} flexShrink={0} justifyContent="space-between">
        <Text color={Theme.colors.text.inverse} bold>
          {filename} {isDirty ? "[+]" : ""}
        </Text>
        <Text color={Theme.colors.text.inverse}>
          {cursor.y + 1}, {cursor.x + 1}
        </Text>
      </Box>

      <Box flexDirection="row" paddingX={1} flexShrink={0}>
        <Text color={Theme.colors.text.muted} italic>
          ^S Save | ^Z/^Y Undo/Redo | ^A Select All | ^C/^V Copy/Paste
        </Text>
      </Box>
    </Box>
  );
};
