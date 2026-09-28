import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, Animated } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { highlightsService } from 'core';
import type { HighlightCard, Achievement } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';
import { ConfettiOverlay } from '../onboarding/ConfettiOverlay';

const { width: WINDOW_WIDTH } = Dimensions.get('window');
// Card container has horizontal margin 16 on each side (total 32)
// Card container has horizontal padding 16 on each side (total 32)
// Total inner width for each slide = WINDOW_WIDTH - 64
const SLIDE_WIDTH = WINDOW_WIDTH - 64;

export const FinancialHighlights: React.FC<{ style?: any }> = ({ style }) => {
    const [cards, setCards] = useState<HighlightCard[]>([]);
    const [_achievements, setAchievements] = useState<Achievement[]>([]);
    const [showConfetti, setShowConfetti] = useState(false);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState(0);

    const scrollRef = useRef<ScrollView>(null);
    const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Live Feed Pulsing Dot Animation
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseOpacity = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.parallel([
                Animated.timing(pulseAnim, {
                    toValue: 2.2,
                    duration: 1800,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseOpacity, {
                    toValue: 0,
                    duration: 1800,
                    useNativeDriver: true,
                }),
            ]),
        );
        animation.start();
        return () => animation.stop();
    }, [pulseAnim, pulseOpacity]);

    useEffect(() => {
        let cancelled = false;
        highlightsService.getHighlights()
            .then((payload) => {
                if (cancelled) return;
                setCards(payload.cards);
                setAchievements(payload.achievements);

                if (payload.achievements.length > 0) {
                    setShowConfetti(true);
                    highlightsService.acknowledgeAchievements(payload.achievements.map((a) => a.id)).catch(() => {});
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (cards.length <= 1) return;
        autoTimer.current = setInterval(() => {
            setActive((prev) => {
                const next = (prev + 1) % cards.length;
                scrollRef.current?.scrollTo({ x: next * SLIDE_WIDTH, animated: true });
                return next;
            });
        }, 8000);

        return () => { if (autoTimer.current) clearInterval(autoTimer.current); };
    }, [cards.length]);

    if (loading) {
        return (
            <View style={[styles.card, styles.center, style]}>
                <ActivityIndicator color={colors.blue} size="small" />
            </View>
        );
    }

    if (cards.length === 0) return null;

    return (
        <View style={[styles.card, style]}>
            {showConfetti && <ConfettiOverlay />}
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.pulseContainer}>
                        <Animated.View
                            style={[
                                styles.pulseRing,
                                {
                                    transform: [{ scale: pulseAnim }],
                                    opacity: pulseOpacity,
                                },
                            ]}
                        />
                        <View style={styles.pulseDot} />
                    </View>
                    <Text style={styles.headerTitle}>FINANCIAL HIGHLIGHTS</Text>
                </View>
                {cards.length > 1 && (
                    <View style={styles.dots}>
                        {cards.map((_, i) => (
                            <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
                        ))}
                    </View>
                )}
            </View>

            <ScrollView
                ref={scrollRef}
                horizontal
                snapToInterval={SLIDE_WIDTH}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
                    setActive(idx);
                }}
            >
                {cards.map((item) => {
                    const isAchievement = item.id.startsWith('achievement-');
                    return (
                        <View key={item.id} style={styles.slide}>
                            <View style={styles.contentRow}>
                                {isAchievement && (
                                    <View style={styles.trophyIcon}>
                                        <Trophy size={18} color="#B45309" />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                                    <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
                                </View>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
        borderWidth: 1, borderColor: colors.border, minHeight: 96,
        shadowColor: '#000000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
        elevation: 1, overflow: 'hidden',
    },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.8 },
    pulseContainer: {
        width: 10,
        height: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pulseDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.blue,
    },
    pulseRing: {
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.blue,
    },
    dots: { flexDirection: 'row', gap: 4 },
    dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.borderStrong },
    dotActive: { backgroundColor: colors.blue, width: 12 },
    slide: { width: SLIDE_WIDTH },
    contentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    trophyIcon: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEF3C7',
        alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    cardBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
});
