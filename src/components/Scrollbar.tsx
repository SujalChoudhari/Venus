import { Box, Text } from 'ink';
import { Theme } from '../core/theme';

interface ScrollbarProps {
    show: number;    // Number of visible lines
    current: number; // Current scroll offset (top line)
    total: number;   // Total number of lines
}

export const Scrollbar: React.FC<ScrollbarProps> = ({ show, current, total }) => {
    if (total <= show) {
        return null; // Don't show if everything fits
    }

    const scrollbarHeight = show;
    // Thumb height proportional to visible area
    const thumbHeight = Math.max(1, Math.round((show / total) * scrollbarHeight));
    // Thumb position proportional to scroll offset
    // Ensure it doesn't go out of bounds
    const maxOffset = total - show;
    let thumbPos = Math.round((current / maxOffset) * (scrollbarHeight - thumbHeight));

    // Safety check for thumbPos
    if (isNaN(thumbPos)) thumbPos = 0;
    thumbPos = Math.min(thumbPos, scrollbarHeight - thumbHeight);

    return (
        <Box flexDirection="column" height={scrollbarHeight} width={1}>
            {Array.from({ length: scrollbarHeight }).map((_, i) => {
                const isThumb = i >= thumbPos && i < thumbPos + thumbHeight;
                return (
                    <Box key={i} height={1}>
                        <Text color={isThumb ? Theme.colors.primary : Theme.colors.secondary} dimColor={!isThumb}>
                            {isThumb ? "┃" : "│"}
                        </Text>
                    </Box>
                );
            })}
        </Box>
    );
};
