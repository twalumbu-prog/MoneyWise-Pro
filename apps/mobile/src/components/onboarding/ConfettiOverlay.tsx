import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COLORS = ['#006AFF', '#03D47C', '#FF2970', '#FFC531', '#002E3B'];

export const ConfettiOverlay: React.FC = () => {
    const pieces = useRef(
        Array.from({ length: 45 }, () => ({
            x: Math.random() * SCREEN_WIDTH,
            size: 6 + Math.random() * 6,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            anim: new Animated.Value(0),
            delay: Math.random() * 800,
            duration: 2500 + Math.random() * 2000,
        })),
    ).current;

    useEffect(() => {
        const animations = pieces.map((p) =>
            Animated.sequence([
                Animated.delay(p.delay),
                Animated.timing(p.anim, {
                    toValue: 1,
                    duration: p.duration,
                    useNativeDriver: true,
                }),
            ]),
        );
        Animated.parallel(animations).start();
    }, [pieces]);

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {pieces.map((p, i) => {
                const translateY = p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, SCREEN_HEIGHT + 40],
                });
                const rotate = p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${360 * (i % 2 === 0 ? 3 : -3)}deg`],
                });
                const opacity = p.anim.interpolate({
                    inputRange: [0, 0.8, 1],
                    outputRange: [1, 1, 0],
                });

                return (
                    <Animated.View
                        key={i}
                        style={[
                            styles.piece,
                            {
                                left: p.x,
                                width: p.size,
                                height: p.size * 1.6,
                                backgroundColor: p.color,
                                transform: [{ translateY }, { rotate }],
                                opacity,
                            },
                        ]}
                    />
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    piece: {
        position: 'absolute',
        borderRadius: 2,
    },
});
