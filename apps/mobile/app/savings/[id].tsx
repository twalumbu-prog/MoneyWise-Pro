import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, CreditCard, Share2, Gift, ArrowDownLeft, ArrowUpRight, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { savingsService, formatKwacha } from 'core';
import { SavingsBalanceCard, SavingsProgress, MemberAvatars } from '../../src/components/savings/SavingsUI';
import { AddMoneySheet, TransferOutSheet, shareInvite } from '../../src/components/savings/SavingsSheets';
import { PiggyBankIcon } from '../../src/components/icons/PiggyBankIcon';
import { colors, fonts, radius } from '../../src/theme/tokens';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/** One savings item: balance, progress, money in/out, members (groups) and its history. */
export default function SavingsDetailScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [addOpen, setAddOpen] = useState(false);
    const [transferOpen, setTransferOpen] = useState(false);

    const { data: item, isPending, error, refetch, isRefetching } = useQuery({
        queryKey: ['savings', id],
        queryFn: () => savingsService.get(String(id)),
    });

    const owner = item?.role === 'OWNER';
    const isGroup = item?.kind === 'GROUP';

    const close = () => {
        if (!item) return;
        Alert.alert('Close this savings?', item.balance > 0 ? 'Transfer the money out first.' : 'It will be removed from your savings. Its history stays in your books.', [
            { text: 'Cancel', style: 'cancel' },
            ...(item.balance > 0 ? [] : [{
                text: 'Close', style: 'destructive' as const,
                onPress: async () => {
                    try { await savingsService.archive(item.id); qc.invalidateQueries({ queryKey: ['savings'] }); router.back(); }
                    catch (e: any) { Alert.alert('Could not close', e?.message ?? 'Please try again.'); }
                },
            }]),
        ]);
    };

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40 }} accessibilityLabel="Go back"><ChevronLeft size={24} color="#000" /></Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>{item?.name ?? 'Savings'}</Text>
                <View style={{ width: 40 }} />
            </View>

            {isPending ? <ActivityIndicator color={colors.blue} style={{ marginTop: 60 }} />
                : error || !item ? <Text style={styles.muted}>{(error as Error)?.message || 'Not found'}</Text> : (
                <ScrollView
                    contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.blue} />}
                >
                    {item.kind === 'WISHLIST' && (
                        <View style={styles.hero}>
                            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.heroImg} resizeMode="contain" /> : <Gift size={48} color={colors.blue} />}
                        </View>
                    )}
                    <SavingsBalanceCard label={item.kind === 'WISHLIST' ? 'Saved for this' : item.kind === 'GROUP' ? 'Group balance' : 'Saved'} amount={item.balance} />

                    <View style={styles.card}>
                        {item.targetAmount ? <Text style={styles.target}>Target {formatKwacha(item.targetAmount)}</Text> : null}
                        <SavingsProgress balance={item.balance} target={item.targetAmount} />
                        {item.targetAmount && item.balance < item.targetAmount
                            ? <Text style={styles.left}>{formatKwacha(item.targetAmount - item.balance)} to go</Text>
                            : item.targetAmount ? <Text style={[styles.left, { color: colors.positiveInk }]}>Target reached 🎉</Text> : null}
                        <View style={styles.actions}>
                            <Btn icon={<Plus size={16} color="#FFFFFF" />} label="Add money" primary onPress={() => setAddOpen(true)} />
                            {owner && <Btn icon={<CreditCard size={15} color={colors.navy} />} label="Transfer" onPress={() => setTransferOpen(true)} />}
                            {owner && isGroup && <Btn icon={<Share2 size={15} color={colors.navy} />} label="Invite" onPress={() => shareInvite(item)} />}
                        </View>
                    </View>

                    {isGroup && (
                        <View style={styles.card}>
                            <View style={styles.rowBetween}>
                                <Text style={styles.cardTitle}>Members</Text>
                                <MemberAvatars count={item.members.length} />
                            </View>
                            {item.members.map((m, i) => (
                                <View key={m.userId} style={[styles.memberRow, i > 0 && styles.hair]}>
                                    <Text style={styles.memberName}>{m.name}</Text>
                                    {i === 0 && <Text style={styles.ownerTag}>Organiser</Text>}
                                </View>
                            ))}
                            {owner && !!item.inviteCode && (
                                <Pressable onPress={() => { Clipboard.setStringAsync(item.inviteCode!); Alert.alert('Copied', `Invite code ${item.inviteCode} copied.`); }} style={styles.codeBox}>
                                    <Text style={styles.codeLabel}>Invite code</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={styles.code}>{item.inviteCode}</Text>
                                        <Copy size={16} color={colors.blue} />
                                    </View>
                                </Pressable>
                            )}
                        </View>
                    )}

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{isGroup ? 'Contributions' : 'History'}</Text>
                        {(isGroup ? item.contributions.length === 0 : item.activity.length === 0) && (
                            <Text style={styles.emptyText}>Nothing yet. Tap Add money to start saving.</Text>
                        )}
                        {isGroup
                            ? item.contributions.map((c, i) => (
                                <View key={i} style={[styles.txRow, i > 0 && styles.hair]}>
                                    <View style={[styles.txIcon, { backgroundColor: '#ECFDF5' }]}><ArrowDownLeft size={16} color={colors.positiveInk} /></View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.txTitle}>{c.name}</Text>
                                        <Text style={styles.txMeta}>{fmtDate(c.date)} · {c.method === 'WALLET' ? 'Wallet' : 'Mobile money'}{c.status === 'PENDING' ? ' · pending' : ''}</Text>
                                    </View>
                                    <Text style={[styles.txAmt, { color: colors.positiveInk }]}>+{formatKwacha(c.amount)}</Text>
                                </View>
                            ))
                            : item.activity.map((a, i) => (
                                <View key={a.id} style={[styles.txRow, i > 0 && styles.hair]}>
                                    <View style={[styles.txIcon, { backgroundColor: a.direction === 'IN' ? '#ECFDF5' : '#FEF2F2' }]}>
                                        {a.direction === 'IN' ? <ArrowDownLeft size={16} color={colors.positiveInk} /> : <ArrowUpRight size={16} color={colors.danger} />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.txTitle} numberOfLines={1}>{a.direction === 'IN' ? 'Added' : 'Transferred out'}</Text>
                                        <Text style={styles.txMeta} numberOfLines={1}>{fmtDate(a.date)} · {a.description}</Text>
                                    </View>
                                    <Text style={[styles.txAmt, { color: a.direction === 'IN' ? colors.positiveInk : colors.text }]}>{a.direction === 'IN' ? '+' : '−'}{formatKwacha(a.amount)}</Text>
                                </View>
                            ))}
                    </View>

                    {owner && (
                        <Pressable onPress={close} style={styles.closeLink}>
                            <PiggyBankIcon size={16} color={colors.textMuted} />
                            <Text style={styles.closeText}>Close this savings</Text>
                        </Pressable>
                    )}
                </ScrollView>
            )}

            <AddMoneySheet visible={addOpen} item={item ?? null} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); refetch(); }} />
            <TransferOutSheet visible={transferOpen} item={item ?? null} onClose={() => setTransferOpen(false)} onDone={() => { setTransferOpen(false); refetch(); }} />
        </View>
    );
}

const Btn: React.FC<{ icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean }> = ({ icon, label, onPress, primary }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, primary ? styles.btnPrimary : styles.btnGhost, pressed && { opacity: 0.8 }]}>
        {icon}<Text style={[styles.btnText, primary && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    headerTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 18, color: '#000', textAlign: 'center' },
    muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 60 },
    hero: { height: 180, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    heroImg: { width: '80%', height: '85%' },
    card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.borderStrong, padding: 18, gap: 10 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    target: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    left: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: radius.pill },
    btnPrimary: { backgroundColor: colors.blue },
    btnGhost: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    memberName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    ownerTag: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue, backgroundColor: colors.tabActiveBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
    hair: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
    codeBox: { marginTop: 4, padding: 14, borderRadius: radius.md, backgroundColor: colors.tabActiveBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    codeLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.navy },
    code: { fontFamily: fonts.bodyBold, fontSize: 16, letterSpacing: 2, color: colors.blue },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    txIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    txTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    txMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    txAmt: { fontFamily: fonts.bodyBold, fontSize: 14 },
    closeLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    closeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
});
