import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
    useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withDelay, Easing, interpolate, useReducedMotion,
} from 'react-native-reanimated';

/**
 * The tick for a selected option, with Animate UI's checkbox motion (its default "draw" check):
 *   checking     the box's fill grows from 70% of its size while fading in (300 ms), and after a 0.2 s delay the tick
 *                draws itself, stroke and opacity together, over 0.3 s (ease-out).
 *   unchecking   the tick erases over 0.3 s with no delay, while the fill shrinks and fades back out.
 * A box that is already checked when it appears shows its tick at rest; only changes animate. A change mid-animation
 * turns back from where it is. Under reduced motion the tick and fill only fade (nothing scales, the stroke stays whole).
 * The fill sits over the border (inset -1) so no outline rings the growing fill.
 */
const AnimatedPath = Animated.createAnimatedComponent(Path);
const TICK_LEN = 21; // length of the tick path below
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

export function AnimatedCheck({ checked, size = 22, fill = '#000000', border = '#C4C8D2', tick = '#FFFFFF' }: {
    checked: boolean; size?: number; fill?: string; border?: string; tick?: string;
}) {
    const reduced = useReducedMotion();
    const grow = useSharedValue(checked ? 1 : 0);    // the fill's scale, 0.7 → 1
    const fillOpacity = useSharedValue(checked ? 1 : 0);
    const draw = useSharedValue(checked ? 1 : 0);    // the tick: stroke and opacity
    const first = useRef(true);

    useEffect(() => {
        if (first.current) { first.current = false; return; }
        if (checked) {
            grow.value = withTiming(1, { duration: 300 });
            // the fill's opacity arrives first so the growth is visible, even on a dark fill
            fillOpacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) });
            draw.value = withDelay(200, withTiming(1, { duration: 300, easing: EASE_OUT }));
        } else {
            draw.value = withTiming(0, { duration: 300, easing: EASE_OUT });
            grow.value = withTiming(0, { duration: 300 });
            fillOpacity.value = withTiming(0, { duration: 300 });
        }
    }, [checked, grow, fillOpacity, draw]);

    const fillStyle = useAnimatedStyle(() => ({
        opacity: fillOpacity.value,
        transform: [{ scale: reduced ? 1 : interpolate(grow.value, [0, 1], [0.7, 1]) }],
    }));
    const tickWrap = useAnimatedStyle(() => ({ opacity: draw.value }));
    const tickProps = useAnimatedProps(() => ({ strokeDashoffset: reduced ? 0 : TICK_LEN * (1 - draw.value) }));

    const inner = Math.round(size * 0.62);
    return (
        <View style={[styles.box, { width: size, height: size, borderRadius: size / 2, borderColor: border }]}>
            <Animated.View pointerEvents="none" style={[styles.fill, { top: -1, left: -1, width: size, height: size, borderRadius: size / 2, backgroundColor: fill }, fillStyle]} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, tickWrap]}>
                <Svg width={inner} height={inner} viewBox="0 0 24 24">
                    <AnimatedPath
                        d="M5 12.5 L10 17.5 L19 7.5"
                        stroke={tick} strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round"
                        strokeDasharray={`${TICK_LEN} ${TICK_LEN}`}
                        animatedProps={tickProps}
                    />
                </Svg>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    box: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    fill: { position: 'absolute' },
    center: { alignItems: 'center', justifyContent: 'center' },
});
