import { Box, Text } from "ink";
import { Theme } from "../core/theme";

interface ContextHeaderProps {
  activeMemory?: string;
  sessionId?: string;
  mcpStatus?: string;
}

export const ContextHeader: React.FC<ContextHeaderProps> = ({
  activeMemory,
  sessionId,
  mcpStatus = "ready",
}) => {
  return (
    <Box
      flexDirection="row"
      width="100%"
      borderStyle="single"
      borderBottom={true}
      paddingX={1}
      paddingY={0}
      justifyContent="space-between"
    >
      <Box>
        <Text color={Theme.colors.primary} bold>
          Venus
        </Text>
        {activeMemory && (
          <>
            <Text color={Theme.colors.text.muted}> • </Text>
            <Text color={Theme.colors.status.success}>{activeMemory}</Text>
          </>
        )}
      </Box>
      <Box>
        <Text
          color={mcpStatus === "ready" ? Theme.colors.status.success : Theme.colors.status.loading}
        >
          {mcpStatus}
        </Text>
      </Box>
    </Box>
  );
};
