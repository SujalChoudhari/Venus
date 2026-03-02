import React, { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { COMMANDS, CommandMenu } from "./CommandMenu";
import { Theme } from "../core/theme";

interface InputBarProps {
  onSubmit: (input: string) => void;
  isLoading?: boolean;
  history?: string[];
  mode?: "CHAT" | "COMMAND" | "INSERT";
}

export const InputBar: React.FC<InputBarProps> = ({
  onSubmit,
  isLoading = false,
  history = [],
  mode = "CHAT",
}) => {
  const [input, setInput] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [commandMode, setCommandMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const swallowState = useRef(false);

  const isCommandMode = mode === "COMMAND";
  const isInsertMode = mode === "INSERT";
  const isActive = !isLoading && !isCommandMode && !isInsertMode;

  useInput((rawInput, key) => {
    if (!isActive) return;

    let char = rawInput || "";

    if (swallowState.current) {
      const match = char.match(/[mM]/);
      if (match) {
        swallowState.current = false;
        char = char.slice(match.index! + 1);
      } else {
        return;
      }
    }

    while (char.includes("[<")) {
      const startIdx = char.indexOf("[<");
      const match = char.substring(startIdx).match(/[mM]/);
      if (match) {
        char = char.substring(0, startIdx) + char.substring(startIdx + match.index! + 1);
      } else {
        swallowState.current = true;
        char = char.substring(0, startIdx);
        break;
      }
    }

    if (key.return) {
      if (input.trim()) {
        onSubmit(input);
        setInput("");
        setCursorOffset(0);
        setCommandMode(false);
        setHistoryIndex(-1);
      }
    } else if (key.leftArrow) {
      if (key.ctrl) {
        // Jump word left
        const before = input.slice(0, cursorOffset);
        const match = before.match(/(\w+\W*|\W+)$/);
        if (match) {
          setCursorOffset((prev) => Math.max(0, prev - match[0].length));
        } else {
          setCursorOffset(0);
        }
      } else {
        setCursorOffset((prev) => Math.max(0, prev - 1));
      }
    } else if (key.rightArrow) {
      if (key.ctrl) {
        // Jump word right
        const after = input.slice(cursorOffset);
        const match = after.match(/^(\W*\w+|\W+)/);
        if (match) {
          setCursorOffset((prev) => Math.min(input.length, prev + match[0].length));
        } else {
          setCursorOffset(input.length);
        }
      } else {
        setCursorOffset((prev) => Math.min(input.length, prev + 1));
      }
    } else if (key.tab) {
      if (input.startsWith("/")) {
        const exactMatch = COMMANDS.find((c) => c.name.toLowerCase() === input.toLowerCase());
        if (!exactMatch) {
          const suggestion = COMMANDS.find((c) => c.name.toLowerCase().startsWith(input.toLowerCase()));
          if (suggestion) {
            const newVal = suggestion.name + " ";
            setInput(newVal);
            setCursorOffset(newVal.length);
          }
        }
      }
    } else if (key.upArrow) {
      if (history.length > 0) {
        const nextIndex = historyIndex + 1;
        if (nextIndex < history.length) {
          setHistoryIndex(nextIndex);
          const hItem = history[history.length - 1 - nextIndex];
          setInput(hItem);
          setCursorOffset(hItem.length);
          setCommandMode(hItem.startsWith("/"));
        }
      }
    } else if (key.downArrow) {
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        const hItem = history[history.length - 1 - nextIndex];
        setInput(hItem);
        setCursorOffset(hItem.length);
        setCommandMode(hItem.startsWith("/"));
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput("");
        setCursorOffset(0);
        setCommandMode(false);
      }
    } else if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        const nextInput = input.slice(0, cursorOffset - 1) + input.slice(cursorOffset);
        setInput(nextInput);
        setCursorOffset((prev) => prev - 1);
        if (nextInput === "") setCommandMode(false);
      }
      setHistoryIndex(-1);
    } else if (input === "w" && key.ctrl) {
      // Delete word backward
      if (cursorOffset > 0) {
        const before = input.slice(0, cursorOffset);
        const match = before.match(/(\w+\W*|\W+)$/);
        if (match) {
          const deleteLen = match[0].length;
          const nextInput = input.slice(0, cursorOffset - deleteLen) + input.slice(cursorOffset);
          setInput(nextInput);
          setCursorOffset(prev => Math.max(0, prev - deleteLen));
          if (nextInput === "") setCommandMode(false);
        }
      }
      setHistoryIndex(-1);
    } else if (input === "a" && key.ctrl) {
      // Home
      setCursorOffset(0);
    } else if (input === "e" && key.ctrl) {
      // End
      setCursorOffset(input.length);
    } else if (char) {
      // Allow pasting multiple characters correctly and normal typing
      // Filter out raw control characters
      const cleanChar = char.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      if (cleanChar.length > 0) {
        const nextInput = input.slice(0, cursorOffset) + cleanChar + input.slice(cursorOffset);
        setInput(nextInput);
        setCursorOffset((prev) => prev + cleanChar.length);
        if (nextInput === "/") setCommandMode(true);
      }
      setHistoryIndex(-1);
    }
  }, { isActive });

  const borderColor = isLoading
    ? Theme.colors.status.loading
    : isCommandMode
      ? Theme.colors.primary
      : isInsertMode
        ? Theme.colors.secondary
        : commandMode
          ? Theme.colors.primary
          : Theme.colors.secondary;

  const renderInputWithCursor = () => {
    if (input.length === 0) {
      return (
        <Text color={Theme.colors.text.muted}>
          <Text backgroundColor={Theme.colors.primary} color={Theme.colors.text.inverse}> </Text>
          <Text dimColor> Type a message or /command...</Text>
        </Text>
      );
    }

    const beforeCursor = input.slice(0, cursorOffset);
    const cursorChar = cursorOffset < input.length ? input[cursorOffset] : " ";
    const afterCursor = cursorOffset < input.length ? input.slice(cursorOffset + 1) : "";

    return (
      <Text>
        {beforeCursor}
        <Text backgroundColor={Theme.colors.primary} color={Theme.colors.text.inverse}>
          {cursorChar}
        </Text>
        {afterCursor}
      </Text>
    );
  };

  return (
    <Box flexDirection="column" width="100%" borderStyle="double" borderColor={borderColor} paddingX={1}>
      {commandMode && !isCommandMode && (
        <Box
          borderStyle="single"
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderColor="gray"
          marginBottom={0}
          paddingTop={0}
        >
          <CommandMenu input={input} />
        </Box>
      )}

      <Box justifyContent="space-between">
        <Box>
          <Text color={borderColor} bold>
            {isLoading ? "◌ " : isCommandMode ? "⧉ " : "❯ "}
          </Text>
          {isActive ? (
            renderInputWithCursor()
          ) : (
            <Text
              color={
                isCommandMode
                  ? Theme.colors.primary
                  : isInsertMode
                    ? Theme.colors.secondary
                    : Theme.colors.text.primary
              }
              dimColor={true}
            >
              {isCommandMode
                ? "COMMAND MODE: ESC to Focus View | 1-6 Navigate"
                : isInsertMode
                  ? "INSERT MODE: Focus is on Active View | ESC for Chat"
                  : ""}
            </Text>
          )}
        </Box>
        {isCommandMode && (
          <Text color={Theme.colors.primary} bold>
            [ NORMAL ]
          </Text>
        )}
        {isInsertMode && (
          <Text color={Theme.colors.secondary} bold>
            [ INSERT ]
          </Text>
        )}
      </Box>
    </Box>
  );
};
