import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet, LayoutAnimation, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { investmentService } from 'core';
import { useAuth } from '../../context/AuthContext';
import { HomeCard } from './HomeCard';
import { OverviewSlide } from './insights/OverviewSlide';
import { UpdatesSlide } from './insights/UpdatesSlide';
import { SavingsSlide } from './insights/SavingsSlide';
import { UpcomingSlide } from './insights/UpcomingSlide';
import { InvestmentsSlide, INVESTMENTS_KEY } from './insights/InvestmentsSlide';
import { colors } from '../../theme/tokens';

/** How long each slide stays before the card moves on by itself. */
const AUTO_ADVANCE_MS = 6500;

type Route = '/reporting' | '/inbox' | '/savings' | '/schedules' | '/apps/invest';

/**
 * The Home information card. One white card whose header (title + "See more") follows the slide on show:
 * Financial Overview → Updates → Savings → Coming up → Investments (only when the person has invested). It moves on by
 * itself every few seconds, like the highlights on Reporting, and stops for good the moment the person swipes — until they leave
 * Home and come back (or sign out and in again).
 */
export const HomeInsightsCard: React.FC = () => {
    const router = useRouter();
    const { organizationId } = useAuth();
    const scroll = useRef<ScrollView>(null);
    const activeRef = useRef(0);
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState(0);
    const [focused, setFocused] = useState(true);
    const [stopped, setStopped] = useState(false);
    // Each slide's own height: the card is as tall as the slide on show (not the tallest one), and eases between them.
    const [heights, setHeights] = useState<Record<string, number>>({});

    // Coming back to Home (from another tab or page) lets the card move by itself again; leaving it pauses it.
    useFocusEffect(useCallback(() => { setFocused(true); setStopped(false); return () => setFocused(false); }, []));

    const { data: portfolio } = useQuery({ queryKey: [...INVESTMENTS_KEY, organizationId], queryFn: () => investmentService.getPortfolio(), enabled: !!organizationId, retry: false, staleTime: 60_000 });
    const hasInvestments = (portfolio?.holdings.length ?? 0) > 0;

    const slides = useMemo(() => {
        const list: { key: string; title: string; route: Route; node: React.ReactNode }[] = [
            { key: 'overview', title: 'Financial Overview', route: '/reporting', node: <OverviewSlide /> },
            { key: 'updates', title: 'Updates', route: '/inbox', node: <UpdatesSlide /> },
            { key: 'savings', title: 'Savings', route: '/savings', node: <SavingsSlide /> },
            { key: 'upcoming', title: 'Coming up', route: '/schedules', node: <UpcomingSlide /> },
        ];
        if (hasInvestments && portfolio) list.push({ key: 'investments', title: 'Investments', route: '/apps/invest', node: <InvestmentsSlide holdings={portfolio.holdings} totals={portfolio.totals} /> });
        return list;
    }, [hasInvestments, portfolio]);

    const count = slides.length;
    const shown = slides[Math.min(active, count - 1)];

    const goTo = useCallback((i: number, animated = true) => {
        if (animated) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        activeRef.current = i;
        setActive(i);
        scroll.current?.scrollTo({ x: i * width, animated });
    }, [width]);

    useEffect(() => {
        if (!focused || stopped || width === 0 || count < 2) return;
        const timer = setInterval(() => goTo((activeRef.current + 1) % count), AUTO_ADVANCE_MS);
        return () => clearInterval(timer);
    }, [focused, stopped, width, count, goTo]);

    // If a slide disappears (e.g. the investments one), never point past the end.
    useEffect(() => { if (active > count - 1) goTo(count - 1, false); }, [active, count, goTo]);

    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (width === 0) return;
        const i = Math.min(count - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width)));
        if (i !== activeRef.current) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); activeRef.current = i; setActive(i); }
    };

    return (
        <HomeCard title={shown.title} actionLabel="See more" onAction={() => router.navigate(shown.route)}>
            <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
                {width > 0 && (
                    <ScrollView
                        ref={scroll}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        scrollEventThrottle={16}
                        onScroll={onScroll}
                        onScrollBeginDrag={() => setStopped(true)}
                        nestedScrollEnabled
                        style={heights[shown.key] ? { height: heights[shown.key] } : undefined}
                    >
                        {slides.map((s) => (
                            <View
                                key={s.key}
                                style={{ width, alignSelf: 'flex-start' }}
                                onLayout={(e: LayoutChangeEvent) => { const h = Math.ceil(e.nativeEvent.layout.height); setHeights((prev) => (prev[s.key] === h ? prev : { ...prev, [s.key]: h })); }}
                            >
                                {s.node}
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>

            <View style={styles.dots} accessibilityRole="tablist">
                {slides.map((s, i) => (
                    <Pressable key={s.key} hitSlop={8} onPress={() => { setStopped(true); goTo(i); }} accessibilityRole="tab" accessibilityLabel={s.title} accessibilityState={{ selected: i === active }}>
                        <View style={[styles.dot, i === active && styles.dotActive]} />
                    </Pressable>
                ))}
            </View>
        </HomeCard>
    );
};

const styles = StyleSheet.create({
    dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 16 },
    dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.borderStrong },
    dotActive: { backgroundColor: colors.blue, width: 14 },
});
