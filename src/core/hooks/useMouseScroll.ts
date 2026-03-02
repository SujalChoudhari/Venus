import { useEffect, useRef } from "react";
import { useStdin } from "ink";

export interface MouseScrollOptions {
    isActive?: boolean;
    onScrollUp?: () => void;
    onScrollDown?: () => void;
}

export function useMouseScroll({ isActive = true, onScrollUp, onScrollDown }: MouseScrollOptions) {
    const { stdin, isRawModeSupported, setRawMode } = useStdin();

    // We use a ref for callbacks to avoid re-binding the stream listener on every render
    const callbacksRef = useRef({ onScrollUp, onScrollDown });
    callbacksRef.current = { onScrollUp, onScrollDown };

    useEffect(() => {
        if (!isActive || !stdin || !isRawModeSupported) {
            return;
        }

        setRawMode(true);

        const handleData = (data: Buffer) => {
            const str = data.toString("utf8");

            // We are hunting specifically for SGR mouse sequences: \x1b[<id;x;yM or \x1b[<id;x;ym
            // Scroll Up is ID 64 (or 64+modifier). Scroll Down is ID 65 (or 65+modifier).
            // A typical scroll up without modifiers is \x1b[<64;...M

            let match;
            const regex = /\x1b\[<(\d+);\d+;\d+[Mm]/g;

            while ((match = regex.exec(str)) !== null) {
                const btnId = parseInt(match[1], 10);

                // 64, 64+4 (Shift), 64+8 (Alt), 64+16 (Ctrl) are all scroll UP variants
                // 65 is scroll DOWN variants

                // Base button ID without modifiers (bitwise AND with ~28 to remove shift/alt/ctrl flags)
                // Modifiers: Shift = 4, Meta/Alt = 8, Ctrl = 16. Sum = 28.
                const baseId = btnId & ~28;

                if (baseId === 64) {
                    callbacksRef.current.onScrollUp?.();
                } else if (baseId === 65) {
                    callbacksRef.current.onScrollDown?.();
                }
            }
        };

        stdin.on("data", handleData);

        return () => {
            stdin.off("data", handleData);
            // We don't disable raw mode because Ink needs it
        };
    }, [isActive, stdin, isRawModeSupported, setRawMode]);
}
