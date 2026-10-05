import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors } from '../../../theme/tokens';

/**
 * Progress bar whose fill springs to its value instead of jumping, the same motion as the
 * Radix/Motion `ProgressIndicator` (spring, stiffness 100, damping 30) the web design uses.
 * Runs on the UI thread, so it stays smooth while the next step renders.
 */
export const SpringProgress: React.FC<{
    /** 0..100 */
    value: number;
    height?: number;
    trackColor?: string;
    fillColor?: string;
}> = ({ value, height = 4, trackColor = colors.borderStrong, fillColor = colors.blue }) => {
    const progress = useSharedValue(Math.max(0, Math.min(100, value)));

    useEffect(() => {
        progress.value = withSpring(Math.max(0, Math.min(100, value)), { stiffness: 100, damping: 30, mass: 1 });
    }, [value, progress]);

    const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));

    return (
        <View
            style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height / 2 }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
        >
            <Animated.View style={[{ height, backgroundColor: fillColor, borderRadius: height / 2 }, fillStyle]} />
        </View>
    );
};

const styles = StyleSheet.create({
    track: { overflow: 'hidden', width: '100%' },
});
