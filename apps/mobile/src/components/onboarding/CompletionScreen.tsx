import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Check, ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { PrimaryButton } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = ['#006AFF', '#03D47C', '#FF2970', '#FFC531', '#002E3B'];

const ConfettiOverlay: React.FC = () => {
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
                    outputRange: [-30, SCREEN_HEIGHT + 30],
                });
                const rotate = p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${360 + Math.random() * 360}deg`],
                });
                const opacity = p.anim.interpolate({
                    inputRange: [0, 0.8, 1],
                    outputRange: [1, 1, 0],
                });

                return (
                    <Animated.View
                        key={i}
                        style={{
                            position: 'absolute',
                            left: p.x,
                            width: p.size,
                            height: p.size * 1.4,
                            borderRadius: 2,
                            backgroundColor: p.color,
                            opacity,
                            transform: [{ translateY }, { rotate }],
                        }}
                    />
                );
            })}
        </View>
    );
};

export const CompletionScreen: React.FC = () => {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <ConfettiOverlay />

            <View style={styles.content}>
                <View style={styles.checkCircle}>
                    <Check size={48} color="#FFFFFF" />
                </View>

                <View style={styles.sparkleTag}>
                    <Text style={styles.tickEmoji}>✅</Text>
                    <Text style={styles.sparkleTagText}>Setup Complete</Text>
                </View>

                <Text style={styles.title}>Welcome to MoneyWise!</Text>
                <Text style={styles.subtitle}>
                    Your business is now ready to receive payments, build your store, and manage your finances.
                </Text>

                <PrimaryButton
                    onPress={() => router.replace('/(tabs)')}
                    style={styles.ctaBtn}
                >
                    <Text style={styles.ctaBtnText}>Go to Dashboard</Text>
                    <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </PrimaryButton>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    content: {
        alignItems: 'center',
        maxWidth: 380,
        width: '100%',
        zIndex: 2,
    },
    checkCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: colors.positive,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: colors.positive,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    sparkleTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.pill,
        marginBottom: 16,
        gap: 6,
    },
    tickEmoji: {
        fontSize: 13,
    },
    sparkleTagText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: colors.positiveInk,
    },
    title: {
        fontFamily: fonts.bodyBold,
        fontSize: 28,
        color: colors.navy,
        textAlign: 'center',
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    ctaBtn: {
        width: '100%',
        minHeight: 52,
    },
    ctaBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
});
