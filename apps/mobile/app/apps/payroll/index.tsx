import { useMemo, useState } from 'react';
import {
    View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Settings, Search, ArrowUpDown, UserPlus, FileSpreadsheet } from 'lucide-react-native';
import { payrollService, formatKwacha } from 'core';
import type { PayrollRun, StaffMember } from 'core';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../src/theme/tokens';

const RUN_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
    DRAFT: { label: 'Draft', bg: colors.canvasAlt, fg: colors.textMuted },
    PENDING_APPROVAL: { label: 'Pending', bg: '#FEF9C3', fg: '#854D0E' },
    APPROVED: { label: 'Approved', bg: colors.tabActiveBg, fg: colors.blue },
    CLEARED: { label: 'Cleared', bg: '#E4FAF1', fg: colors.positiveInk },
};
const STAFF_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
    ACTIVE: { label: 'Active', bg: '#E4FAF1', fg: colors.positiveInk },
    INACTIVE: { label: 'Inactive', bg: '#FEF9C3', fg: '#854D0E' },
    TERMINATED: { label: 'Terminated', bg: '#FFEBF1', fg: colors.danger },
};

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type MainTab = 'history' | 'staff';

/** Payroll home: run history and staff roster, matching apps/web/src/pages/Payroll.tsx. */
export default function PayrollHomeScreen() {
    const router = useRouter();
    const [tab, setTab] = useState<MainTab>('history');
    const [search, setSearch] = useState('');
    const [sortDesc, setSortDesc] = useState(true);
    const [addMenuOpen, setAddMenuOpen] = useState(false);

    const { data: runs, isLoading: runsLoading } = useQuery({
        queryKey: ['payroll-runs'],
        queryFn: () => payrollService.listRuns(),
    });
    const { data: staff, isLoading: staffLoading } = useQuery({
        queryKey: ['payroll-staff'],
        queryFn: () => payrollService.listStaff(),
    });

    const filteredRuns = useMemo(() => {
        const rows: PayrollRun[] = runs ?? [];
        const q = search.trim().toLowerCase();
        const filtered = q ? rows.filter((r) => r.period_label.toLowerCase().includes(q)) : rows;
        return [...filtered].sort((a, b) =>
            sortDesc ? b.period_year - a.period_year || b.period_month - a.period_month
                     : a.period_year - b.period_year || a.period_month - b.period_month);
    }, [runs, search, sortDesc]);

    const filteredStaff = useMemo(() => {
        const rows: StaffMember[] = staff ?? [];
        const q = search.trim().toLowerCase();
        const filtered = q ? rows.filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)) : rows;
        return [...filtered].sort((a, b) => {
            const an = `${a.first_name} ${a.last_name}`, bn = `${b.first_name} ${b.last_name}`;
            return sortDesc ? bn.localeCompare(an) : an.localeCompare(bn);
        });
    }, [staff, search, sortDesc]);

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Payroll" right={
                <Pressable onPress={() => router.push('/apps/payroll/config')} hitSlop={8} accessibilityLabel="Payroll settings">
                    <Settings size={20} color={colors.textMuted} />
                </Pressable>
            } />

            <View style={styles.segment}>
                {(['history', 'staff'] as MainTab[]).map((t) => (
                    <Pressable key={t} onPress={() => { setTab(t); setSearch(''); }} style={[styles.segmentBtn, tab === t && styles.segmentBtnActive]}>
                        <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
                            {t === 'history' ? 'Payroll History' : 'Staff'}
                        </Text>
                    </Pressable>
                ))}
            </View>

            <View style={styles.toolbar}>
                <View style={styles.searchWrap}>
                    <Search size={15} color={colors.textFaint} />
                    <TextInput
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder={tab === 'history' ? 'Search periods' : 'Search staff'}
                        placeholderTextColor={colors.textFaint}
                    />
                </View>
                <Pressable style={styles.sortBtn} onPress={() => setSortDesc((d) => !d)} accessibilityLabel="Toggle sort order">
                    <ArrowUpDown size={16} color={sortDesc ? colors.textMuted : colors.blue} />
                </Pressable>
            </View>

            {tab === 'history' ? (
                runsLoading ? (
                    <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : (
                    <FlatList
                        data={filteredRuns}
                        keyExtractor={(r) => r.id}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => {
                            const s = RUN_STATUS[item.status] ?? RUN_STATUS.DRAFT;
                            return (
                                <Pressable style={styles.row} onPress={() => router.push(`/apps/payroll/run/${item.id}`)}>
                                    <View style={styles.rowMain}>
                                        <Text style={styles.rowTitle}>{item.period_label || `${MONTHS[item.period_month]} ${item.period_year}`}</Text>
                                        <Text style={styles.rowSub}>{item.employee_count} employees · {formatKwacha(item.net_total)} net</Text>
                                    </View>
                                    <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                                        <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
                                    </View>
                                </Pressable>
                            );
                        }}
                        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No payroll runs yet.</Text></View>}
                    />
                )
            ) : (
                staffLoading ? (
                    <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : (
                    <FlatList
                        data={filteredStaff}
                        keyExtractor={(s) => s.id}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => {
                            const s = STAFF_STATUS[item.status] ?? STAFF_STATUS.ACTIVE;
                            return (
                                <Pressable style={styles.row} onPress={() => router.push(`/apps/payroll/staff/${item.id}`)}>
                                    <View style={styles.rowMain}>
                                        <Text style={styles.rowTitle}>{item.first_name} {item.last_name}</Text>
                                        <Text style={styles.rowSub}>{item.position || item.department || item.employee_number}</Text>
                                    </View>
                                    <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                                        <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
                                    </View>
                                </Pressable>
                            );
                        }}
                        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No staff added yet.</Text></View>}
                    />
                )
            )}

            {tab === 'history' ? (
                <Pressable style={styles.fab} onPress={() => router.push('/apps/payroll/run')} accessibilityLabel="Run payroll">
                    <Plus size={22} color="#FFFFFF" />
                </Pressable>
            ) : (
                <Pressable style={styles.fab} onPress={() => setAddMenuOpen(true)} accessibilityLabel="Add staff">
                    <Plus size={22} color="#FFFFFF" />
                </Pressable>
            )}

            <Modal visible={addMenuOpen} transparent animationType="fade" onRequestClose={() => setAddMenuOpen(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setAddMenuOpen(false)}>
                    <View style={styles.addSheet}>
                        <Pressable
                            style={styles.addOption}
                            onPress={() => { setAddMenuOpen(false); router.push('/apps/payroll/staff/new'); }}
                        >
                            <View style={styles.addOptionIcon}><UserPlus size={16} color={colors.blue} /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.addOptionTitle}>Add manually</Text>
                                <Text style={styles.addOptionSub}>Enter one employee's details</Text>
                            </View>
                        </Pressable>
                        <Pressable
                            style={styles.addOption}
                            onPress={() => { setAddMenuOpen(false); router.push('/apps/payroll/staff/import'); }}
                        >
                            <View style={styles.addOptionIcon}><FileSpreadsheet size={16} color={colors.blue} /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.addOptionTitle}>Import from CSV</Text>
                                <Text style={styles.addOptionSub}>Bulk-add your whole roster at once</Text>
                            </View>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    segment: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 10, padding: 4,
        backgroundColor: colors.canvasAlt, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textFaint },
    segmentTextActive: { color: colors.navy },
    toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
    searchWrap: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    sortBtn: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    centre: { paddingVertical: 48, alignItems: 'center' },
    list: { paddingHorizontal: 20, paddingBottom: 100, gap: 8 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    rowMain: { flex: 1 },
    rowTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
    statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
    statusText: { fontFamily: fonts.bodyBold, fontSize: 10 },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    fab: {
        position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28,
        backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
    addSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32, gap: 4 },
    addOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md },
    addOptionIcon: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center',
    },
    addOptionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    addOptionSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 1 },
});
