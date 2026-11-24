import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing, interpolateColor } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
// Length of the tick below (M5 12.5 L10 17.5 L19 7.5), rounded up so the dash fully hides it.
const TICK_LENGTH = 22;

/**
 * The Animate UI checkbox (animate-ui.com, primitives/base-ui/checkbox) for React Native: on check the box pops
 * (scale 1 → 1.1 → 1 on a spring), fills, and the tick draws itself in; on uncheck it all runs back. Display only;
 * the row around it handles the tap (and the haptic).
 */
export function AnimatedCheckbox({ checked, size = 22 }: { checked: boolean; size?: number }) {
    const on = useSharedValue(checked ? 1 : 0);
    const pop = useSharedValue(1);

    useEffect(() => {
        on.value = withTiming(checked ? 1 : 0, { duration: checked ? 260 : 160, easing: Easing.out(Easing.cubic) });
        if (checked) {
            pop.value = 0.9;
            pop.value = withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 });
        }
    }, [checked, on, pop]);

    const box = useAnimatedStyle(() => ({
        transform: [{ scale: pop.value }],
        backgroundColor: interpolateColor(on.value, [0, 1], ['#FFFFFF', colors.blue]),
        borderColor: interpolateColor(on.value, [0, 1], [colors.borderStrong, colors.blue]),
    }));
    const tick = useAnimatedProps(() => ({ strokeDashoffset: TICK_LENGTH * (1 - on.value) }));

    return (
        <Animated.View style={[styles.box, { width: size, height: size, borderRadius: size * 0.3 }, box]}>
            <Svg width={size * 0.78} height={size * 0.78} viewBox="0 0 24 24">
                <AnimatedPath
                    d="M5 12.5 L10 17.5 L19 7.5" stroke="#FFFFFF" strokeWidth={3} fill="none"
                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TICK_LENGTH} animatedProps={tick}
                />
            </Svg>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    box: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
