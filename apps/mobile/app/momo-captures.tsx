import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert, TextInput, ActivityIndicator, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ClipboardPaste, X } from 'lucide-react-native';
import { momoCaptureService, formatKwacha } from 'core';
import type { MomoCapture, MomoCaptureStatus } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, fonts, radius } from '../src/theme/tokens';
import { MOMO_CAPTURES_KEY, MOMO_SETTINGS_KEY } from '../src/lib/momoCapture';

const TABS: { id: MomoCaptureStatus; label: string }[] = [
    { id: 'PENDING', label: 'To review' },
    { id: 'POSTED', label: 'Booked' },
    { id: 'MATCHED', label: 'Already in MoneyWise' },
];
const PROVIDER: Record<MomoCapture['provider'], string> = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', ZAMTEL: 'Zamtel Kwacha', OTHER: 'Mobile money' };

/**
 * Review captured: mobile money messages the phone picked up, waiting to be booked (or already booked / matched to a
 * Lenco wallet transaction). Confirming books it as an external-account entry, categorised the same way as a manual
 * entry; dismissing drops it without touching the ledger.
 */
export default function MomoCapturesScreen() {
    const qc = useQueryClient();
    const { paste: pasteParam } = useLocalSearchParams<{ paste?: string }>();
    const [tab, setTab] = useState<MomoCaptureStatus>('PENDING');
    const [pasteOpen, setPasteOpen] = useState(pasteParam === '1');
    const [pasteText, setPasteText] = useState('');

    const list = useQuery({ queryKey: [...MOMO_CAPTURES_KEY, tab], queryFn: () => momoCaptureService.list(tab) });
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: MOMO_CAPTURES_KEY });
        void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY });
    };

    const act = useMutation({
        mutationFn: ({ id, action }: { id: string; action: 'post' | 'dismiss' }) => action === 'post' ? momoCaptureService.post(id) : momoCaptureService.dismiss(id),
        onSuccess: (_d, v) => {
            refresh();
            if (v.action === 'post') void qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
        },
        onError: (e: Error) => { Alert.alert('Could not update', e.message); refresh(); },
    });

    const paste = useMutation({
        mutationFn: () => momoCaptureService.paste(pasteText),
        onSuccess: (r) => {
            if (!r.accepted) { Alert.alert('Not a transaction', 'That doesn’t look like a mobile money confirmation. Copy the whole SMS, including the amount.'); return; }
            if (r.duplicate) Alert.alert('Already captured', 'This message was captured before.');
            setPasteText(''); setPasteOpen(false); setTab(r.capture?.status === 'POSTED' ? 'POSTED' : r.capture?.status === 'MATCHED' ? 'MATCHED' : 'PENDING');
            refresh();
        },
        onError: (e: Error) => Alert.alert('Could not add', e.message),
    });

    return (
        <KeyboardAvoidingView style={styles.root} behavior="padding">
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader
                title="Captured transactions"
                right={<Pressable hitSlop={10} onPress={() => setPasteOpen((v) => !v)}>{pasteOpen ? <X size={20} color={colors.text} /> : <ClipboardPaste size={20} color={colors.blue} />}</Pressable>}
            />

            {pasteOpen && (
                <View style={styles.pasteCard}>
                    <Text style={styles.pasteLabel}>Paste a mobile money SMS</Text>
                    <TextInput
                        style={styles.pasteInput} value={pasteText} onChangeText={setPasteText} multiline autoFocus
                        placeholder="You have received ZMW 250.00 from…" placeholderTextColor={colors.textFaint}
                    />
                    <Pressable disabled={pasteText.trim().length < 12 || paste.isPending} onPress={() => paste.mutate()}
                        style={({ pressed }) => [styles.pasteBtn, (pasteText.trim().length < 12 || paste.isPending) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
                        {paste.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.pasteBtnText}>Add</Text>}
                    </Pressable>
                </View>
            )}

            <View style={styles.tabs}>
                {TABS.map((t) => (
                    <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
                        <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
                    </Pressable>
                ))}
            </View>

            <FlatList
                data={list.data ?? []}
                keyExtractor={(c) => c.id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />}
                ListEmptyComponent={list.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.blue} /> : (
                    <Text style={styles.empty}>
                        {tab === 'PENDING' ? 'Nothing to review. New mobile money messages appear here.' : tab === 'POSTED' ? 'Nothing booked from messages yet.' : 'No messages matched wallet transactions yet.'}
                    </Text>
                )}
                renderItem={({ item }) => (
                    <CaptureCard
                        c={item}
                        busy={act.isPending && act.variables?.id === item.id}
                        onPost={tab !== 'POSTED' ? () => (item.status === 'MATCHED'
                            ? Alert.alert('Book anyway?', 'This looks like a payment already in MoneyWise through your wallet. Booking it again would count it twice.', [
                                { text: 'Cancel', style: 'cancel' }, { text: 'Book anyway', style: 'destructive', onPress: () => act.mutate({ id: item.id, action: 'post' }) },
                            ])
                            : act.mutate({ id: item.id, action: 'post' })) : undefined}
                        onDismiss={tab !== 'POSTED' ? () => act.mutate({ id: item.id, action: 'dismiss' }) : undefined}
                    />
                )}
            />
        </KeyboardAvoidingView>
    );
}

const CaptureCard: React.FC<{ c: MomoCapture; busy: boolean; onPost?: () => void; onDismiss?: () => void }> = ({ c, busy, onPost, onDismiss }) => {
    const [open, setOpen] = useState(false);
    const isIn = c.direction === 'IN';
    const when = new Date(c.occurred_at);
    return (
        <View style={styles.card}>
            <Pressable onPress={() => setOpen((v) => !v)} style={styles.cardTop}>
                <View style={[styles.dirIcon, { backgroundColor: isIn ? '#E7FBF2' : '#FEF2F2' }]}>
                    {isIn ? <ArrowDownLeft size={18} color={colors.positiveInk} /> : <ArrowUpRight size={18} color={colors.danger} />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cp} numberOfLines={1}>{c.counterparty || (isIn ? 'Money received' : 'Money sent')}</Text>
                    <Text style={styles.meta}>{PROVIDER[c.provider]} · {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.amount, { color: isIn ? colors.positiveInk : colors.text }]}>{isIn ? '+' : '−'}{formatKwacha(Number(c.amount))}</Text>
                    {!!c.fee && <Text style={styles.meta}>fee {formatKwacha(Number(c.fee))}</Text>}
                </View>
            </Pressable>
            {open && <Text style={styles.raw}>{c.raw_text}</Text>}
            {(onPost || onDismiss) && (
                <View style={styles.actions}>
                    {busy ? <ActivityIndicator color={colors.blue} /> : (
                        <>
                            {onDismiss && <Pressable onPress={onDismiss} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}><Text style={styles.secondaryText}>Dismiss</Text></Pressable>}
                            {onPost && <Pressable onPress={onPost} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}><Text style={styles.primaryText}>{c.status === 'MATCHED' ? 'Book anyway' : 'Book it'}</Text></Pressable>}
                        </>
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
    tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
    tabOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    tabText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    tabTextOn: { color: '#FFFFFF' },
    list: { padding: 20, paddingTop: 8, gap: 10, paddingBottom: 48 },
    empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dirIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    cp: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
    amount: { fontFamily: fonts.bodyBold, fontSize: 15 },
    raw: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, backgroundColor: colors.canvas, borderRadius: radius.sm, padding: 10 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    secondary: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    secondaryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    primary: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.blue },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    pasteCard: { marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
    pasteLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    pasteInput: { minHeight: 90, fontFamily: fonts.body, fontSize: 14, color: colors.text, backgroundColor: colors.canvas, borderRadius: radius.sm, padding: 10, textAlignVertical: 'top' },
    pasteBtn: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.blue, minWidth: 72, alignItems: 'center' },
    pasteBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});
