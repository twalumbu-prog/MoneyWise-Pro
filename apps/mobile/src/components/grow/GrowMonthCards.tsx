import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { monthName, GROW_TARGET_KEYS } from 'core';
import type { GrowMonthResult, GrowTargetKey } from 'core';
import { colors, fonts } from '../../theme/tokens';
import { hapticTick } from '../../lib/haptics';
import { GROW_COLORS, MonthStatusPill, TargetStatusIcon, TARGET_META, formatK } from './growUi';

interface Props {
    /** Outer width of the white card. */
    width: number;
    results: GrowMonthResult[];
    selected: number;
    onSelect: (index: number) => void;
}

const PAD = 16;

/**
 * One white card for the selected month: its name (with the status dot), progress and the four
 * targets, with page dots underneath showing where you are. Swipe to move month by month; the chart's
 * own cards (or the dots) jump straight to any month.
 */
export function GrowMonthCards({ width, results, selected, onSelect }: Props) {
    const pagerRef = useRef<ScrollView>(null);
    const inner = width - PAD * 2;
    const count = results.length;
    const fromPager = useRef(false);
    const first = useRef(true);
    const parked = useRef(false);

    // Selection changed from elsewhere (chart card, dot): glide the pager there. Swipes already are there.
    useEffect(() => {
        if (fromPager.current) { fromPager.current = false; return; }
        pagerRef.current?.scrollTo({ x: selected * inner, animated: !first.current });
        if (!first.current) hapticTick();
        first.current = false;
    }, [selected, inner]);

    return (
        <View style={[styles.card, { width }]}>
            <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                disableIntervalMomentum
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                onContentSizeChange={() => { if (!parked.current) { parked.current = true; pagerRef.current?.scrollTo({ x: selected * inner, animated: false }); } }}
                onMomentumScrollEnd={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / inner);
                    if (i >= 0 && i < count && i !== selected) { fromPager.current = true; hapticTick(); onSelect(i); }
                }}
                style={{ width: inner }}
            >
                {results.map((r) => <MonthBody key={r.plan.key} result={r} width={inner} />)}
            </ScrollView>

            <View style={styles.dots}>
                {results.map((r, i) => (
                    <Pressable key={r.plan.key} onPress={() => onSelect(i)} hitSlop={6} accessibilityLabel={`Go to ${monthName(r.plan.key)}`}>
                        <View style={[styles.pageDot, i === selected && styles.pageDotActive]} />
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

function StatusDot({ status }: { status: GrowMonthResult['status'] }) {
    const off = status === 'OFF_TRACK', up = status === 'UPCOMING';
    return (
        <View style={[styles.dot, {
            backgroundColor: off ? GROW_COLORS.dangerBg : up ? GROW_COLORS.planBg : GROW_COLORS.successBg,
            borderColor: off ? GROW_COLORS.danger : up ? GROW_COLORS.planInk : GROW_COLORS.success,
        }]} />
    );
}

function MonthBody({ result: r, width }: { result: GrowMonthResult; width: number }) {
    const barColor = GROW_COLORS.blue;
    return (
        <View style={{ width, gap: 10 }}>
            <View style={{ gap: 4 }}>
                <View style={styles.cardHead}>
                    <StatusDot status={r.status} />
                    <Text style={styles.headline} numberOfLines={1}>{monthName(r.plan.key)}</Text>
                    <MonthStatusPill status={r.status} metCount={r.metCount} />
                </View>
                <View style={styles.barLabels}>
                    <Text style={styles.barLabel}>NET WORTH GROWN</Text>
                    <Text style={styles.barLabel}>
                        {r.actuals ? formatK(r.grown) : '—'} / {formatK(r.plan.targetGrowth)}
                    </Text>
                </View>
                <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.round(r.progress * 100)}%`, backgroundColor: barColor }]} />
                </View>
            </View>

            <View style={styles.targets}>
                {GROW_TARGET_KEYS.map((k) => <TargetRow key={k} k={k} result={r} />)}
            </View>
        </View>
    );
}

function TargetRow({ k, result: r }: { k: GrowTargetKey; result: GrowMonthResult }) {
    const meta = TARGET_META[k];
    const actual = r.actuals?.[k];
    const status = r.targetStatus[k];
    return (
        <View style={styles.row}>
            <Text style={styles.emoji}>{meta.emoji}</Text>
            <Text style={styles.rowLabel} numberOfLines={1}>{meta.short}</Text>
            <View style={[styles.amountPill, status === 'missed' && styles.amountPillMissed]}>
                <Text style={styles.amountText} numberOfLines={1}>
                    <Text style={styles.amountActual}>{actual == null ? '—' : formatK(actual)}</Text>
                    <Text style={styles.amountSep}> / </Text>
                    <Text style={styles.amountTarget}>{formatK(r.plan.targets[k])}</Text>
                </Text>
            </View>
            <View style={{ width: 20, alignItems: 'center' }}>
                <TargetStatusIcon status={status} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },

    card: {
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: PAD, gap: 12,
        borderWidth: 1, borderColor: '#E5E7EB',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    cardTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: '#000' },
    headline: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: '#000' },
    dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 2 },
    pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D4D4D8' },
    pageDotActive: { width: 18, backgroundColor: '#52525B' },
    barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    barLabel: { fontFamily: fonts.bodyMedium, fontSize: 9, letterSpacing: 0.6, color: '#52525B' },
    barTrack: { height: 4, borderRadius: 4, backgroundColor: '#E5E5E5', overflow: 'hidden' },
    barFill: { height: 4, borderRadius: 4 },

    targets: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42 },
    emoji: { fontSize: 22, width: 28, textAlign: 'center' },
    rowLabel: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    amountPill: { flexShrink: 0, width: 136, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
    amountPillMissed: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
    amountText: { textAlign: 'center' },
    amountActual: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    amountSep: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    amountTarget: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    footer: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
