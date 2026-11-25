import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Building2, HandCoins } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

interface Debt { id: string; side: 'OWE' | 'OWED'; type: 'PERSON' | 'COMPANY'; name: string; dueDate: string | null; balance: number; entries: number; overdue: boolean }
interface Overview { owe: Debt[]; owed: Debt[]; settled: Debt[]; totals: { owe: number; owed: number; net: number }; mirror: Debt[] }
type Filter = 'ALL' | 'OWE' | 'OWED' | 'SETTLED';

const when = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

const Row: React.FC<{ d: Debt; label?: string }> = ({ d, label }) => {
    const settled = d.balance <= 0.004;
    const tint = d.type === 'COMPANY' ? { bg: '#DBEAFE', fg: '#1D4ED8' } : d.side === 'OWE' ? { bg: '#FFE4E6', fg: '#BE123C' } : { bg: '#D1FAE5', fg: '#047857' };
    return (
        <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: tint.bg }]}>{d.type === 'COMPANY' ? <Building2 size={15} color={tint.fg} /> : <Text style={[styles.avatarText, { color: tint.fg }]}>{initials(d.name)}</Text>}</View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{label ?? d.name}</Text>
                <View style={styles.chips}>
                    <Text style={styles.rowSub}>{d.entries} transaction{d.entries === 1 ? '' : 's'}</Text>
                    {d.dueDate ? <Text style={[styles.chip, d.overdue ? styles.chipRed : styles.chipOrange]}>{d.overdue ? 'Overdue · ' : 'Due '}{when(d.dueDate)}</Text> : null}
                    <Text style={[styles.chip, settled ? styles.chipGrey : d.side === 'OWE' ? styles.chipRed : styles.chipGreen]}>{settled ? 'Settled' : d.side === 'OWE' ? 'You owe' : 'Owed to you'}</Text>
                </View>
            </View>
            <Text style={[styles.rowAmount, settled && { color: '#9CA3AF' }]}>{formatKwacha(d.balance)}</Text>
        </View>
    );
};

/** The headline net position on a blue card, with a bar comparing what you owe with what you're owed. */
const NetCard: React.FC<{ owe: number; owed: number; net: number }> = ({ owe, owed, net }) => {
    const total = owe + owed;
    const owePct = total > 0 ? Math.round((owe / total) * 100) : 0;
    const line = total === 0 ? 'No debts open' : net === 0 ? 'What you owe and are owed cancel out' : net > 0 ? 'You’re owed more than you owe' : 'You owe more than you’re owed';
    return (
        <View style={styles.net}>
            <Text style={styles.netLabel}>NET POSITION</Text>
            <Text style={styles.netValue}>{net < 0 ? '−' : ''}{formatKwacha(Math.abs(net))}</Text>
            <Text style={styles.netLine}>{line}</Text>
            <View style={styles.bar}>{total > 0 ? <><View style={{ width: `${owePct}%`, backgroundColor: '#FDA4AF' }} /><View style={{ width: `${100 - owePct}%`, backgroundColor: '#6EE7B7' }} /></> : null}</View>
            <View style={styles.barLabels}><Text style={styles.barLabel}>You owe</Text><Text style={styles.barLabel}>Owed to you</Text></View>
        </View>
    );
};

const Side: React.FC<{ tone: 'owe' | 'owed'; label: string; value: number; count: number }> = ({ tone, label, value, count }) => {
    const owe = tone === 'owe';
    return (
        <View style={styles.side}>
            <View style={styles.sideTop}>
                <Text style={styles.statLabel}>{label}</Text>
                <View style={[styles.statIcon, { backgroundColor: owe ? '#FFE4E6' : '#D1FAE5' }]}>{owe ? <ArrowUpRight size={14} color="#E11D48" /> : <ArrowDownLeft size={14} color="#059669" />}</View>
            </View>
            <Text style={[styles.statValue, value > 0 && { color: owe ? '#BE123C' : '#047857' }]}>{formatKwacha(value)}</Text>
            <Text style={styles.sideSub} numberOfLines={1}>{count === 0 ? (owe ? 'Nothing to pay back' : 'Nobody owes you') : `${owe ? 'to' : 'from'} ${count}`}</Text>
        </View>
    );
};

/**
 * Who you owe and who owes you, as a tab of Schedules on the phone: totals, filter pills and a row per person or company. Debts are made by tagging a
 * transaction (Loan received, Repayment made, Advance given, ...) from its detail screen. The web also lets you set due dates and untag.
 */
export const DebtsList: React.FC = () => {
    const q = useQuery({ queryKey: ['debts', 'overview'], retry: false, queryFn: () => apiJson<Overview>('/debts') });
    const [filter, setFilter] = useState<Filter>('ALL');
    const d = q.data;
    if (q.isPending) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.blue} />;
    if (q.isError || !d) return <Text style={styles.muted}>Couldn’t load your debts.</Text>;

    const nothing = d.owe.length + d.owed.length + d.settled.length + d.mirror.length === 0;
    const rows = filter === 'OWE' ? d.owe : filter === 'OWED' ? d.owed : filter === 'SETTLED' ? d.settled : [...d.owe, ...d.owed];
    const tabs: { key: Filter; label: string; n: number }[] = [{ key: 'ALL', label: 'All', n: d.owe.length + d.owed.length }, { key: 'OWE', label: 'You owe', n: d.owe.length }, { key: 'OWED', label: 'Owed to you', n: d.owed.length }, { key: 'SETTLED', label: 'Settled', n: d.settled.length }];

    return (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
            <NetCard owe={d.totals.owe} owed={d.totals.owed} net={d.totals.net} />
            <View style={styles.stats}>
                <Side tone="owe" label="You owe" value={d.totals.owe} count={d.owe.length} />
                <Side tone="owed" label="Owed to you" value={d.totals.owed} count={d.owed.length} />
            </View>
            {nothing ? (
                <View style={styles.empty}>
                    <View style={styles.emptyIcon}><HandCoins size={22} color={colors.blue} /></View>
                    <Text style={styles.emptyTitle}>No debts yet</Text>
                    <Text style={styles.muted}>Open a transaction, tap its category and choose a debt tag such as Loan received, Repayment made or Advance given. Say who it’s with and the balance builds up here.</Text>
                </View>
            ) : (
                <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
                        {tabs.map((t) => (
                            <Pressable key={t.key} onPress={() => setFilter(t.key)} style={[styles.pill, filter === t.key && styles.pillOn]}>
                                <Text style={[styles.pillText, filter === t.key && styles.pillTextOn]}>{t.label}{t.n > 0 ? `  ${t.n}` : ''}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                    {rows.length === 0 ? <Text style={styles.muted}>Nothing here.</Text> : <View style={styles.list}>{rows.map((x) => <Row key={x.id} d={x} />)}</View>}
                    {d.mirror.length > 0 && (
                        <>
                            <Text style={styles.heading}>With the people in this workspace</Text>
                            <View style={styles.list}>{d.mirror.map((x) => <Row key={x.id} d={x} label={`${x.side === 'OWE' ? 'We owe' : 'Owed to us by'} ${x.name}`} />)}</View>
                        </>
                    )}
                </>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    content: { padding: 16, paddingBottom: 80 },
    muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 },
    net: { backgroundColor: '#0B57D0', borderRadius: radius.lg, padding: 18, marginBottom: 10 },
    netLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.7)' },
    netValue: { fontFamily: fonts.bodyBold, fontSize: 30, color: '#fff', marginTop: 4 },
    netLine: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 14 },
    barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    barLabel: { fontFamily: fonts.bodyMedium, fontSize: 10, color: 'rgba(255,255,255,0.7)' },
    stats: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    side: { flex: 1, backgroundColor: '#F8FAFD', borderRadius: radius.md, padding: 14 },
    sideTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    sideSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    statIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#9CA3AF' },
    statValue: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text },
    pills: { gap: 6, paddingBottom: 10 },
    pill: { backgroundColor: '#F3F4F6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    pillOn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.borderStrong },
    pillText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    pillTextOn: { fontFamily: fonts.bodyBold, color: colors.text },
    list: { backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
    heading: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginTop: 18, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: fonts.bodyBold, fontSize: 12 },
    rowName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 },
    rowSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    chip: { fontFamily: fonts.bodyBold, fontSize: 10, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
    chipRed: { backgroundColor: '#FFE4E6', color: '#BE123C' },
    chipGreen: { backgroundColor: '#D1FAE5', color: '#047857' },
    chipOrange: { backgroundColor: '#FFEDD5', color: '#C2410C' },
    chipGrey: { backgroundColor: '#F3F4F6', color: '#6B7280' },
    rowAmount: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    empty: { alignItems: 'center', paddingVertical: 28 },
    emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
});
