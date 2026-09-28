import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radius } from '../../theme/tokens';

const BUCKET_COLORS = {
    today: '#006AFF',
    week: '#7657E8',
    month: '#D85BB5',
    quarter: '#8E8FA3',
    year: '#D9DCE5',
};

const BUCKET_LABELS = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    quarter: 'This Qtr',
    year: 'YTD',
};

const BUCKET_ORDER = ['year', 'quarter', 'month', 'week', 'today'] as const;

function isSameDay(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

function isSameWeek(d1: Date, d2: Date) {
    const startOfWeek = new Date(d2);
    startOfWeek.setDate(d2.getDate() - d2.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return d1 >= startOfWeek && d1 <= endOfWeek;
}

function isSameMonth(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

function isSameQuarter(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear() &&
        Math.floor(d1.getMonth() / 3) === Math.floor(d2.getMonth() / 3);
}

export function calculateBuckets(items: any[]) {
    const buckets = { today: 0, week: 0, month: 0, quarter: 0, year: 0 };
    const now = new Date();

    (items || []).forEach((item) => {
        const d = item.date ? new Date(item.date) : new Date();
        const amt = Number(item.amount) || 0;

        if (isSameDay(d, now)) {
            buckets.today += amt;
        } else if (isSameWeek(d, now)) {
            buckets.week += amt;
        } else if (isSameMonth(d, now)) {
            buckets.month += amt;
        } else if (isSameQuarter(d, now)) {
            buckets.quarter += amt;
        } else {
            buckets.year += amt;
        }
    });

    return buckets;
}

export const BucketProgressBar: React.FC<{
    items: any[];
    currTotal: number;
    groupId: string;
}> = ({ items, currTotal }) => {
    const buckets = calculateBuckets(items || []);

    const absBuckets = {
        today: Math.abs(buckets.today),
        week: Math.abs(buckets.week),
        month: Math.abs(buckets.month),
        quarter: Math.abs(buckets.quarter),
        year: Math.abs(buckets.year),
    };

    const totalActivity = absBuckets.today + absBuckets.week + absBuckets.month + absBuckets.quarter + absBuckets.year;
    const denominator = totalActivity > 0 ? totalActivity : Math.max(Math.abs(currTotal), 1);

    return (
        <View style={styles.container}>
            {/* Multi-segmented progress bar */}
            <View style={styles.track}>
                {totalActivity > 0 ? (
                    BUCKET_ORDER.map((key) => {
                        const val = absBuckets[key];
                        if (val === 0) return null;
                        const pct = (val / denominator) * 100;
                        return (
                            <View
                                key={key}
                                style={[
                                    styles.segment,
                                    { width: `${pct}%`, backgroundColor: BUCKET_COLORS[key] },
                                ]}
                            />
                        );
                    })
                ) : (
                    <View style={styles.fallbackBar} />
                )}
            </View>

            {/* Bucket Legend */}
            {totalActivity > 0 && (
                <View style={styles.legendRow}>
                    {BUCKET_ORDER.map((k) => {
                        const val = absBuckets[k];
                        if (val === 0) return null;
                        const rawVal = buckets[k];
                        const label = BUCKET_LABELS[k];

                        return (
                            <View key={k} style={styles.legendItem}>
                                <View style={[styles.dot, { backgroundColor: BUCKET_COLORS[k] }]} />
                                <Text style={styles.legendText}>
                                    {label}: <Text style={styles.legendAmount}>K{Math.abs(Math.round(rawVal)).toLocaleString()}</Text>
                                </Text>
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { width: '100%', gap: 6, marginVertical: 4 },
    track: {
        height: 6, width: '100%', borderRadius: radius.pill,
        backgroundColor: colors.canvasAlt, overflow: 'hidden', flexDirection: 'row',
    },
    segment: { height: '100%' },
    fallbackBar: { height: '100%', width: '100%', backgroundColor: colors.borderStrong },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    legendText: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    legendAmount: { fontFamily: fonts.bodyBold, color: colors.text },
});
