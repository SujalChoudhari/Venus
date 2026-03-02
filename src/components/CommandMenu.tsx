import { Box, Text } from "ink";
import { Theme } from "../core/theme";

export const COMMANDS = [
    { name: "/dash", params: "", desc: "Dashboard view" },
    { name: "/chat", params: "", desc: "Chat view" },
    { name: "/mem", params: "", desc: "Memory browser" },
    { name: "/notes", params: "", desc: "Open Notepad" },
    { name: "/toollog", params: " [query]", desc: "Search tool logs" },
    { name: "/memorize", params: " [text]", desc: "Store long-term memory" },
    { name: "/help", params: "", desc: "Show help" },
];

interface CommandMenuProps {
    input: string;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({ input }) => {
    if (!input.startsWith("/")) return null;

    const searchTerm = input.toLowerCase();
    const suggestions = COMMANDS.filter((c) =>
        c.name.toLowerCase().startsWith(searchTerm)
    );

    if (suggestions.length === 0) return null;

    return (
        <Box
            flexDirection="row"
            paddingX={1}
            marginBottom={0}
            flexWrap="wrap"
        >
            {suggestions.slice(0, 6).map((s) => {
                const isExact = s.name.toLowerCase() === searchTerm;
                return (
                    <Box key={s.name} marginRight={2}>
                        <Text
                            color={isExact ? Theme.colors.text.inverse : Theme.colors.primary}
                            backgroundColor={isExact ? Theme.colors.background.highlight : undefined}
                            bold={isExact}
                        >
                            {` ${s.name} `}
                        </Text>
                        <Text color={Theme.colors.text.muted} dimColor={!isExact}> {s.desc}</Text>
                    </Box>
                );
            })}
            {suggestions.length > 6 && (
                <Text color={Theme.colors.text.muted} italic>
                    +{suggestions.length - 6} more
                </Text>
            )}
        </Box>
    );
};
