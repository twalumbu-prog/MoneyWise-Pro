import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const BAR = 4;
const MAX_H = 18;
// Each bar reacts a little differently so the three read as a wave, not one block.
const WEIGHT = [0.65, 1, 0.8];

/**
 * The "listening" indicator: three small dots that gently breathe in silence and stretch into bars, like a wave, as the person speaks.
 * `level` is the live loudness from 0 to 1 (see useDictation).
 */
export const VoiceWave: React.FC<{ level: number; color?: string }> = ({ level, color = '#FFFFFF' }) => {
    const scales = useRef(WEIGHT.map(() => new Animated.Value(BAR / MAX_H))).current;
    const breathe = useRef(new Animated.Value(0)).current;

    // Idle breathing, staggered across the three dots.
    useEffect(() => {
        const loop = Animated.loop(Animated.timing(breathe, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
        loop.start();
        return () => loop.stop();
    }, [breathe]);

    useEffect(() => {
        const speaking = level > 0.04;
        Animated.parallel(scales.map((v, i) => Animated.spring(v, {
            toValue: speaking ? Math.min(1, BAR / MAX_H + level * WEIGHT[i] * (0.75 + Math.random() * 0.5)) : BAR / MAX_H,
            speed: 28, bounciness: 6, useNativeDriver: true,
        }))).start();
    }, [level, scales]);

    return (
        <View style={styles.row} accessibilityLabel="Listening">
            {scales.map((v, i) => {
                const opacity = breathe.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: i === 1 ? [1, 0.55, 1] : i === 0 ? [0.55, 1, 0.55] : [0.8, 0.6, 0.8],
                });
                return <Animated.View key={i} style={[styles.bar, { backgroundColor: color, opacity, transform: [{ scaleY: v }] }]} />;
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 3, height: MAX_H },
    bar: { width: BAR, height: MAX_H, borderRadius: BAR / 2 },
});
