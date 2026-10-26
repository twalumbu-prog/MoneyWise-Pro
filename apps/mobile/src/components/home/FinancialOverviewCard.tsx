import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { reportService, formatKwacha } from 'core';
import { useAuth } from '../../context/AuthContext';
import { extractEmojiAndName } from '../../utils/emoji';
import { AccountGlyph } from '../AccountGlyph';
import { HomeCard } from './HomeCard';
import { colors, fonts } from '../../theme/tokens';

const SLICE_COLORS = ['#006AFF', '#03D47C', '#FF2970', '#F59E0B', '#8B5CF6'];
const OTHER_COLOR = '#CBD5E1';
const SIZE = 120;
const STROKE = 16;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** This calendar month, so "this period" always means the month in progress. */
function thisMonth() {
    const now = new Date();
    return {
        start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
}

/** Financial Overview: a ring of where this month's money went, with the five biggest expense accounts; "See more" opens Reporting. */
export const FinancialOverviewCard: React.FC = () => {
    const router = useRouter();
    const { organizationId } = useAuth();
    const period = useMemo(thisMonth, []);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['home-overview', organizationId, period.start],
        queryFn: () => reportService.getExpenditures(period.start, period.end, 'EXPENSE'),
        enabled: !!organizationId,
    });

    const { top, total, slices } = useMemo(() => {
        const expenses = (data ?? []).filter((r) => r.type === 'EXPENSE' && Number(r.total_amount) > 0)
            .sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
        const totalAll = expenses.reduce((s, r) => s + Number(r.total_amount), 0);
        const topFive = expenses.slice(0, 5);
        const rest = totalAll - topFive.reduce((s, r) => s + Number(r.total_amount), 0);
        const parts = topFive.map((r, i) => ({ value: Number(r.total_amount), color: SLICE_COLORS[i] }));
        if (rest > 0.005) parts.push({ value: rest, color: OTHER_COLOR });
        return { top: topFive, total: totalAll, slices: parts };
    }, [data]);

    const r = (SIZE - STROKE) / 2;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    return (
        <HomeCard title="Financial Overview" actionLabel="See more" onAction={() => router.navigate('/reporting')}>
            {isLoading ? (
                <ActivityIndicator color={colors.blue} style={{ paddingVertical: 28 }} />
            ) : isError ? (
                <Text style={styles.empty}>Couldn’t load your spending. Pull to refresh on Reporting.</Text>
            ) : total <= 0 ? (
                <View style={styles.emptyWrap}>
                    <Text style={styles.empty}>No spending recorded in {period.label} yet.</Text>
                </View>
            ) : (
                <View>
                    <Text style={styles.period}>Spent in {period.label}</Text>
                    <View style={styles.body}>
                        <View style={styles.ring}>
                            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                                <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
                                    <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={colors.chipActiveBg} strokeWidth={STROKE} fill="none" />
                                    {slices.map((s, i) => {
                                        const len = (s.value / total) * circumference;
                                        const el = (
                                            <Circle
                                                key={i} cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={s.color} strokeWidth={STROKE} fill="none"
                                                strokeDasharray={`${Math.max(len - 1.5, 0)} ${circumference}`} strokeDashoffset={-offset} strokeLinecap="butt"
                                            />
                                        );
                                        offset += len;
                                        return el;
                                    })}
                                </G>
                            </Svg>
                            <View style={styles.center} pointerEvents="none">
                                <Text style={styles.centerLabel}>Total</Text>
                                <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>{formatKwacha(total)}</Text>
                            </View>
                        </View>

                        <View style={styles.legend}>
                            {top.map((row, i) => {
                                const { cleanName } = extractEmojiAndName(row.account_name);
                                return (
                                    <View key={row.account_id} style={styles.legendRow}>
                                        <View style={[styles.dot, { backgroundColor: SLICE_COLORS[i] }]} />
                                        <View style={styles.glyph}><AccountGlyph name={row.account_name} type="EXPENSE" logoUrl={row.logo_url} size={15} /></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.legendName} numberOfLines={1}>{cleanName}</Text>
                                            <Text style={styles.legendAmount} numberOfLines={1}>{formatKwacha(Number(row.total_amount))}</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </View>
            )}
        </HomeCard>
    );
};

const styles = StyleSheet.create({
    period: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint, marginTop: -8, marginBottom: 14 },
    body: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
    center: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: SIZE - STROKE * 2 - 8 },
    centerLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
    centerValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#000000', maxWidth: '100%' },
    legend: { flex: 1, gap: 12 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    glyph: { width: 22, alignItems: 'center', justifyContent: 'center' },
    legendName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: '#000000' },
    legendAmount: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    emptyWrap: { paddingVertical: 16, alignItems: 'center' },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center' },
});
