import { useMemo, useState, useCallback } from 'react';
import {
    View, Text, SectionList, StyleSheet, ActivityIndicator,
    RefreshControl, TextInput, Pressable, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, ArrowUpDown, X, CalendarDays, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import {
    requisitionService, getStatusConfig, groupByDate, cashbookService, payrollService, isRequestorRole,
} from 'core';
import { RequisitionRow, type RequisitionRowData } from '../../src/components/requisitions/RequisitionRow';
import { InflowCard } from '../../src/components/inflows/InflowCard';
import { InflowDetailSheet } from '../../src/components/inflows/InflowDetailSheet';
import type { InflowRow } from '../../src/components/inflows/inflowUtils';
import { NewMenuSheet } from '../../src/components/requisitions/NewMenuSheet';
import { AnimatedSegmented, AnimatedTabContent } from '../../src/components/AnimatedTabs';
import { useAuth } from '../../src/context/AuthContext';
import { colors, fonts, radius } from '../../src/theme/tokens';

/** Status tabs, derived from core's config so they cannot drift from the web inbox. */
const TABS: { label: string; value: string }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Pending', value: 'PENDING_APPROVAL' },
    { label: 'Reviewed', value: 'REVIEWED' },
    { label: 'Disbursed', value: 'DISBURSED' },
    { label: 'Returned', value: 'CHANGE_SUBMITTED' },
    { label: 'Completed', value: 'COMPLETED' },
];

type InboxMode = 'outflows' | 'inflows';

export default function InboxScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user, userRole } = useAuth();
    const isRequestor = isRequestorRole(userRole);

    const [mode, setMode] = useState<InboxMode>('outflows');
    const [tab, setTab] = useState('ALL');
    const [search, setSearch] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [selectedInflow, setSelectedInflow] = useState<InflowRow | null>(null);
    const [newMenuOpen, setNewMenuOpen] = useState(false);

    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['requisitions'],
        queryFn: () => requisitionService.getAll(),
    });

    // Requestors see their own payslips as "inflows"; everyone else sees the
    // cash ledger's money-in entries — same split as web's RequisitionList.
    const {
        data: inflowsData, isLoading: inflowsLoading, isRefetching: inflowsRefetching, refetch: refetchInflows,
    } = useQuery({
        queryKey: ['inflows', isRequestor, user?.id],
        queryFn: async (): Promise<InflowRow[]> => {
            if (isRequestor && user?.id) {
                const allStaff = await payrollService.listStaff();
                const me = allStaff.find((s) => s.user_id === user.id);
                if (!me) return [];
                const history = await payrollService.getStaffPayrollHistory(me.id);
                return history.map((h) => ({
                    id: h.id,
                    description: `Payroll Notification - ${h.payroll_runs.period_label}`,
                    debit: h.net_pay,
                    status: 'COMPLETED',
                    date: h.payroll_runs.run_at || new Date().toISOString(),
                    created_at: h.payroll_runs.run_at || new Date().toISOString(),
                    reference_number: 'PAYROLL',
                    account_type: 'BANK',
                }));
            }
            return (await cashbookService.getEntries({ entryType: 'INFLOW', limit: 1000 })) || [];
        },
        // Fetched up front — same as web's RequisitionList — not gated on
        // `mode === 'inflows'`. Gating it on the active tab meant the query
        // was always cold the first time you switched to Inflows (nothing
        // to prefetch it while you were on Outflows), so every such switch
        // showed a live spinner instead of painting from cache. Fetching
        // eagerly here means it's already warm by the time you tap the tab.
        enabled: !!user,
    });

    const rows: RequisitionRowData[] = Array.isArray(data) ? data : [];
    const inflows: InflowRow[] = Array.isArray(inflowsData) ? inflowsData : [];

    const sections = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = rows.filter((r) => {
            if (tab !== 'ALL' && getStatusConfig(r.status).tab !== tab) return false;
            if (!q) return true;
            return (
                r.description?.toLowerCase().includes(q) ||
                r.requestor_name?.toLowerCase().includes(q) ||
                String(r.estimated_total).includes(q)
            );
        });
        return groupByDate(filtered, (r) => r.created_at, sortOrder).map((g) => ({
            title: g.dateLabel,
            data: g.items,
        }));
    }, [rows, tab, search, sortOrder]);

    const countFor = useCallback(
        (value: string) =>
            value === 'ALL'
                ? rows.length
                : rows.filter((r) => getStatusConfig(r.status).tab === value).length,
        [rows],
    );

    const inflowSections = useMemo(() => {
        const q = search.trim().toLowerCase();
        // Only settled money — PENDING intents never completed, and AR trackers
        // belong to an Invoices view this app doesn't have yet.
        const filtered = inflows.filter((row) => {
            if (row.status === 'PENDING' || row.account_type === 'ACCOUNTS_RECEIVABLE') return false;
            if (!q) return true;
            return (
                row.description?.toLowerCase().includes(q) ||
                (row.reference_number || '').toLowerCase().includes(q)
            );
        });
        return groupByDate(filtered, (r) => r.date || r.created_at || new Date().toISOString(), sortOrder).map((g) => ({
            title: g.dateLabel,
            data: g.items,
        }));
    }, [inflows, search, sortOrder]);

    const open = (id: string) => router.push(`/requisition/${id}`);

    return (
        <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
            <View style={styles.header}>
                <Text style={styles.title}>Inbox</Text>
                <View style={styles.headerActions}>
                    <Pressable
                        style={styles.iconBtn}
                        onPress={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
                        accessibilityLabel={sortOrder === 'desc' ? 'Sort oldest first' : 'Sort newest first'}
                    >
                        <ArrowUpDown size={18} color={colors.textMuted} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => router.push('/schedules')} accessibilityLabel="Schedules">
                        <CalendarDays size={18} color={colors.textMuted} />
                    </Pressable>
                </View>
            </View>

            <AnimatedSegmented
                value={mode}
                onChange={(v) => setMode(v as 'outflows' | 'inflows')}
                trackStyle={styles.modeRow}
                indicatorStyle={styles.modeIndicator}
                itemStyle={styles.modeBtn}
                items={[
                    {
                        value: 'outflows',
                        content: (
                            <>
                                <ArrowUpRight size={14} color={mode === 'outflows' ? colors.blue : colors.textFaint} />
                                <Text style={[styles.modeBtnText, mode === 'outflows' && styles.modeBtnTextActive]}>Outflows</Text>
                            </>
                        ),
                    },
                    {
                        value: 'inflows',
                        content: (
                            <>
                                <ArrowDownLeft size={14} color={mode === 'inflows' ? colors.blue : colors.textFaint} />
                                <Text style={[styles.modeBtnText, mode === 'inflows' && styles.modeBtnTextActive]}>Inflows</Text>
                            </>
                        ),
                    },
                ]}
            />

            <View style={styles.searchWrap}>
                <Search size={16} color={colors.textFaint} />
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder={mode === 'inflows' ? 'Search inflows' : 'Search requests'}
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="search"
                    autoCorrect={false}
                />
                {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search" hitSlop={8}>
                        <X size={15} color={colors.textFaint} />
                    </Pressable>
                )}
            </View>

            {mode === 'outflows' && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tabsScroll}
                    contentContainerStyle={styles.tabs}
                >
                    {TABS.map((t) => {
                        const active = tab === t.value;
                        const n = countFor(t.value);
                        return (
                            <Pressable
                                key={t.value}
                                onPress={() => setTab(t.value)}
                                style={[styles.tab, active && styles.tabActive]}
                            >
                                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                                    {t.label}{n > 0 ? ` ${n}` : ''}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            )}

            {(mode === 'outflows' ? isLoading : inflowsLoading) && (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            )}

            {mode === 'outflows' && isError && !isLoading && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Couldn’t load requests</Text>
                    <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                    <Text style={styles.errorHint}>Pull down to try again.</Text>
                </View>
            )}

            <AnimatedTabContent tabKey={mode} index={mode === 'inflows' ? 1 : 0} style={{ flex: 1 }}>
            {mode === 'inflows' ? (
                <SectionList
                    sections={inflowSections}
                    keyExtractor={(item) => String(item.id)}
                    stickySectionHeadersEnabled={false}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={inflowsRefetching} onRefresh={() => { void refetchInflows(); }} tintColor={colors.blue} />
                    }
                    renderSectionHeader={({ section }) => <Text style={styles.dateLabel}>{section.title}</Text>}
                    renderItem={({ item, index, section }) => (
                        <View style={[styles.card, index === 0 && styles.cardFirst, index === section.data.length - 1 && styles.cardLast]}>
                            <InflowCard row={item} onPress={() => setSelectedInflow(item)} />
                            {index < section.data.length - 1 && <View style={styles.rowGap} />}
                        </View>
                    )}
                    ListEmptyComponent={
                        !inflowsLoading ? (
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>{search ? 'Nothing matches that filter.' : 'No inflows yet.'}</Text>
                                {!search && <Text style={styles.emptySub}>Money-in from sales, deposits and payments will show up here.</Text>}
                            </View>
                        ) : undefined
                    }
                />
            ) : (
            <SectionList
                sections={sections}
                keyExtractor={(item) => String(item.id)}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={() => { void refetch(); }}
                        tintColor={colors.blue}
                    />
                }
                renderSectionHeader={({ section }) => (
                    <Text style={styles.dateLabel}>{section.title}</Text>
                )}
                // Each day renders as one card; rows are separated inside it, so the
                // card chrome is drawn by the section footer wrapper below.
                renderItem={({ item, index, section }) => (
                    <View
                        style={[
                            styles.card,
                            index === 0 && styles.cardFirst,
                            index === section.data.length - 1 && styles.cardLast,
                        ]}
                    >
                        <RequisitionRow req={item} onPress={() => open(item.id)} />
                        {index < section.data.length - 1 && <View style={styles.rowGap} />}
                    </View>
                )}
                ListEmptyComponent={
                    !isLoading && !isError ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>
                                {search || tab !== 'ALL' ? 'Nothing matches that filter.' : 'No requests yet.'}
                            </Text>
                        </View>
                    ) : undefined
                }
            />
            )}
            </AnimatedTabContent>

            <Pressable
                    style={[styles.fab, { bottom: 16 }]}
                    onPress={() => setNewMenuOpen(true)}
                    accessibilityLabel="New"
                >
                    <Plus size={24} color="#FFFFFF" />
            </Pressable>

            <InflowDetailSheet inflow={selectedInflow} onClose={() => setSelectedInflow(null)} />

            <NewMenuSheet
                visible={newMenuOpen}
                onClose={() => setNewMenuOpen(false)}
                mode={mode}
                userRole={userRole}
                onNewSale={() => {
                    setNewMenuOpen(false);
                    Alert.alert('New Sale', 'Recording sales from the app is coming in a later update — use the web app for now.');
                }}
                onNewRequisition={() => { setNewMenuOpen(false); router.push('/requisition/new'); }}
                onSalaryAdvance={() => { setNewMenuOpen(false); router.push('/requisition/new-advance'); }}
                onStaffLoan={() => { setNewMenuOpen(false); router.push('/requisition/new-loan'); }}
                onInvest={() => { setNewMenuOpen(false); router.push('/requisition/new-invest'); }}
                onPayroll={() => { setNewMenuOpen(false); router.push('/apps/payroll/run'); }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, marginBottom: 12,
    },
    title: { fontFamily: fonts.display, fontSize: 30, color: '#000000' },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: colors.surface, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, padding: 0 },
    tabsScroll: { flexGrow: 0, height: 52, marginTop: 12 },
    tabs: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
    tab: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.chipActiveBg, borderColor: colors.chipActiveBg },
    tabText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    tabTextActive: { color: colors.text },
    centre: { paddingVertical: 48, alignItems: 'center' },
    list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },
    dateLabel: {
        fontFamily: fonts.bodyBold, fontSize: 12, color: '#000000',
        paddingHorizontal: 10, marginTop: 12, marginBottom: 8,
    },
    card: {
        backgroundColor: colors.surface, paddingHorizontal: 20,
        borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.borderStrong,
    },
    cardFirst: {
        borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20,
    },
    cardLast: {
        borderBottomWidth: 1, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingBottom: 20,
    },
    rowGap: { height: 28 },
    empty: { paddingVertical: 64, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 6, textAlign: 'center', paddingHorizontal: 30 },
    modeRow: {
        flexDirection: 'row', gap: 4, marginHorizontal: 20, marginBottom: 12, padding: 4,
        backgroundColor: colors.chipActiveBg, borderRadius: radius.pill,
    },
    modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: radius.pill },
    modeIndicator: {
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    modeBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textFaint },
    modeBtnTextActive: { fontFamily: fonts.bodyBold, color: colors.text },
    errorCard: {
        marginHorizontal: 20, marginTop: 12, backgroundColor: colors.surface,
        borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.danger,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
    errorHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 8 },
    fab: {
        position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
        backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
});
