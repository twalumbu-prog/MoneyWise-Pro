import { useMemo, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
    Modal, TextInput, RefreshControl, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ChevronDown, ChevronRight, Filter, ArrowUpDown, CalendarDays, X, Check, Settings, Share2,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    reportService, budgetService, accountService, isPersonalOrgName,
    buildReportGroups, computeReportTotals, formatKwacha,
} from 'core';
import type { ReportView, ExpenditureMode, ExpenditureItem } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { cacheStoreSync } from '../../src/platform/storage';
import { budgetsActivatedKey } from '../budgets';
import { extractEmojiAndName, getAccountEmoji } from '../../src/utils/emoji';
import { FinancialHighlights } from '../../src/components/reporting/FinancialHighlights';
import { BucketProgressBar } from '../../src/components/reporting/BucketProgressBar';
import { ReportChartView, type ChartTimeframe, type TrendPoint } from '../../src/components/reporting/ReportChartView';
import { AnimatedSegmented, AnimatedTabContent } from '../../src/components/AnimatedTabs';
import { colors, fonts, radius } from '../../src/theme/tokens';

function buildChartPeriods(tf: ChartTimeframe): { startDate: string; endDate: string; label: string; shortLabel: string }[] {
    const periods: { startDate: string; endDate: string; label: string; shortLabel: string }[] = [];
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (tf === '1D') {
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            periods.push({
                startDate: iso(d), endDate: iso(d),
                label: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
                shortLabel: d.toLocaleDateString('en-US', { day: 'numeric' }),
            });
        }
    } else if (tf === '1W') {
        let end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        for (let i = 0; i < 12; i++) {
            const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
            periods.unshift({
                startDate: iso(start), endDate: iso(end),
                label: `${start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`,
                shortLabel: end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
            });
            end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7);
        }
    } else if (tf === '3M') {
        for (let i = 7; i >= 0; i--) {
            const start = new Date(today.getFullYear(), today.getMonth() - i * 3, 1);
            const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
            periods.push({
                startDate: iso(start), endDate: iso(end),
                label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                shortLabel: start.toLocaleDateString('en-US', { month: 'short' }),
            });
        }
    } else if (tf === 'YTD') {
        for (let mo = 0; mo <= today.getMonth(); mo++) {
            const start = new Date(today.getFullYear(), mo, 1);
            const end = new Date(today.getFullYear(), mo + 1, 0);
            periods.push({
                startDate: iso(start), endDate: iso(end),
                label: start.toLocaleDateString('en-US', { month: 'long' }),
                shortLabel: start.toLocaleDateString('en-US', { month: 'short' }),
            });
        }
    } else {
        for (let i = 11; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            periods.push({
                startDate: iso(d), endDate: iso(end),
                label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                shortLabel: d.toLocaleDateString('en-US', { month: 'short' }),
            });
        }
    }
    return periods;
}

const toLocalISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Budgets are always current-month (matching how the Budgets screen saves
 * them), independent of whatever date range the report itself is showing —
 * fetching with the report's own range excludes the in-progress month, since
 * its end_date (the last day of the month) hasn't happened yet and fails a
 * "budget ends on/before <today>" filter on the backend. */
function currentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toLocalISODate(start), end: toLocalISODate(end) };
}

/**
 * Per-account budget-progress color. The two account types read opposite
 * directions — overspending an expense target is bad (red), while exceeding
 * an income target is the goal (green) — so the same percentage means the
 * opposite thing depending on `accountType`, not just a single threshold.
 */
function budgetBarColor(accountType: string, pct: number): string {
    if (accountType === 'INCOME') return pct >= 100 ? colors.positiveInk : colors.blue;
    if (pct >= 100) return colors.danger;
    if (pct >= 80) return colors.warn;
    return colors.blue;
}

export default function ReportingScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { organizationId, organizationName, userOrganizations } = useAuth();
    const currentOrg = userOrganizations.find((uo) => uo.organization?.id === organizationId)?.organization;
    const isPersonal = isPersonalOrgName(currentOrg?.name || organizationName || '');

    const [view, setView] = useState<ReportView>('PROFIT_LOSS');
    const [refreshing, setRefreshing] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['INCOME', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY']));
    const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

    // Budgets: device-local "activated" toggle set on the Budgets settings
    // screen. Re-read on focus so returning from there reflects the change
    // immediately without needing a full remount.
    const [budgetsActivated, setBudgetsActivated] = useState(() => cacheStoreSync.getItem(budgetsActivatedKey(organizationId)) === 'true');
    useFocusEffect(useCallback(() => {
        setBudgetsActivated(cacheStoreSync.getItem(budgetsActivatedKey(organizationId)) === 'true');
    }, [organizationId]));

    // Toolbar filters & settings
    const [excludeZeroSpend, setExcludeZeroSpend] = useState(true);
    const [sortField, setSortField] = useState<'amount' | 'name'>('amount');
    const [sortDesc, setSortDesc] = useState(true);
    const [isSortModalOpen, setIsSortModalOpen] = useState(false);

    // Custom Date Range Filter
    const [customFilter, setCustomFilter] = useState<{ start: string; end: string } | null>(null);
    const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
    const [filterStartInput, setFilterStartInput] = useState('');
    const [filterEndInput, setFilterEndInput] = useState('');

    // Chart Full Sub-Screen Slide
    const [chartOpen, setChartOpen] = useState(false);
    const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('1M');

    // Account items state (subaccount transactions)
    const [accountItems, setAccountItems] = useState<Record<string, ExpenditureItem[]>>({});
    const [accountItemsLoading, setAccountItemsLoading] = useState<Record<string, boolean>>({});

    const range = useMemo(() => {
        if (customFilter) return { start: customFilter.start, end: customFilter.end, label: `${customFilter.start} – ${customFilter.end}` };
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        return { start: toLocalISODate(start), end: toLocalISODate(now), label: `YTD ${now.getFullYear()}` };
    }, [customFilter]);

    const prevRange = useMemo(() => {
        const s = new Date(range.start); s.setFullYear(s.getFullYear() - 1);
        const e = new Date(range.end); e.setFullYear(e.getFullYear() - 1);
        return { start: toLocalISODate(s), end: toLocalISODate(e) };
    }, [range]);

    const { data, isLoading, isError, refetch, isRefetching } = useQuery({
        queryKey: ['report', organizationId, view, range.start, range.end],
        queryFn: async () => {
            const mode: ExpenditureMode = view === 'PROFIT_LOSS' ? 'EXPENSE' : 'CASH_OUTFLOW';
            const monthRange = currentMonthRange();
            const [expData, budData, accData, prevExpData] = await Promise.all([
                reportService.getExpenditures(range.start, range.end, mode),
                budgetService.getBudgets(monthRange.start, monthRange.end, 'MONTHLY'),
                accountService.getAll(),
                reportService.getExpenditures(prevRange.start, prevRange.end, mode),
            ]);
            return { expData, budData, accData, prevExpData };
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        queryClient.invalidateQueries({ queryKey: ['report'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        setRefreshing(false);
    }, [refetch, queryClient]);

    const { groups } = useMemo(() => {
        if (!data) return { groups: {} as any };
        return buildReportGroups(data.accData, data.expData, data.budData, data.prevExpData, view, {
            excludeZeroSpend, sortField, sortDesc,
        });
    }, [data, view, excludeZeroSpend, sortField, sortDesc]);

    const totals = useMemo(() => computeReportTotals(groups), [groups]);
    const headline = view === 'PROFIT_LOSS' ? totals.totalProfit : totals.netWorth;

    const toggleGroup = (key: string) => setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });

    const toggleAccountExpand = async (accountId: string) => {
        if (expandedAccount === accountId) {
            setExpandedAccount(null);
            return;
        }
        setExpandedAccount(accountId);

        if (!accountItems[accountId]) {
            setAccountItemsLoading((prev) => ({ ...prev, [accountId]: true }));
            try {
                const mode: ExpenditureMode = view === 'PROFIT_LOSS' ? 'EXPENSE' : 'CASH_OUTFLOW';
                const items = await reportService.getExpenditureItems(accountId, range.start, range.end, mode);
                setAccountItems((prev) => ({ ...prev, [accountId]: items }));
            } catch (err) {
                console.error('Failed to load subaccount items', err);
            } finally {
                setAccountItemsLoading((prev) => ({ ...prev, [accountId]: false }));
            }
        }
    };

    const chartPeriods = useMemo(() => buildChartPeriods(chartTimeframe), [chartTimeframe]);

    const { data: chartRaw, isLoading: chartLoading } = useQuery({
        queryKey: ['report-chart', organizationId, view, chartTimeframe],
        queryFn: async () =>
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
            return { label: p.label, shortLabel: p.shortLabel, value };
        });
    }, [chartRaw, chartPeriods, view]);

    if (chartOpen) {
        return (
            <View style={[styles.root, { flex: 1, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 10, gap: 14 }]}>
                <Text style={styles.title}>Reporting</Text>

                {/* Segmented View Toggle: Profit/Loss vs Net Worth */}
                <AnimatedSegmented
                    value={view}
                    onChange={(v) => setView(v as ReportView)}
                    trackStyle={styles.segment}
                    indicatorStyle={styles.segmentIndicator}
                    itemStyle={styles.segmentBtn}
                    items={(['NET_WORTH', 'PROFIT_LOSS'] as ReportView[]).map((v) => ({
                        value: v,
                        content: (
                            <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
                                {v === 'PROFIT_LOSS' ? 'Profit/Loss' : 'Net Worth'}
                            </Text>
                        ),
                    }))}
                />

                <View style={{ flex: 1 }}>
                    <ReportChartView
                        reportView={view}
                        timeframe={chartTimeframe}
                        onTimeframeChange={setChartTimeframe}
                        points={chartPoints}
                        loading={chartLoading}
                        onClose={() => setChartOpen(false)}
                    />
                </View>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.root}
            contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
            refreshControl={
                <RefreshControl refreshing={refreshing || isRefetching} onRefresh={onRefresh} tintColor={colors.blue} />
            }
        >
            <View style={styles.header}>
                <Text style={styles.title}>Reporting</Text>
                {isPersonal && (
                    <View style={styles.headerActions}>
                        <Pressable style={styles.iconBtn} onPress={() => router.push('/budgets')} accessibilityLabel="Budget Settings">
                            <Settings size={18} color={colors.textMuted} />
                        </Pressable>
                        <Pressable
                            style={styles.iconBtn}
                            onPress={() => { /* Sharing reports is coming soon. */ }}
                            accessibilityLabel="Share"
                        >
                            <Share2 size={18} color={colors.textMuted} />
                        </Pressable>
                    </View>
                )}
            </View>

            {/* Segmented View Toggle: Profit/Loss vs Net Worth */}
            <AnimatedSegmented
                value={view}
                onChange={(v) => setView(v as ReportView)}
                trackStyle={styles.segment}
                indicatorStyle={styles.segmentIndicator}
                itemStyle={styles.segmentBtn}
                items={(['NET_WORTH', 'PROFIT_LOSS'] as ReportView[]).map((v) => ({
                    value: v,
                    content: (
                        <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
                            {v === 'PROFIT_LOSS' ? 'Profit/Loss' : 'Net Worth'}
                        </Text>
                    ),
                }))}
            />

            <AnimatedTabContent tabKey={view} index={view === 'PROFIT_LOSS' ? 1 : 0} style={{ gap: 14 }}>
                    <>
                        {/* Dark Gradient Hero Card (NO percentage change on this card) */}
                        <LinearGradient
                            colors={['#0F172A', '#172554']}
                            start={{ x: 1, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.hero}
                        >
                            <Pressable onPress={() => setChartOpen(true)}>
                                <View style={styles.heroTop}>
                                    <Text style={styles.heroLabel}>{view === 'PROFIT_LOSS' ? 'TOTAL PROFIT' : 'NET WORTH'}</Text>
                                    <View style={styles.heroChevronWrap}>
                                        <ChevronDown size={14} color="#FFFFFF" />
                                    </View>
                                </View>
                                {isLoading ? (
                                    <ActivityIndicator color="#FFFFFF" style={{ marginTop: 8, alignSelf: 'flex-start' }} />
                                ) : (
                                    <Text style={styles.heroValue}>{formatKwacha(headline)}</Text>
                                )}
                            </Pressable>
                        </LinearGradient>

                        {/* Financial Highlights Stack */}
                        <FinancialHighlights />

                        {/* Toolbar: Date Range Label + Sort & Filter Buttons */}
                        <View style={styles.toolbar}>
                            <Pressable
                                style={styles.dateRangeBtn}
                                onPress={() => {
                                    setFilterStartInput(customFilter?.start ?? range.start);
                                    setFilterEndInput(customFilter?.end ?? range.end);
                                    setIsDateFilterOpen(true);
                                }}
                            >
                                <Text style={styles.dateRangeText}>{range.label}</Text>
                                <CalendarDays size={16} color={customFilter ? colors.blue : colors.textMuted} />
                            </Pressable>
                            {customFilter && (
                                <Pressable onPress={() => setCustomFilter(null)} style={styles.clearFilterBtn} hitSlop={6}>
                                    <X size={12} color={colors.textMuted} />
                                </Pressable>
                            )}

                            <View style={styles.toolbarActions}>
                                <Pressable
                                    style={[styles.iconPillBtn, excludeZeroSpend && styles.iconPillBtnActive]}
                                    onPress={() => setExcludeZeroSpend(!excludeZeroSpend)}
                                    hitSlop={6}
                                >
                                    <Filter size={16} color={excludeZeroSpend ? colors.blue : colors.textMuted} />
                                </Pressable>
                                <Pressable
                                    style={styles.iconPillBtn}
                                    onPress={() => setIsSortModalOpen(true)}
                                    hitSlop={6}
                                >
                                    <ArrowUpDown size={16} color={colors.textMuted} />
                                </Pressable>
                            </View>
                        </View>

                        {isError && (
                            <View style={styles.errorCard}>
                                <Text style={styles.errorTitle}>Couldn’t load the report</Text>
                            </View>
                        )}

                        {/* Category Accordion Cards */}
                        {Object.entries(groups).map(([key, group]: [string, any]) => {
                            const validItems = group.items.filter((item: any) => {
                                const amt = Number(item.total_amount) || 0;
                                return !excludeZeroSpend || amt !== 0;
                            });
                            if (validItems.length === 0) return null;

                            const isOpen = expandedGroups.has(key);
                            const progress = group.totals.budgeted_amount > 0
                                ? Math.min((group.totals.total_amount / group.totals.budgeted_amount) * 100, 100)
                                : 0;

                            return (
                                <View key={key} style={styles.groupCard}>
                                    <Pressable style={styles.groupHeader} onPress={() => toggleGroup(key)}>
                                        <View style={styles.groupHeaderMain}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={styles.groupName}>{group.groupName}</Text>
                                                <View style={styles.countBadge}>
                                                    <Text style={styles.countBadgeText}>{validItems.length}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.groupTotal}>{formatKwacha(group.totals.total_amount)}</Text>
                                        </View>
                                        {isOpen
                                            ? <ChevronDown size={18} color={colors.textMuted} />
                                            : <ChevronRight size={18} color={colors.textMuted} />}
                                    </Pressable>

                                    {group.totals.budgeted_amount > 0 && (
                                        <View style={styles.progressTrack}>
                                            <View
                                                style={[
                                                    styles.progressFill,
                                                    { width: `${progress}%` },
                                                    progress > 100 && styles.progressOver,
                                                ]}
                                            />
                                        </View>
                                    )}

                                    {/* Expanded Subaccounts */}
                                    {isOpen && (
                                        <View style={styles.subaccountsList}>
                                             {validItems.map((item: any) => {
                                                const isAccExpanded = expandedAccount === item.account_id;
                                                const txns = accountItems[item.account_id] || [];
                                                const isTxnsLoading = accountItemsLoading[item.account_id];
                                                const { emoji, cleanName } = extractEmojiAndName(item.account_name);
                                                const displayEmoji = emoji || getAccountEmoji(item.account_name, key);

                                                return (
                                                    <View key={item.account_id} style={styles.subaccountBox}>
                                                        <Pressable
                                                            style={styles.subaccountRow}
                                                            onPress={() => toggleAccountExpand(item.account_id)}
                                                        >
                                                             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, paddingRight: 8 }}>
                                                                {isAccExpanded ? (
                                                                    <ChevronDown size={14} color={colors.textMuted} />
                                                                ) : (
                                                                    <ChevronRight size={14} color={colors.textMuted} />
                                                                )}
                                                                {item.logo_url ? (
                                                                    <Image source={{ uri: item.logo_url }} style={{ width: 20, height: 20, borderRadius: 6 }} resizeMode="contain" />
                                                                ) : (
                                                                    <Text style={{ fontSize: 16 }}>{displayEmoji}</Text>
                                                                )}
                                                                <Text style={styles.subaccountName} numberOfLines={1} ellipsizeMode="tail">
                                                                    {cleanName}
                                                                </Text>
                                                            </View>
                                                            <Text style={styles.subaccountAmount}>
                                                                {formatKwacha(item.total_amount)}
                                                            </Text>
                                                        </Pressable>

                                                        {budgetsActivated && (() => {
                                                            const hasTarget = item.budgeted_amount > 0;
                                                            const pct = hasTarget ? (item.total_amount / item.budgeted_amount) * 100 : 0;
                                                            const barColor = hasTarget ? budgetBarColor(item.type, pct) : colors.borderStrong;
                                                            return (
                                                                <View style={styles.budgetBarWrap}>
                                                                    <View style={styles.budgetBarTrack}>
                                                                        <View style={[styles.budgetBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }]} />
                                                                    </View>
                                                                    <Text style={styles.budgetBarLabel}>
                                                                        {hasTarget
                                                                            ? `${formatKwacha(item.total_amount)} of ${formatKwacha(item.budgeted_amount)} · ${Math.round(pct)}%`
                                                                            : 'No target set'}
                                                                    </Text>
                                                                </View>
                                                            );
                                                        })()}

                                                        {/* Color-coded time bucket progress bar on expansion */}
                                                        {isAccExpanded && (
                                                            <View style={styles.expandContent}>
                                                                <BucketProgressBar
                                                                    items={txns}
                                                                    currTotal={item.total_amount}
                                                                    groupId={key}
                                                                />

                                                                {/* Subaccount transactions history list */}
                                                                <View style={styles.txnsContainer}>
                                                                    <Text style={styles.txnsHeader}>TRANSACTION HISTORY</Text>
                                                                    {isTxnsLoading ? (
                                                                        <ActivityIndicator color={colors.blue} style={{ marginVertical: 8 }} />
                                                                    ) : txns.length === 0 ? (
                                                                        <Text style={styles.noTxnsText}>No transactions in this period.</Text>
                                                                    ) : (
                                                                        txns.map((t) => (
                                                                            <View key={t.id} style={styles.txnRow}>
                                                                                <View style={{ flex: 1, paddingRight: 8 }}>
                                                                                    <Text style={styles.txnDesc} numberOfLines={1}>{t.description}</Text>
                                                                                    <Text style={styles.txnDate}>{new Date(t.date).toLocaleDateString()}</Text>
                                                                                </View>
                                                                                <Text style={styles.txnAmount}>{formatKwacha(t.amount)}</Text>
                                                                            </View>
                                                                        ))
                                                                    )}
                                                                </View>
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>
                            );
                        })}

                        {!isLoading && !isError && Object.values(groups).every((g: any) => g.items.length === 0) && (
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>No activity in this period.</Text>
                            </View>
                        )}
                    </>
            </AnimatedTabContent>

            {/* Sort Modal */}
            {isSortModalOpen && (
                <Modal visible={isSortModalOpen} transparent animationType="fade" onRequestClose={() => setIsSortModalOpen(false)}>
                    <Pressable style={styles.modalOverlay} onPress={() => setIsSortModalOpen(false)}>
                        <View style={styles.sortBox}>
                            <Text style={styles.sortTitle}>Sort Accounts</Text>
                            {[
                                { label: 'Amount (High to Low)', field: 'amount', desc: true },
                                { label: 'Amount (Low to High)', field: 'amount', desc: false },
                                { label: 'Name (A to Z)', field: 'name', desc: false },
                                { label: 'Name (Z to A)', field: 'name', desc: true },
                            ].map((opt, idx) => {
                                const selected = sortField === opt.field && sortDesc === opt.desc;
                                return (
                                    <Pressable
                                        key={idx}
                                        style={[styles.sortOption, selected && styles.sortOptionSelected]}
                                        onPress={() => {
                                            setSortField(opt.field as any);
                                            setSortDesc(opt.desc);
                                            setIsSortModalOpen(false);
                                        }}
                                    >
                                        <Text style={[styles.sortOptionText, selected && styles.sortOptionTextSelected]}>
                                            {opt.label}
                                        </Text>
                                        {selected && <Check size={16} color={colors.blue} />}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </Pressable>
                </Modal>
            )}

            {/* Custom Date Range Filter Modal */}
            {isDateFilterOpen && (
                <Modal visible={isDateFilterOpen} transparent animationType="fade" onRequestClose={() => setIsDateFilterOpen(false)}>
                    <Pressable style={styles.modalOverlay} onPress={() => setIsDateFilterOpen(false)}>
                        <View style={styles.dateFilterBox}>
                            <Text style={styles.dateFilterTitle}>Filter by Date Range</Text>
                            <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
                            <TextInput
                                style={styles.dateInput}
                                value={filterStartInput}
                                onChangeText={setFilterStartInput}
                                placeholder="2026-01-01"
                                placeholderTextColor={colors.textFaint}
                            />
                            <Text style={[styles.label, { marginTop: 10 }]}>End Date (YYYY-MM-DD)</Text>
                            <TextInput
                                style={styles.dateInput}
                                value={filterEndInput}
                                onChangeText={setFilterEndInput}
                                placeholder="2026-12-31"
                                placeholderTextColor={colors.textFaint}
                            />
                            <View style={styles.dateBtnRow}>
                                <Pressable
                                    style={styles.resetBtn}
                                    onPress={() => { setCustomFilter(null); setIsDateFilterOpen(false); }}
                                >
                                    <Text style={styles.resetBtnText}>Reset to YTD</Text>
                                </Pressable>
                                <Pressable
                                    style={styles.applyBtn}
                                    onPress={() => {
                                        if (filterStartInput && filterEndInput) {
                                            setCustomFilter({ start: filterStartInput, end: filterEndInput });
                                        }
                                        setIsDateFilterOpen(false);
                                    }}
                                >
                                    <Text style={styles.applyBtnText}>Apply</Text>
                                </Pressable>
                            </View>
                        </View>
                    </Pressable>
                </Modal>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { paddingHorizontal: 20, paddingBottom: 100, gap: 14 },
    title: { fontFamily: fonts.display, fontSize: 30, color: '#000000' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    segment: {
        flexDirection: 'row', padding: 4, backgroundColor: colors.chipActiveBg,
        borderRadius: radius.pill,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    segmentIndicator: {
        borderRadius: radius.pill, backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { color: colors.text },
    hero: { borderRadius: 18, padding: 20, minHeight: 100, overflow: 'hidden' },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#94A3B8', letterSpacing: 0.8 },
    heroValue: { fontFamily: fonts.bodyBold, fontSize: 32, color: '#FFFFFF', marginTop: 6 },
    heroChevronWrap: {
        width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
    dateRangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateRangeText: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    clearFilterBtn: { padding: 4 },
    toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconPillBtn: {
        padding: 8, borderRadius: radius.pill, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    iconPillBtnActive: { borderColor: colors.blue, backgroundColor: colors.tabActiveBg },
    groupCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
        borderWidth: 1, borderColor: colors.border,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    groupHeaderMain: { flex: 1 },
    groupName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    countBadge: { backgroundColor: colors.canvasAlt, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
    countBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted },
    groupTotal: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.navy, marginTop: 2 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.canvasAlt, marginTop: 10, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 2 },
    progressOver: { backgroundColor: colors.danger },
    budgetBarWrap: { paddingHorizontal: 22, paddingBottom: 6, gap: 3 },
    budgetBarTrack: { height: 4, borderRadius: 2, backgroundColor: colors.canvasAlt, overflow: 'hidden' },
    budgetBarFill: { height: '100%', borderRadius: 2 },
    budgetBarLabel: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textFaint },
    subaccountsList: { marginTop: 10, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6 },
    subaccountBox: { paddingVertical: 6 },
    subaccountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    subaccountName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, flex: 1 },
    subaccountAmount: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    expandContent: { marginTop: 6, paddingLeft: 10, paddingRight: 4 },
    txnsContainer: {
        backgroundColor: colors.canvasAlt, borderRadius: radius.md, padding: 10, marginTop: 8, gap: 6,
    },
    txnsHeader: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.8 },
    txnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    txnDesc: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    txnDate: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    txnAmount: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    noTxnsText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, fontStyle: 'italic' },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    errorCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.danger },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    sortBox: { width: '100%', maxWidth: 280, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 4 },
    sortTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginBottom: 8 },
    sortOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md },
    sortOptionSelected: { backgroundColor: colors.tabActiveBg },
    sortOptionText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    sortOptionTextSelected: { fontFamily: fonts.bodyBold, color: colors.blue },
    dateFilterBox: { width: '100%', maxWidth: 300, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 4 },
    dateFilterTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, marginBottom: 8 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 4 },
    dateInput: { fontFamily: fonts.body, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
    dateBtnRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
    resetBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center' },
    resetBtnText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    applyBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.blue, alignItems: 'center' },
    applyBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF' },
});
