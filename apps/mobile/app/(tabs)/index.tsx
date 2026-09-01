import { useMemo, useState, useCallback } from 'react';
import {
    View, Text, SectionList, StyleSheet, ActivityIndicator,
    RefreshControl, TextInput, Pressable, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, ArrowUpDown, X, CalendarDays } from 'lucide-react-native';
import { requisitionService, getStatusConfig, groupByDate } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { RequisitionRow, type RequisitionRowData } from '../../src/components/requisitions/RequisitionRow';
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

export default function InboxScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { userRole } = useAuth();

    const [tab, setTab] = useState('ALL');
    const [search, setSearch] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['requisitions'],
        queryFn: () => requisitionService.getAll(),
    });

    const rows: RequisitionRowData[] = Array.isArray(data) ? data : [];

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

            <View style={styles.searchWrap}>
                <Search size={16} color={colors.textFaint} />
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search requests"
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

            {isLoading && (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            )}

            {isError && !isLoading && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Couldn’t load requests</Text>
                    <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                    <Text style={styles.errorHint}>Pull down to try again.</Text>
                </View>
            )}

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

            {userRole !== 'ACCOUNTANT' && (
                <Pressable
                    style={[styles.fab, { bottom: 16 }]}
                    onPress={() => router.push('/requisition/new')}
                    accessibilityLabel="New request"
                >
                    <Plus size={24} color="#FFFFFF" />
                </Pressable>
            )}
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
    tabsScroll: { flexGrow: 0, marginTop: 12 },
    tabs: { paddingHorizontal: 20, gap: 8 },
    tab: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.tabActiveBg, borderColor: 'rgba(0,106,255,0.2)' },
    tabText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    tabTextActive: { color: colors.blue },
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
