import { Box, Text, useInput, useStdout } from "ink";
import { useMemo, useState, useEffect } from "react";
import { Scrollbar } from "./Scrollbar";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { Theme } from "../core/theme";
import { useMouseScroll } from "../core/hooks/useMouseScroll";

export interface Message {
  id: string;
  role: "user" | "assistant" | "model" | "system";
  type?: "text" | "tool_call" | "tool_result" | "system";
  content: string;
  timestamp: Date;
}

interface ChatWindowProps {
  messages: Message[];
  isStreaming?: boolean;
}

function safeTime(ts: unknown): string {
  try {
    if (!ts) return "";
    if (!(ts instanceof Date) && typeof ts !== "string" && typeof ts !== "number") {
      return "";
    }
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ─── Tool Call (inline) ──────────────────────────────────────────────────────
const ToolCallRow: React.FC<{ msg: Message }> = ({ msg }) => {
  let toolName = msg.content;
  try {
    const parsed = JSON.parse(msg.content);
    toolName = parsed.name || msg.content;
  } catch { /* raw */ }

  return (
    <Box marginLeft={3} flexShrink={0}>
      <Text color={Theme.colors.primary}>  ⚙  Calling </Text>
      <Text color={Theme.colors.text.primary} bold>{toolName}</Text>
      <Text color={Theme.colors.primary}>...</Text>
    </Box>
  );
};

// ─── Tool Result (indented, no border to avoid overflow) ─────────────────────
const ToolResultRow: React.FC<{ msg: Message }> = ({ msg }) => {
  const MAX_TOOL_LINES = 10;
  const lines = (msg.content || "").split("\n");
  const isTruncated = lines.length > MAX_TOOL_LINES;
  const displayContent = isTruncated
    ? lines.slice(0, MAX_TOOL_LINES).join("\n") + "\n\n(Output truncated. Use /toollog to view full result)"
    : msg.content;

  return (
    <Box marginLeft={5} flexDirection="row" flexShrink={0}>
      <Text color="gray">│ </Text>
      <Box flexDirection="column" flexShrink={1}>
        <Text color={Theme.colors.text.primary} wrap="wrap">{displayContent || ""}</Text>
      </Box>
    </Box>
  );
};

// ─── User Message (left border) ──────────────────────────────────────────────
const UserMessage: React.FC<{ msg: Message }> = ({ msg }) => (
  <Box flexDirection="column" marginLeft={4} flexShrink={0}>
    <Box gap={2} alignItems="center">
      <Text color={Theme.colors.primary} bold>  YOU</Text>
      <Text color={Theme.colors.text.muted} dimColor>{safeTime(msg.timestamp)}</Text>
      <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} marginLeft={1} />
    </Box>
    <Box
      borderStyle="single"
      borderLeft={true}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={Theme.colors.primary}
      paddingLeft={1}
      marginLeft={2}
    >
      <Text color={Theme.colors.text.primary} wrap="wrap">{msg.content || ""}</Text>
    </Box>
  </Box>
);

// ─── Venus Message (left border) ─────────────────────────────────────────────
const VenusMessage: React.FC<{ msg: Message; isLast: boolean; isStreaming: boolean }> = ({
  msg, isLast, isStreaming,
}) => (
  <Box flexDirection="column" flexShrink={0}>
    <Box gap={2} alignItems="center">
      <Text color={Theme.colors.primary} bold>  VENUS</Text>
      <Text color={Theme.colors.text.muted} dimColor>{safeTime(msg.timestamp)}</Text>
      <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} marginLeft={1} />
    </Box>
    <Box
      borderStyle="single"
      borderLeft={true}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={Theme.colors.primary}
      paddingLeft={1}
      marginLeft={2}
    >
      <Box flexDirection="column" flexShrink={1}>
        <StreamingMarkdown
          content={msg.content || ""}
          isStreaming={isStreaming && isLast}
        />
      </Box>
    </Box>
  </Box>
);

// ─── Message Router ──────────────────────────────────────────────────────────
const MessageRow: React.FC<{ msg: Message; isLast: boolean; isStreaming: boolean }> = ({
  msg, isLast, isStreaming,
}) => {
  if (msg.type === "tool_call") return <ToolCallRow msg={msg} />;
  if (msg.type === "tool_result") return <ToolResultRow msg={msg} />;
  if (msg.type === "system") return (
    <Box justifyContent="center" flexShrink={0} width="100%">
      <Text color={Theme.colors.text.muted} italic dimColor wrap="wrap">── {msg.content || ""} ──</Text>
    </Box>
  );

  if (msg.role === "user") return <UserMessage msg={msg} />;
  return <VenusMessage msg={msg} isLast={isLast} isStreaming={isStreaming} />;
};

// ─── Chat Window with line-based scrolling ──────────────────────────────────
export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  isStreaming = false,
}) => {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 40;
  const termWidth = stdout?.columns ?? 120;

  // We reserve lines for:
  // - Top indicator (1)
  // - Bottom indicator (1)
  // - Chat box border/padding in index.tsx (approx 4)
  // Available lines sync with index.tsx (termHeight - 7)
  // Minus 3 for parent borders and CHAT header
  const availableLines = Math.max(5, termHeight - 10);
  const chatWidth = Math.floor(termWidth * 0.7) - 4; // Center panel width minus borders and padding

  // Bottom spacer height (25% of availableLines)
  const bottomSpacerHeight = Math.floor(availableLines / 4);

  // Improved line estimation: returns { totalLines: number, lineMap: number[] }
  // lineMap[i] = how many lines message i occupies
  const messageLineStats = useMemo(() => {
    let totalAllLines = 0;
    const lineMap = messages.map(msg => {
      let content = msg.content || "";
      const isToolMsg = msg.type === "tool_call" || msg.type === "tool_result";

      // Tool calls only show one line (the name)
      if (msg.type === "tool_call") {
        try {
          const parsed = JSON.parse(content);
          content = parsed.name || content;
        } catch { }
      }

      // Tool results are capped at 10 lines
      if (msg.type === "tool_result") {
        const lines = content.split("\n");
        if (lines.length > 10) content = lines.slice(0, 10).join("\n") + "\n\n(Truncated)";
      }

      const lines = content.split("\n");
      let msgTotalLines = 0;
      for (const line of lines) {
        msgTotalLines += Math.max(1, Math.ceil((line.length + 5) / chatWidth));
      }

      // Add overhead for roles, timestamps, tool headers
      let overhead = 0;
      if (msg.type === "tool_call") overhead = 1;
      else if (msg.type === "tool_result") overhead = 0;
      else if (msg.type === "system") overhead = 1;
      else overhead = 2; // +2 for role/time header

      // Match User's marginBottom={isToolMsg ? 2 : 4}
      const margin = isToolMsg ? 2 : 4;

      const finalLines = msgTotalLines + overhead + margin;
      totalAllLines += finalLines;
      return finalLines;
    });

    // Add bottom spacer to total height
    return { totalLines: totalAllLines + bottomSpacerHeight, lineMap };
  }, [messages, chatWidth, bottomSpacerHeight]);

  // Scroll state: how many LINES from the TOP are we offset
  // We want to default to showing the BOTTOM
  const initialOffset = Math.max(0, messageLineStats.totalLines - availableLines);
  const [scrollLineOffset, setScrollLineOffset] = useState(initialOffset);
  const [lastMessageCount, setLastMessageCount] = useState(messages.length);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > lastMessageCount) {
      // Set offset to show the last availableLines
      const newOffset = Math.max(0, messageLineStats.totalLines - availableLines);
      setScrollLineOffset(newOffset);
      setLastMessageCount(messages.length);
    }
  }, [messages.length, lastMessageCount, messageLineStats.totalLines, availableLines]);


  // Calculate which messages are visible based on scrollLineOffset
  const { visibleMessages, showBottomSpacer, firstMessageOffset } = useMemo(() => {
    let currentLine = 0;
    let startIdx = -1;
    let endIdx = messages.length;
    let firstMessageOffset = 0;

    for (let i = 0; i < messages.length; i++) {
      const msgHeight = messageLineStats.lineMap[i];

      // If this message ends after our current line offset starts
      if (startIdx === -1 && currentLine + msgHeight > scrollLineOffset) {
        startIdx = i;
        // How many lines into this message have we scrolled?
        firstMessageOffset = Math.max(0, Math.floor(scrollLineOffset - currentLine));
      }

      currentLine += msgHeight;

      // If we've reached the end of the available view
      if (currentLine > scrollLineOffset + availableLines) {
        endIdx = i + 1;
        break;
      }
    }

    // Check if bottom spacer should be visible
    const totalMsgHeight = messageLineStats.totalLines - bottomSpacerHeight;
    const showBottomSpacer = (scrollLineOffset + availableLines) > totalMsgHeight;

    if (startIdx === -1) return { visibleMessages: [], showBottomSpacer, firstMessageOffset: 0 };
    return { visibleMessages: messages.slice(startIdx, endIdx), showBottomSpacer, firstMessageOffset };
  }, [messages, messageLineStats, scrollLineOffset, availableLines, bottomSpacerHeight]);

  // Input Handling
  useInput((input, key) => {
    const scrollStep = 2; // Shorter scroll length as requested

    if (key.pageUp || (key.shift && key.upArrow)) {
      setScrollLineOffset(prev => Math.max(0, prev - scrollStep));
    } else if (key.pageDown || (key.shift && key.downArrow)) {
      setScrollLineOffset(prev => Math.min(Math.max(0, messageLineStats.totalLines - availableLines), prev + scrollStep));
    }

    if (key.ctrl && key.upArrow) {
      setScrollLineOffset(0);
    } else if (key.ctrl && key.downArrow) {
      setScrollLineOffset(Math.max(0, messageLineStats.totalLines - availableLines));
    }
  });

  useMouseScroll({
    isActive: true, // Activity managed by ViewSwitcher hiding/showing ChatWindow
    onScrollUp: () => setScrollLineOffset((prev) => Math.max(0, prev - 2)),
    onScrollDown: () => setScrollLineOffset((prev) => Math.min(Math.max(0, messageLineStats.totalLines - availableLines), prev + 2))
  });

  return (
    <Box flexDirection="row" width="100%" height={availableLines} paddingX={1}>
      <Box flexDirection="column" flexGrow={1} overflow="hidden" >
        {visibleMessages.map((msg, idx) => {
          const isToolMsg = msg.type === "tool_call" || msg.type === "tool_result";
          const isFirst = idx === 0;
          return (
            <Box
              key={msg.id}
              marginBottom={isToolMsg ? 2 : 4}
              marginTop={isFirst ? -firstMessageOffset : 0}
              flexShrink={0}
              flexDirection="column"
            >
              <MessageRow
                msg={msg}
                isLast={msg.id === messages[messages.length - 1]?.id}
                isStreaming={isStreaming}
              />
            </Box>
          );
        })}
        {showBottomSpacer && <Box height={bottomSpacerHeight} flexShrink={0} />}
      </Box>

      {messageLineStats.totalLines > availableLines && (
        <Box width={1} marginLeft={1} flexShrink={0}>
          <Scrollbar
            show={availableLines}
            current={Math.floor(scrollLineOffset)}
            total={messageLineStats.totalLines}
          />
        </Box>
      )}
    </Box>
  );
};
