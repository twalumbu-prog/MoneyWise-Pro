import { View, Text, StyleSheet } from 'react-native';
import { Check, Clock3, X, CalendarClock, TrendingUp, TrendingDown } from 'lucide-react-native';
import type { GrowMonthStatus, GrowTargetStatus, GrowTargetKey } from 'core';
import { colors, fonts } from '../../theme/tokens';

export const GROW_COLORS = {
    success: '#16A34A',
    successBg: '#F7FEE7',
    successSoft: '#DCFCE7',
    danger: '#F87171',
    dangerInk: '#DC2626',
    dangerBg: '#FFE4E6',
    plan: '#A1A1AA',
    planInk: '#71717A',
    planBg: '#E4E4E7',
    navy: '#082F49',
    grid: '#E5E7EB',
    blue: '#016AFE',
} as const;

/** K15,250 — whole kwacha; big numbers stay readable. */
export function formatK(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}K${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}
/** For tight spaces (chart pills): 15,250 · 152.5k · 1.25M. */
export function compactK(n: number): string {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
    if (a >= 100_000) return `${s}${(a / 1000).toFixed(1)}k`;
    return `${s}${Math.round(a).toLocaleString('en-US')}`;
}

export const TARGET_META: Record<GrowTargetKey, { emoji: string; label: string; short: string }> = {
    income: { emoji: '💷', label: 'Income target', short: 'Income' },
    expense: { emoji: '💳', label: 'Spending limit', short: 'Spending' },
    savings: { emoji: '💰', label: 'Savings target', short: 'Savings' },
    investment: { emoji: '🏦', label: 'Investment target', short: 'Investing' },
};

export const MONTH_STATUS_META: Record<GrowMonthStatus, { label: string; bg: string; fg: string }> = {
    UPCOMING: { label: 'Upcoming', bg: '#F4F4F5', fg: '#52525B' },
    IN_PROGRESS: { label: 'In progress', bg: '#EFEFF1', fg: '#3F3F46' },
    ON_TRACK: { label: 'On track', bg: GROW_COLORS.successSoft, fg: '#15803D' },
    OFF_TRACK: { label: 'Missed', bg: GROW_COLORS.dangerBg, fg: GROW_COLORS.dangerInk },
};

/** A finished month reads "Completed" only when every target was hit; on-track-but-imperfect says "On track". */
export function MonthStatusPill({ status, metCount = 0 }: { status: GrowMonthStatus; metCount?: number }) {
    const base = MONTH_STATUS_META[status];
    const meta = status === 'ON_TRACK' && metCount === 4 ? { ...base, label: 'Completed' } : base;
    const Icon = status === 'ON_TRACK' ? Check : status === 'OFF_TRACK' ? X : status === 'IN_PROGRESS' ? Clock3 : CalendarClock;
    return (
        <View style={[styles.pill, { backgroundColor: meta.bg }]}>
            <Icon size={12} color={meta.fg} strokeWidth={2.5} />
            <Text style={[styles.pillText, { color: meta.fg }]}>{meta.label}</Text>
        </View>
    );
}

/** Tick (met), empty circle (still open), cross (missed) — all the same size. */
export function TargetStatusIcon({ status, size = 15 }: { status: GrowTargetStatus; size?: number }) {
    if (status === 'met') {
        return (
            <View style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: GROW_COLORS.blue }]}>
                <Check size={size * 0.62} color="#FFFFFF" strokeWidth={3} />
            </View>
        );
    }
    if (status === 'missed') {
        return (
            <View style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: GROW_COLORS.dangerInk }]}>
                <X size={size * 0.62} color="#FFFFFF" strokeWidth={3} />
            </View>
        );
    }
    return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#A1A1AA' }} />;
}

export function AheadChip({ aheadBy }: { aheadBy: number }) {
    const ahead = aheadBy >= -0.5;
    const Icon = ahead ? TrendingUp : TrendingDown;
    const fg = ahead ? '#15803D' : GROW_COLORS.dangerInk;
    const text = Math.abs(aheadBy) < 1 ? 'Right on plan' : `${formatK(Math.abs(aheadBy))} ${ahead ? 'ahead of plan' : 'behind plan'}`;
    return (
        <View style={[styles.chip, { backgroundColor: ahead ? GROW_COLORS.successSoft : GROW_COLORS.dangerBg }]}>
            <Icon size={14} color={fg} strokeWidth={2.4} />
            <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
        </View>
    );
}

export function Legend() {
    const item = (label: string, bg: string, border: string) => (
        <View style={styles.legendItem} key={label}>
            <View style={[styles.legendDot, { backgroundColor: bg, borderColor: border }]} />
            <Text style={styles.legendText}>{label}</Text>
        </View>
    );
    return (
        <View style={styles.legend}>
            {item('ON TRACK', GROW_COLORS.successBg, GROW_COLORS.success)}
            {item('OFF TRACK', GROW_COLORS.dangerBg, GROW_COLORS.danger)}
            {item('PLAN', GROW_COLORS.planBg, GROW_COLORS.planInk)}
        </View>
    );
}

const styles = StyleSheet.create({
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    pillText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
    round: { alignItems: 'center', justifyContent: 'center' },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    chipText: { fontFamily: fonts.bodyBold, fontSize: 12 },
    legend: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
    legendText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.4, color: '#404040' },
});

export { colors };
