import { Box, Text } from "ink";
import { Theme } from "../core/theme";

interface StreamingMarkdownProps {
    content: string;
    isStreaming: boolean;
}

export const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({
    content,
    isStreaming,
}) => {
    // Strip any leaked <tool_call> blocks from display text
    const cleanContent = content
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
        .replace(/<tool_result[\s\S]*?<\/tool_result>/g, "")
        .trim();

    if (!cleanContent && !isStreaming) return null;

    const lines = cleanContent.split("\n");

    return (
        <Box flexDirection="column">
            {lines.map((line, i) => {
                // Skip empty lines but preserve spacing
                if (line.trim() === "") {
                    return <Box key={i} height={1} />;
                }

                // H1
                if (line.startsWith("# ")) {
                    return (
                        <Box key={i} marginTop={1}>
                            <Text bold color={Theme.colors.primary}>{line.substring(2).toUpperCase()}</Text>
                        </Box>
                    );
                }

                // H2
                if (line.startsWith("## ")) {
                    return (
                        <Box key={i} marginTop={1}>
                            <Text bold color={Theme.colors.primary}>{line.substring(3)}</Text>
                        </Box>
                    );
                }

                // H3
                if (line.startsWith("### ")) {
                    return (
                        <Box key={i} marginTop={0}>
                            <Text bold color={Theme.colors.primary}>{line.substring(4)}</Text>
                        </Box>
                    );
                }

                // Horizontal rule
                if (line.trim().match(/^-{3,}$/) || line.trim().match(/^\*{3,}$/)) {
                    return (
                        <Box key={i}>
                            <Text color={Theme.colors.secondary}>{"─".repeat(40)}</Text>
                        </Box>
                    );
                }

                // Bold text
                let renderedLine: React.ReactNode = line;
                if (line.includes("**")) {
                    const parts = line.split("**");
                    renderedLine = parts.map((part, j) =>
                        j % 2 === 1 ? (
                            <Text key={j} bold color={Theme.colors.text.primary}>{part}</Text>
                        ) : (
                            <Text key={j}>{part}</Text>
                        )
                    );
                }

                // List item
                if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
                    const indent = line.length - line.trimStart().length;
                    const bulletText = line.trim().substring(2);
                    let bulletContent: React.ReactNode = bulletText;
                    if (bulletText.includes("**")) {
                        const parts = bulletText.split("**");
                        bulletContent = parts.map((part, j) =>
                            j % 2 === 1 ? <Text key={j} bold color={Theme.colors.text.primary}>{part}</Text> : <Text key={j}>{part}</Text>
                        );
                    }
                    return (
                        <Box key={i} marginLeft={Math.floor(indent / 2) + 1}>
                            <Text color={Theme.colors.primary}>● </Text>
                            <Text wrap="wrap" color={Theme.colors.text.primary}>{bulletContent}</Text>
                        </Box>
                    );
                }

                // Numbered list
                const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
                if (numMatch) {
                    return (
                        <Box key={i} marginLeft={1}>
                            <Text color={Theme.colors.primary}>{numMatch[1]}. </Text>
                            <Text wrap="wrap" color={Theme.colors.text.primary}>{numMatch[2]}</Text>
                        </Box>
                    );
                }

                // Checkmark
                if (line.trim().startsWith("✓") || line.trim().startsWith("✅")) {
                    return (
                        <Box key={i}>
                            <Text color={Theme.colors.status.success}>{line}</Text>
                        </Box>
                    );
                }

                // Italic
                if (line.trim().startsWith("_") && line.trim().endsWith("_")) {
                    return (
                        <Box key={i}>
                            <Text dimColor italic>{line.trim().slice(1, -1)}</Text>
                        </Box>
                    );
                }

                // Code block markers
                if (line.trim().startsWith("```")) {
                    return (
                        <Box key={i}>
                            <Text color={Theme.colors.secondary}>{"─".repeat(30)}</Text>
                        </Box>
                    );
                }

                // Normal text with word wrap
                return (
                    <Box key={i}>
                        <Text wrap="wrap" color={Theme.colors.text.primary}>{renderedLine}</Text>
                    </Box>
                );
            })}
            {isStreaming && (
                <Box marginTop={0}>
                    <Text color={Theme.colors.primary}>▋</Text>
                </Box>
            )}
        </Box>
    );
};
