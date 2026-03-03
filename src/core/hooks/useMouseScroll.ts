import { useEffect, useRef } from "react";
import { useStdin } from "ink";
import { useStdout } from "ink";

export interface MouseScrollOptions {
    isActive?: boolean;
    onScrollUp?: () => void;
    onScrollDown?: () => void;
}

export function useMouseScroll({ isActive = true, onScrollUp, onScrollDown }: MouseScrollOptions) {
    const { stdin, isRawModeSupported, setRawMode } = useStdin();
    const { stdout } = useStdout();

    // We use a ref for callbacks to avoid re-binding the stream listener on every render
    const callbacksRef = useRef({ onScrollUp, onScrollDown });
    callbacksRef.current = { onScrollUp, onScrollDown };

    useEffect(() => {
        if (!isActive || !stdin || !isRawModeSupported) {
            return;
        }

        setRawMode(true);
        // Enable mouse tracking (including wheel) + SGR extended mode.
        // 1000: basic mouse, 1002: button-drag, 1003: any-motion, 1006: SGR encoding.
        stdout?.write?.("\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h");

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
            // Disable mouse tracking modes when this hook deactivates.
            stdout?.write?.("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l");
            // We don't disable raw mode because Ink needs it
        };
    }, [isActive, stdin, isRawModeSupported, setRawMode, stdout]);
}
