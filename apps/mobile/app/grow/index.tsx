import { useEffect, useRef, useState } from 'react';
import Animated, { useSharedValue, useAnimatedProps, withTiming, withDelay, Easing } from 'react-native-reanimated';
import {
    View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, useWindowDimensions, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { ChevronLeft, Settings, Target, CalendarCheck2, LineChart } from 'lucide-react-native';
import { monthLabelWithYear, monthsBetween, monthKeyOf } from 'core';
import type { GrowPlan } from 'core';
import { colors, fonts } from '../../src/theme/tokens';
import { useGoBack } from '../../src/hooks/useGoBack';
import { useGrowPlan, useGrowState } from '../../src/components/grow/useGrow';
import { GrowChart, DRAW_MS } from '../../src/components/grow/GrowChart';
import { GrowMonthCards } from '../../src/components/grow/GrowMonthCards';
import { Legend, formatK, GROW_COLORS } from '../../src/components/grow/growUi';

/**
 * Grow — see your net-worth journey: where you are, where your plan says you should be,
 * and month by month whether you hit your income, spending, saving and investing targets.
 */
export default function GrowScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const safeBack = useGoBack('/(tabs)/reporting');
    const { plan, isLoading: planLoading, remove } = useGrowPlan();

    const openSettings = () => {
        Alert.alert('Grow plan', undefined, [
            { text: 'Edit targets', onPress: () => router.push('/grow/setup?edit=1') },
            {
                text: 'Start over', style: 'destructive',
                onPress: () => Alert.alert('Start over?', 'This removes your Grow plan. Your transactions and reports are not affected.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove plan', style: 'destructive', onPress: () => { void remove(); } },
                ]),
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <Pressable onPress={() => safeBack()} hitSlop={12} accessibilityLabel="Go back" style={styles.headerSide}>
                    <ChevronLeft size={26} color="#000" />
                </Pressable>
                <Text style={styles.headerTitle}>Grow</Text>
                <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
                    {plan && (
                        <Pressable onPress={openSettings} hitSlop={12} accessibilityLabel="Grow plan settings">
                            <Settings size={22} color="#52525B" />
                        </Pressable>
                    )}
                </View>
            </View>

            {planLoading ? (
                <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>
            ) : plan ? (
                <GrowDashboard plan={plan} />
            ) : (
                <GrowEmpty onSetup={() => router.push('/grow/setup')} bottomInset={insets.bottom} />
            )}
        </View>
    );
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** "K28,700" built by hand — runs on the UI thread, where toLocaleString isn't available. */
function kText(v: number): string {
    'worklet';
    const n = Math.round(Math.abs(v)).toString();
    let out = '';
    for (let i = 0; i < n.length; i++) {
        if (i > 0 && (n.length - i) % 3 === 0) out += ',';
        out += n[i];
    }
    return `${v < 0 ? '-' : ''}K${out}`;
}

/** The figure counts up from K0 on the UI thread (no React re-renders), so it stays buttery. */
function CountUpAmount({ value, ready, style }: { value: number; ready: boolean; style: any }) {
    const v = useSharedValue(0);
    const played = useRef(false);
    useEffect(() => {
        if (!ready) return;
        if (!played.current) {
            played.current = true;
            v.value = withDelay(120, withTiming(value, { duration: DRAW_MS - 200, easing: Easing.out(Easing.cubic) }));
        } else {
            v.value = withTiming(value, { duration: 400 });
        }
    }, [ready, value, v]);
    const props = useAnimatedProps(() => ({ text: kText(v.value), defaultValue: kText(v.value) } as any));
    return <AnimatedTextInput editable={false} pointerEvents="none" underlineColorAndroid="transparent" animatedProps={props} style={style} defaultValue="K0" />;
}

function GrowDashboard({ plan }: { plan: GrowPlan }) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { state, isLoading, isError, isFetching, refetch } = useGrowState(plan);
    const [selected, setSelected] = useState<number | null>(null);
    const [chartH, setChartH] = useState(0);

    // Land on the current month the first time the numbers arrive.
    const sel = selected ?? state?.currentIndex ?? 0;
    useEffect(() => {
        if (state && selected === null) setSelected(state.currentIndex);
    }, [state, selected]);

    if (isLoading || !state) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={colors.blue} />
                <Text style={styles.loadingText}>Reading your books…</Text>
            </View>
        );
    }

    const monthsLeft = Math.max(0, monthsBetween(monthKeyOf(new Date()), plan.goalMonth));
    const reached = state.projection.goal - state.currentNetWorth <= 0;
    const goalText = reached
        ? `Goal ${formatK(state.projection.goal)} reached`
        : `${formatK(state.projection.goal)} by ${monthLabelWithYear(plan.goalMonth)} · ${monthsLeft === 0 ? 'final month' : `${monthsLeft} mo to go`}`;

    return (
        <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 12) }}>
            {isError && (
                <Pressable onPress={() => refetch()} style={styles.offline}>
                    <Text style={styles.offlineText}>Offline — showing your plan only. Tap to retry.</Text>
                </Pressable>
            )}

            {/* Chart fills whatever height is left; the month card is pinned below it */}
            <View style={{ flex: 1, minHeight: 230 }} onLayout={(e) => setChartH(Math.round(e.nativeEvent.layout.height))}>
                {chartH > 0 && (
                    <GrowChart
                        width={width}
                        height={chartH}
                        projection={state.projection}
                        results={state.results}
                        baseline={state.baseline}
                        selected={sel}
                        onSelect={(i: number) => setSelected(i)}
                        header={(
                            <View>
                                <Text style={styles.heroLabel}>Current Net Worth</Text>
                                <View style={styles.heroRow}>
                                    <CountUpAmount value={state.currentNetWorth} ready style={styles.heroValue} />
                                    {isFetching && <ActivityIndicator size="small" color={colors.textFaint} />}
                                </View>
                                <Text style={styles.goalLine} numberOfLines={1}>{goalText}</Text>
                            </View>
                        )}
                    />
                )}
            </View>

            <View style={{ marginVertical: 8 }}><Legend /></View>

            <View style={{ paddingHorizontal: 20 }}>
                <GrowMonthCards width={width - 40} results={state.results} selected={sel} onSelect={setSelected} />
            </View>
        </View>
    );
}

function GrowEmpty({ onSetup, bottomInset }: { onSetup: () => void; bottomInset: number }) {
    const steps = [
        { Icon: Target, title: 'Set four targets', body: 'Income, spending, saving and investing — daily, weekly or monthly.' },
        { Icon: LineChart, title: 'See your path', body: 'We plot where your net worth should be, month by month, up to your goal.' },
        { Icon: CalendarCheck2, title: 'Track every month', body: 'Your books fill in the actuals automatically. Ticks show what you hit.' },
    ];
    return (
        <ScrollView contentContainerStyle={[styles.empty, { paddingBottom: bottomInset + 32 }]}>
            <GrowIllustration />
            <Text style={styles.emptyTitle}>Grow your net worth</Text>
            <Text style={styles.emptyBody}>
                Turn your money goals into a clear path — and see at a glance whether you're on track.
            </Text>

            <Pressable onPress={onSetup} style={({ pressed }) => [styles.setupBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
                <Text style={styles.setupText}>Set up</Text>
            </Pressable>
            <Text style={styles.emptyHint}>Takes about a minute</Text>

            <View style={styles.steps}>
                {steps.map(({ Icon, title, body }) => (
                    <View key={title} style={styles.step}>
                        <View style={styles.stepIcon}><Icon size={18} color={colors.blue} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.stepTitle}>{title}</Text>
                            <Text style={styles.stepBody}>{body}</Text>
                        </View>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

function GrowIllustration() {
    return (
        <Svg width={220} height={120} viewBox="0 0 220 120">
            <Defs>
                <LinearGradient id="emptyFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={GROW_COLORS.success} stopOpacity={0.28} />
                    <Stop offset="100%" stopColor={GROW_COLORS.success} stopOpacity={0} />
                </LinearGradient>
            </Defs>
            <Path d="M10 100 C 60 98, 120 90, 200 20" stroke={GROW_COLORS.plan} strokeWidth={2} strokeDasharray="6,6" fill="none" />
            <Path d="M10 100 C 40 96, 60 84, 80 82 S 120 74, 130 66 L130 116 L10 116 Z" fill="url(#emptyFill)" />
            <Path d="M10 100 C 40 96, 60 84, 80 82 S 120 74, 130 66" stroke={GROW_COLORS.success} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Circle cx={130} cy={66} r={6} fill={GROW_COLORS.successBg} stroke={GROW_COLORS.success} strokeWidth={3} />
        </Svg>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    headerSide: { width: 44 },
    headerTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.advercaseRegular, fontSize: 26, color: '#000' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 13 },

    heroLabel: { fontFamily: fonts.body, fontSize: 14, color: '#000' },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroValue: { padding: 0, margin: 0, minWidth: 300, fontFamily: fonts.display, fontSize: 32, color: '#000', letterSpacing: -0.5, flexShrink: 1 },
    heroMeta: { gap: 8, marginTop: 6 },
    goalLine: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted, marginTop: 1 },
    goalStrong: { fontFamily: fonts.bodyBold, color: colors.text },

    offline: { marginHorizontal: 20, marginBottom: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFF7ED' },
    offlineText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: '#9A3412' },
    note: { marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: '#EFF6FF' },
    noteText: { fontFamily: fonts.body, fontSize: 12.5, color: '#1E3A8A', lineHeight: 18 },

    empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 40 },
    emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: '#000', marginTop: 18 },
    emptyBody: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
    setupBtn: {
        marginTop: 28, backgroundColor: colors.blue, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 56,
    },
    setupText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFF' },
    emptyHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 10 },
    steps: { alignSelf: 'stretch', marginTop: 36, gap: 18 },
    step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    stepIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    stepTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    stepBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
