import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, RefreshCw } from 'lucide-react-native';
import { lipilaService, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

const SOURCE: Record<string, string> = { payment_link: 'Payment link', quick_link: 'Quick pay', store: 'Store', deposit: 'Deposit' };

const chip = (p: { status: string; problem?: string | null }) => {
    if (p.status === 'SUCCESSFUL') return { label: 'Paid', bg: '#E6F4EA', fg: '#137333' };
    if (p.status === 'FAILED') return { label: 'Declined', bg: '#FCE8E6', fg: '#B31412' };
    if (p.problem) return { label: 'Paid, being recorded', bg: '#FEF7E0', fg: '#B06000' };
    return { label: 'Waiting', bg: '#F1F3F4', fg: '#5F6368' };
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Open or closed is kept while the app is running, so it doesn't snap shut when you come back to the wallet.
let remembered = false;

/** Under the Card Wallet card, as a drop-down: closed it is one line with Lipila's live balance; open it shows what MoneyWise has recorded and every card payment. */
export function CardWalletPanel({ organizationId }: { organizationId: string | null | undefined }) {
    const [open, setOpenState] = useState(remembered);
    const setOpen = (v: boolean) => { remembered = v; setOpenState(v); };
    const wallet = useQuery({ queryKey: ['lipila', 'wallet', organizationId], queryFn: () => lipilaService.wallet(), enabled: !!organizationId, staleTime: 30_000 });
    const pays = useQuery({ queryKey: ['lipila', 'card-payments', organizationId], queryFn: () => lipilaService.cardPayments(30), enabled: !!organizationId, staleTime: 30_000 });
    const w = wallet.data;
    const rows = pays.data?.payments ?? [];
    const busy = wallet.isFetching || pays.isFetching;

    return (
        <View style={styles.root}>
            <View style={styles.head}>
                <Pressable style={styles.toggle} onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>Card Wallet</Text>
                        <Text style={styles.sub}>Where card payments go{w?.env ? ` · ${w.env === 'production' ? 'live' : 'testing'}` : ''}</Text>
                    </View>
                    {!open ? <View style={styles.balChip}><Text style={styles.balChipText}>{wallet.isLoading ? '…' : w?.balance != null ? formatKwacha(w.balance) : '—'}</Text></View> : null}
                    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><ChevronDown size={18} color={colors.textMuted} /></View>
                </Pressable>
                <Pressable style={styles.refresh} onPress={() => { void wallet.refetch(); void pays.refetch(); }} disabled={busy} accessibilityLabel="Refresh">
                    {busy ? <ActivityIndicator size="small" color={colors.blue} /> : <RefreshCw size={15} color={colors.blue} />}
                </Pressable>
            </View>

            {open ? <>
            <View style={styles.stats}>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>BALANCE IN LIPILA</Text>
                    <Text style={styles.statValue}>{wallet.isLoading ? '…' : w?.balance != null ? formatKwacha(w.balance) : '—'}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>BOOKED</Text>
                    <Text style={styles.statValue}>{w?.booked != null ? formatKwacha(w.booked) : '—'}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>RECORDED HERE</Text>
                    <Text style={styles.statValue}>{w ? formatKwacha(w.recordedSales) : '…'}</Text>
                </View>
            </View>

            {w?.error ? (
                <View style={styles.warn}><AlertCircle size={14} color="#B06000" /><Text style={styles.warnText}>{w.error}</Text></View>
            ) : null}

            <Text style={styles.listTitle}>CARD PAYMENTS</Text>
            {pays.isLoading ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 12 }} /> : rows.length === 0 ? (
                <Text style={styles.empty}>No card payments yet.</Text>
            ) : rows.map((p) => {
                const c = chip(p);
                return (
                    <View key={p.reference} style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rowName} numberOfLines={1}>{p.customer || (p.source ? SOURCE[p.source] ?? p.source : 'Card payment')}</Text>
                            <Text style={styles.rowSub} numberOfLines={1}>{when(p.startedAt)}{p.source ? ` · ${SOURCE[p.source] ?? p.source}` : ''}{p.reason ? ` · ${p.reason}` : ''}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Text style={styles.rowAmount}>{formatKwacha(p.net)}</Text>
                            <View style={[styles.chip, { backgroundColor: c.bg }]}><Text style={[styles.chipText, { color: c.fg }]}>{c.label}</Text></View>
                        </View>
                    </View>
                );
            })}
            </> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { marginTop: 14, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    toggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    balChip: { backgroundColor: '#F8FAFD', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    balChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 1 },
    refresh: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
    stat: { flex: 1, backgroundColor: '#F8FAFD', borderRadius: 12, padding: 10 },
    statLabel: { fontFamily: fonts.bodyBold, fontSize: 8.5, color: colors.textMuted, letterSpacing: 0.5 },
    statValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginTop: 4 },
    warn: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FEF7E0', borderRadius: 10, padding: 10, marginTop: 10 },
    warnText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: '#7A4B00', lineHeight: 15 },
    listTitle: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.6, marginTop: 16, marginBottom: 6 },
    empty: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, paddingVertical: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F3F4' },
    rowName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    rowSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    rowAmount: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    chipText: { fontFamily: fonts.bodyBold, fontSize: 10 },
});
