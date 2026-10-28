import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
    Easing, cancelAnimation, runOnJS, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useDerivedValue, useSharedValue, withTiming,
} from 'react-native-reanimated';
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
/**
 * The "push" page transition (Animate UI): the new slide pushes the old one out. It runs on Animate UI's ease-out curve, and always
 * pushes forward — from the last slide it carries on into a copy of the first rather than rewinding through all of them.
 */
const PUSH_MS = 520;
const PUSH_EASING = Easing.bezier(0.23, 1, 0.32, 1);

type Route = '/reporting' | '/inbox' | '/savings' | '/schedules' | '/apps/invest';

/**
 * The Home information card. One white card whose header (title + "See more") follows the slide on show:
 * Financial Overview → Updates → Savings → Coming up → Investments (only when the person has invested). The card keeps the
 * height of its tallest slide, so nothing below it jumps. It moves on by itself every few seconds, like the highlights on
 * Reporting, and stops for good the moment the person swipes — until they leave Home and come back (or sign out and in again).
 */
export const HomeInsightsCard: React.FC = () => {
    const router = useRouter();
    const { organizationId } = useAuth();
    const scroll = useAnimatedRef<Animated.ScrollView>();
    // Shared with the UI thread: the scroll offset, the animated target, and the slide width.
    const offset = useSharedValue(0);
    const driver = useSharedValue(0);
    const driving = useSharedValue(false);
    const widthSV = useSharedValue(0);
    const lastIndex = useSharedValue(0);
    const activeRef = useRef(0);
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState(0);
    const [focused, setFocused] = useState(true);
    const [stopped, setStopped] = useState(false);

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
    const looping = count > 1;
    /** What is actually laid out: the slides, then a copy of the first, so the last one can push forward into it. */
    const shown = slides[Math.min(active, count - 1)];

    // The animated scroll: while `driving`, the scroll position follows the eased value.
    useDerivedValue(() => { if (driving.value) scrollTo(scroll, driver.value, 0, false); });

    /** Back to the real first slide, silently, once the copy of it has been pushed into view. */
    const settleOnFirst = useCallback(() => {
        scroll.current?.scrollTo({ x: 0, y: 0, animated: false });
        offset.value = 0; lastIndex.value = 0;
        activeRef.current = 0; setActive(0);
    }, [scroll, offset, lastIndex]);

    const finishedPush = useCallback((i: number) => { if (i >= count) settleOnFirst(); }, [count, settleOnFirst]);

    /** Push to slide `i` (`count` means the copy of the first). Direction follows from where we are. */
    const goTo = useCallback((i: number, animated = true) => {
        const logical = i >= count ? 0 : i;
        activeRef.current = logical;
        setActive(logical);
        if (!animated || width === 0) { scroll.current?.scrollTo({ x: i * width, y: 0, animated: false }); offset.value = i * width; return; }
        cancelAnimation(driver);
        driver.value = offset.value;
        driving.value = true;
        driver.value = withTiming(i * width, { duration: PUSH_MS, easing: PUSH_EASING }, (done) => {
            driving.value = false;
            if (done) runOnJS(finishedPush)(i);
        });
    }, [width, count, scroll, offset, driver, driving, finishedPush]);

    useEffect(() => {
        if (!focused || stopped || width === 0 || count < 2) return;
        const timer = setInterval(() => goTo(activeRef.current + 1), AUTO_ADVANCE_MS);
        return () => clearInterval(timer);
    }, [focused, stopped, width, count, goTo]);

    // If a slide disappears (e.g. the investments one), never point past the end.
    useEffect(() => { if (active > count - 1) goTo(count - 1, false); }, [active, count, goTo]);

    const showIndex = useCallback((i: number) => { const logical = i >= count ? 0 : i; if (logical !== activeRef.current) { activeRef.current = logical; setActive(logical); } }, [count]);
    const stopForGood = useCallback(() => setStopped(true), []);

    const onScroll = useAnimatedScrollHandler({
        onScroll: (e) => {
            offset.value = e.contentOffset.x;
            if (widthSV.value === 0) return;
            const i = Math.max(0, Math.round(e.contentOffset.x / widthSV.value));
            if (i !== lastIndex.value) { lastIndex.value = i; runOnJS(showIndex)(i); }
        },
        // The person took over: stop any push in progress, and the card stops moving by itself.
        onBeginDrag: () => { cancelAnimation(driver); driving.value = false; runOnJS(stopForGood)(); },
        // A swipe that landed on the copy of the first slide: carry on from the real one.
        onMomentumEnd: (e) => {
            if (widthSV.value > 0 && Math.round(e.contentOffset.x / widthSV.value) >= count) runOnJS(settleOnFirst)();
        },
    }, [count, showIndex, settleOnFirst, stopForGood]);

    return (
        <HomeCard title={shown.title} actionLabel="See more" onAction={() => router.navigate(shown.route)}>
            <View onLayout={(e: LayoutChangeEvent) => { const w = Math.round(e.nativeEvent.layout.width); setWidth(w); widthSV.value = w; }}>
                {width > 0 && (
                    <Animated.ScrollView
                        ref={scroll}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        scrollEventThrottle={16}
                        onScroll={onScroll}
                        nestedScrollEnabled
                        bounces={false}
                    >
                        {/* Every slide stretches to the tallest one, so the card keeps one height whichever slide is showing. */}
                        {slides.map((s) => <View key={s.key} style={{ width }}>{s.node}</View>)}
                        {looping && <View key="loop" style={{ width }} pointerEvents="none">{slides[0].node}</View>}
                    </Animated.ScrollView>
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
