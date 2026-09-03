import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import {
    reportService, budgetService, accountService,
    buildReportGroups, computeReportTotals, formatKwacha,
} from 'core';
import type { ReportView, ExpenditureMode, ExpenditureAggregation } from 'core';
import { ReportTrendChart, type ChartTimeframe, type TrendPoint } from '../../src/components/reporting/ReportTrendChart';
import { AnimatedSegmented, AnimatedTabContent } from '../../src/components/AnimatedTabs';
import { colors, fonts, radius } from '../../src/theme/tokens';

const CHART_WIDTH = Dimensions.get('window').width - 80;

/** Same bucketing idea as web's Reporting.tsx buildChartPeriods, with 1D/1W
 * trimmed to trailing windows (see ReportTrendChart's doc comment). */
function buildChartPeriods(tf: ChartTimeframe): { startDate: string; endDate: string; label: string }[] {
    const periods: { startDate: string; endDate: string; label: string }[] = [];
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (tf === '1D') {
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            periods.push({ startDate: iso(d), endDate: iso(d), label: d.toLocaleDateString('en-US', { day: 'numeric' }) });
        }
    } else if (tf === '1W') {
        let end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        for (let i = 0; i < 12; i++) {
            const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
            periods.unshift({ startDate: iso(start), endDate: iso(end), label: end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) });
            end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7);
        }
    } else if (tf === '3M') {
        for (let i = 7; i >= 0; i--) {
            const start = new Date(today.getFullYear(), today.getMonth() - i * 3, 1);
            const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
            periods.push({ startDate: iso(start), endDate: iso(end), label: start.toLocaleDateString('en-US', { month: 'short' }) });
        }
    } else if (tf === 'YTD') {
        for (let mo = 0; mo <= today.getMonth(); mo++) {
            const start = new Date(today.getFullYear(), mo, 1);
            const end = new Date(today.getFullYear(), mo + 1, 0);
            periods.push({ startDate: iso(start), endDate: iso(end), label: start.toLocaleDateString('en-US', { month: 'short' }) });
        }
    } else {
        for (let i = 11; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            periods.push({ startDate: iso(d), endDate: iso(end), label: d.toLocaleDateString('en-US', { month: 'short' }) });
        }
    }
    return periods;
}

/** Local-time ISO date — matches core/format's date handling, so period
 * boundaries don't shift a day for a Lusaka user (UTC+2). */
const toLocalISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Period = 'MONTH' | 'QUARTER' | 'YTD';

function periodRange(period: Period): { start: string; end: string; prevStart: string; prevEnd: string } {
    const now = new Date();
    let start: Date, end: Date;
    if (period === 'MONTH') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (period === 'QUARTER') {
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 0);
    } else {
        start = new Date(now.getFullYear(), 0, 1);
        end = now;
    }
    const prevStart = new Date(start); prevStart.setFullYear(prevStart.getFullYear() - 1);
    const prevEnd = new Date(end); prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    return {
        start: toLocalISODate(start), end: toLocalISODate(end),
        prevStart: toLocalISODate(prevStart), prevEnd: toLocalISODate(prevEnd),
    };
}

/**
 * Reporting — a focused subset of the web report. Ships the headline card
 * (tap to reveal the trend chart, matching web), period toggle and the
 * grouped category breakdown with budget variance and period-over-period
 * change; budget-editing UI stays on web for now.
 */
export default function ReportingScreen() {
    const insets = useSafeAreaInsets();
    const [view, setView] = useState<ReportView>('PROFIT_LOSS');
    const [period, setPeriod] = useState<Period>('MONTH');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [chartOpen, setChartOpen] = useState(false);
    const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('1M');

    const range = useMemo(() => periodRange(period), [period]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['report', view, period],
        queryFn: async () => {
            const mode: ExpenditureMode = view === 'PROFIT_LOSS' ? 'EXPENSE' : 'CASH_OUTFLOW';
            const [expData, budData, accData, prevExpData] = await Promise.all([
                reportService.getExpenditures(range.start, range.end, mode),
                budgetService.getBudgets(range.start, range.end, 'MONTHLY'),
                accountService.getAll(),
                reportService.getExpenditures(range.prevStart, range.prevEnd, mode),
            ]);
            return { expData, budData, accData, prevExpData };
        },
    });

    const { groups } = useMemo(() => {
        if (!data) return { groups: {} as any };
        return buildReportGroups(data.accData, data.expData, data.budData, data.prevExpData, view);
    }, [data, view]);

    const totals = useMemo(() => computeReportTotals(groups), [groups]);
    const headline = view === 'PROFIT_LOSS' ? totals.totalProfit : totals.netWorth;
    const headlineChange = view === 'PROFIT_LOSS' ? totals.profitChange : totals.netWorthChange;

    const toggle = (key: string) => setExpanded((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });

    const chartPeriods = useMemo(() => buildChartPeriods(chartTimeframe), [chartTimeframe]);

    const { data: chartRaw, isLoading: chartLoading } = useQuery({
        queryKey: ['report-chart', view, chartTimeframe],
        queryFn: async (): Promise<ExpenditureAggregation[][]> =>
            Promise.all(chartPeriods.map((p) => reportService.getExpenditures(p.startDate, p.endDate, 'EXPENSE'))),
        enabled: chartOpen,
    });

    const chartPoints: TrendPoint[] = useMemo(() => {
        if (!chartRaw) return [];
        return chartPeriods.map((p, i) => {
            const exps = chartRaw[i] ?? [];
            let value: number;
            if (view === 'PROFIT_LOSS') {
                const revenue = exps.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.total_amount, 0);
                const expenses = exps.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.total_amount, 0);
                value = revenue - expenses;
            } else {
                const assets = exps.filter((e) => e.type === 'ASSET').reduce((s, e) => s + e.total_amount, 0);
                const liabilities = exps.filter((e) => e.type === 'LIABILITY').reduce((s, e) => s + e.total_amount, 0);
                value = assets - liabilities;
            }
            return { label: p.label, shortLabel: p.label, value };
        });
    }, [chartRaw, chartPeriods, view]);

    return (
        <ScrollView style={styles.root} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.title}>Reporting</Text>

            <AnimatedSegmented
                value={view}
                onChange={(v) => setView(v as ReportView)}
                trackStyle={styles.segment}
                indicatorStyle={styles.segmentIndicator}
                itemStyle={styles.segmentBtn}
                items={(['PROFIT_LOSS', 'NET_WORTH'] as ReportView[]).map((v) => ({
                    value: v,
                    content: (
                        <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
                            {v === 'PROFIT_LOSS' ? 'Profit/Loss' : 'Net Worth'}
                        </Text>
                    ),
                }))}
            />

            <AnimatedTabContent tabKey={view} index={view === 'NET_WORTH' ? 1 : 0} style={{ gap: 14 }}>
            <View style={styles.hero}>
                <Pressable onPress={() => setChartOpen((o) => !o)}>
                    <View style={styles.heroTop}>
                        <Text style={styles.heroLabel}>{view === 'PROFIT_LOSS' ? 'Total Profit' : 'Net Worth'}</Text>
                        <ChevronDown size={16} color="rgba(255,255,255,0.5)" style={chartOpen ? styles.heroChevronOpen : undefined} />
                    </View>
                    {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" style={{ marginTop: 8, alignSelf: 'flex-start' }} />
                    ) : (
                        <>
                            <Text style={styles.heroValue}>{formatKwacha(headline)}</Text>
                            <View style={styles.heroChange}>
                                {headlineChange.isIncrease
                                    ? <ChevronRight size={13} color="#4ADE80" style={{ transform: [{ rotate: '-90deg' }] }} />
                                    : <ChevronRight size={13} color="#F87171" style={{ transform: [{ rotate: '90deg' }] }} />}
                                <Text style={[styles.heroChangeText, { color: headlineChange.isIncrease ? '#4ADE80' : '#F87171' }]}>
                                    {headlineChange.value}% vs last year
                                </Text>
                            </View>
                        </>
                    )}
                </Pressable>

                {chartOpen && (
                    <View style={styles.heroChartWrap}>
                        <ReportTrendChart
                            points={chartPoints}
                            loading={chartLoading}
                            timeframe={chartTimeframe}
                            onTimeframeChange={setChartTimeframe}
                            width={CHART_WIDTH}
                        />
                    </View>
                )}
            </View>

            <View style={styles.periodRow}>
                {(['MONTH', 'QUARTER', 'YTD'] as Period[]).map((p) => (
                    <Pressable
                        key={p}
                        onPress={() => setPeriod(p)}
                        style={[styles.periodChip, period === p && styles.periodChipActive]}
                    >
                        <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                            {p === 'MONTH' ? 'This month' : p === 'QUARTER' ? 'This quarter' : 'YTD'}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {isError && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Couldn’t load the report</Text>
                </View>
            )}

            {Object.entries(groups).map(([key, group]: [string, any]) => {
                if (group.items.length === 0) return null;
                const isOpen = expanded.has(key);
                const progress = group.totals.budgeted_amount > 0
                    ? Math.min((group.totals.total_amount / group.totals.budgeted_amount) * 100, 100)
                    : 0;
                return (
                    <View key={key} style={styles.groupCard}>
                        <Pressable style={styles.groupHeader} onPress={() => toggle(key)}>
                            <View style={styles.groupHeaderMain}>
                                <Text style={styles.groupName}>{group.groupName}</Text>
                                <Text style={styles.groupTotal}>{formatKwacha(group.totals.total_amount)}</Text>
                            </View>
                            {isOpen
                                ? <ChevronDown size={16} color={colors.textFaint} />
                                : <ChevronRight size={16} color={colors.textFaint} />}
                        </Pressable>

                        {group.totals.budgeted_amount > 0 && (
                            <View style={styles.progressTrack}>
                                <View style={[styles.progressFill, { width: `${progress}%` },
                                    progress > 100 && styles.progressOver]} />
                            </View>
                        )}

                        {isOpen && group.items.map((item: any) => (
                            <View key={item.account_id} style={styles.item}>
                                <Text style={styles.itemName} numberOfLines={1}>{item.account_name}</Text>
                                <Text style={styles.itemAmount}>{formatKwacha(item.total_amount)}</Text>
                            </View>
                        ))}
                    </View>
                );
            })}

            {!isLoading && !isError && Object.values(groups).every((g: any) => g.items.length === 0) && (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>No activity in this period.</Text>
                </View>
            )}
            </AnimatedTabContent>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { paddingHorizontal: 20, paddingBottom: 100, gap: 14 },
    title: { fontFamily: fonts.display, fontSize: 30, color: '#000000' },
    segment: {
        flexDirection: 'row', padding: 4, backgroundColor: colors.chipActiveBg,
        borderRadius: radius.pill,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    segmentIndicator: {
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { color: colors.text },
    hero: {
        backgroundColor: '#0F172A', borderRadius: 18, padding: 20, minHeight: 110,
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between' },
    heroLabel: { fontFamily: fonts.body, fontSize: 12, color: '#94A3B8', letterSpacing: 0.5 },
    heroValue: { fontFamily: fonts.bodyBold, fontSize: 32, color: '#FFFFFF', marginTop: 4 },
    heroChange: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
    heroChangeText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
    heroChevronOpen: { transform: [{ rotate: '180deg' }] },
    heroChartWrap: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    periodRow: { flexDirection: 'row', gap: 8 },
    periodChip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    periodChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    periodText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    periodTextActive: { color: '#FFFFFF' },
    groupCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
        borderWidth: 1, borderColor: colors.border,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    groupHeaderMain: { flex: 1 },
    groupName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    groupTotal: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.navy, marginTop: 2 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.canvasAlt, marginTop: 10, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 2 },
    progressOver: { backgroundColor: colors.danger },
    item: {
        flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 8,
    },
    itemName: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginRight: 12 },
    itemAmount: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    errorCard: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 16,
        borderWidth: 1, borderColor: colors.danger,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
});
