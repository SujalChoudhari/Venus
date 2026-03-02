import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Theme } from "../core/theme";

// Venus ASCII art - dense atmospheric look
const VENUS_ART = `
                        .                                          .                      ..                         
                             .                                      .  :                                             
       .                                                 .   ...     ..                                              
                                              ..    ............  ..                       .            . .          
              .                              ..:-+****++++=====---::..     .  ..      ..                             
                                         . .+%%%%%####*****++++++==----:.           ..      ..                       
                                ..      .-@@@@@%%%%%%%###*****++========--:.                         .. ..           
                                     ..+@@@@@@@@@@%%%%######***++++++++====-:.                                       
                                  ...-@@@@@@%%%@%%%%%#####*************+++++=-.                   .     .            
                                ..*@@@@@%%%%%%%###%%%#######*+++*******++++=-:. ..                                 
                  ..         ......@@@@@@%%%%%%%%##%%%##%###**+++*++******++++=--. ..                   ..           
                         :.  ....:@@@@@@@@@@%%%%##%%%%##*####******#*****++++====-.                       .          
                           .....:%@@@@@@@@@@@@%%%%@%%#########****+++****++=++=+==-.                                 
 ..                       ......+@@@@@@@@@@@@%%%####%%%######****++++***+==+=====+=:.                 .              
                         ......:@@@@@@@@@@@@%%%%@@%@@@%####**##*****+***+++=---==-==.    .                           
                         ......+@@@@@@@@@@@@@@@%%@@@@@@@%%%%%##******+**++++=====-==:                                
                 .       ......%@@@@@@@@@@@@@@@%%@@@@@@@@%%%%%#*++****++++++++===--=-                                
     ..   .              .....:@@@@@@@@@@@@@@@@@%%@@@@@@@%%%%%#*******++++++++==-===-                                
                         .....:@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%%##*##*++==++++=====---=           ....                 
                         ......#@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%%%##****++===+=+==---=-          .                     
          .               .....=@@@@@@@@@@@@@@@@@%@@@@@@@@@@@@%%%%#***++====+++-:--+:                 .              
                           .....@@@@@@%%@@@%%##%@@@@@@@@@@@@%%%%%%#***#*+=====+==-==.                                
                    ..       ...-@@@@@%%%%@@%##%%@@@@@@@@%@%####%%%%%%##**=-=+**+*=:.           .       ..           
                              ...*@@@@@%%@@@@@@@@%@@@@%%#%%%%%%%%%%#*#*#********+=:.      ..                         
                                ..#@@@@@@@@@@@@@@@@##%%%%%%%##########***###+=++-:.   .                              
                 .                .#@@%%%%%%@@@@@%%%#*#%####%*****####*+****+==-:.                                   
                                   .-@%%%#######%#######*#***#####*++++=======-...                                   
                             .       .*%##*******++**##*******++++=======----:.         .. ..                        
                                      .:+#**********++++***++=======+==----:..                                       
                                         .=***++++++++=========----------:.                                          
     ..                      ..            ..-=============-----------:..              ..                            
                  .                             ..:---------------:.                                                 
       .         .                             .       ........      ..   .   ...   ..                               
                                                        . ..             ..         .                                
  .                                                      ..                                                          
`;

// Phases of the cinematic intro
const PHASES = [
    { id: "void", duration: 60 },  // pure darkness
    { id: "planet", duration: 120 },  // venus fades in
    { id: "glow", duration: 90 },  // atmospheric glow builds
    { id: "title", duration: 140 },  // title appears
    { id: "subtitle", duration: 10 },  // subtitle fades in
    { id: "hold", duration: 120 },  // hold on full reveal
    { id: "done", duration: 0 },  // trigger complete
];

interface SplashScreenProps {
    onComplete: () => void;
    memoryCount: number;
    toolCount: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
    onComplete,
    memoryCount,
    toolCount,
}) => {
    const [phase, setPhase] = useState(0);

    useEffect(() => {
        if (phase >= PHASES.length - 1) {
            onComplete();
            return;
        }
        const timer = setTimeout(() => {
            setPhase((p) => p + 1);
        }, PHASES[phase].duration);
        return () => clearTimeout(timer);
    }, [phase, onComplete]);

    const currentPhase = PHASES[phase]?.id ?? "done";

    const showPlanet = ["planet", "glow", "title", "subtitle", "hold"].includes(currentPhase);
    const showGlow = ["glow", "title", "subtitle", "hold"].includes(currentPhase);
    const showTitle = ["title", "subtitle", "hold"].includes(currentPhase);
    const showSubtitle = ["subtitle", "hold"].includes(currentPhase);

    // Planet colour: dim amber → bright golden-white as glow kicks in
    const planetColor = showGlow ? Theme.colors.primary : Theme.colors.secondary;
    const glowChar = "·";

    if (currentPhase === "void" || currentPhase === "done") {
        return (
            <Box
                flexDirection="column"
                width="100%"
                height="100%"
                alignItems="center"
                justifyContent="center"
            />
        );
    }

    return (
        <Box
            flexDirection="column"
            width="100%"
            height="100%"
            alignItems="center"
            justifyContent="center"
        >
            {/* Venus planet */}
            {showPlanet && (
                <Box flexDirection="column" alignItems="center">
                    <Text color={planetColor} dimColor={!showGlow}>
                        {VENUS_ART}
                    </Text>
                </Box>
            )}

            {/* Atmospheric shimmer line */}
            {showGlow && (
                <Text color={Theme.colors.secondary} dimColor>
                    {"  " + glowChar.repeat(48) + "  "}
                </Text>
            )}

            {/* Title */}
            {showTitle && (
                <Box flexDirection="column" alignItems="center" marginTop={1}>
                    <Text color={Theme.colors.text.primary} bold>
                        {"        V  E  N  U  S        "}
                    </Text>
                    <Text color={Theme.colors.primary}>
                        {"  ━━━━━━━━━━━━━━━━━━━━━━━━━━  "}
                    </Text>
                </Box>
            )}

            {/* Subtitle */}
            {showSubtitle && (
                <Box flexDirection="column" alignItems="center" marginTop={1}>
                    <Text color={Theme.colors.text.primary} bold>
                        {"       ◈  YOUR SECOND BRAIN  ◈       "}
                    </Text>
                    <Box marginTop={1}>
                        <Text color={Theme.colors.text.muted} dimColor>
                            {`${memoryCount} memories  │  ${toolCount} tools  │  gemma-3-27b-it`}
                        </Text>
                    </Box>
                </Box>
            )}
        </Box>
    );
};