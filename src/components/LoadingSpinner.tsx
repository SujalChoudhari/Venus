import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { Theme } from "../core/theme";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface LoadingSpinnerProps {
    label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ label = "Loading..." }) => {
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setFrameIndex((prev) => (prev + 1) % frames.length);
        }, 80);

        return () => clearInterval(timer);
    }, []);

    return (
        <Text color={Theme.colors.primary}>
            {frames[frameIndex]} {label}
        </Text>
    );
};
