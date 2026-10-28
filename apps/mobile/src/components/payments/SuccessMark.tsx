import { Animated } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** The tick's path inside the 64×64 mark, and its length (for drawing it as a stroke). */
const TICK_PATH = 'M20 33 L29 42 L45 24';
const TICK_LENGTH = 37;

/** A green circular outline with a tick drawn as a stroke. Drive `draw` 0 → 1 to draw the tick (Animate UI's checkbox: stroke and opacity together). */
export const SuccessMark: React.FC<{ draw: Animated.Value; size?: number }> = ({ draw, size = 64 }) => (
    <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx={32} cy={32} r={29} stroke={colors.positive} strokeWidth={4} fill="none" />
        <AnimatedPath
            d={TICK_PATH}
            stroke={colors.positive}
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={TICK_LENGTH}
            strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [TICK_LENGTH, 0] })}
            opacity={draw}
        />
    </Svg>
);
