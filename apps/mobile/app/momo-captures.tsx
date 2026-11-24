import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert, TextInput, ActivityIndicator, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ClipboardPaste, Scale, X } from 'lucide-react-native';
import { momoCaptureService, formatKwacha } from 'core';
import type { MomoBalanceCheck, MomoCapture, MomoCaptureStatus } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { MomoReviewModal } from '../src/components/momo/MomoReviewModal';
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
    const { paste: pasteParam, reviewId, queue: queueParam } = useLocalSearchParams<{ paste?: string; reviewId?: string; queue?: string }>();
    const [tab, setTab] = useState<MomoCaptureStatus>('PENDING');
    const [pasteOpen, setPasteOpen] = useState(pasteParam === '1');
    const [pasteText, setPasteText] = useState('');
    const [reviewing, setReviewing] = useState<MomoCapture | null>(null);

    const list = useQuery({ queryKey: [...MOMO_CAPTURES_KEY, tab], queryFn: () => momoCaptureService.list(tab) });
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: MOMO_CAPTURES_KEY });
        void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY });
    };

    // Tapping the "You got a new transaction" notification lands here with its id — open straight into the review
    // modal instead of making the person find it in the list themselves.
    const [consumedReviewId, setConsumedReviewId] = useState<string | null>(null);
    if (reviewId && reviewId !== consumedReviewId && list.data) {
        const match = list.data.find((c) => c.id === reviewId);
        if (match) { setReviewing(match); setConsumedReviewId(reviewId); }
    }

    // Quick confirm: the waiting captures one after another — pick a category, Next. A snapshot of the list when it
    // starts, so booking one (which refreshes the list) never shifts what comes next.
    const [queue, setQueue] = useState<{ items: MomoCapture[]; pos: number; booked: number; skipped: number } | null>(null);
    const startQueue = (items: MomoCapture[]) => {
        if (items.length === 0) { Alert.alert('All caught up', 'There are no transactions waiting to be confirmed.'); return; }
        setReviewing(null);
        setQueue({ items, pos: 0, booked: 0, skipped: 0 });
    };
    const advance = (booked: boolean) => {
        if (!queue) return;
        const next = { ...queue, pos: queue.pos + 1, booked: queue.booked + (booked ? 1 : 0), skipped: queue.skipped + (booked ? 0 : 1) };
        if (next.pos < next.items.length) { setQueue(next); return; }
        setQueue(null);
        Alert.alert(
            next.skipped === 0 ? 'All caught up 🎉' : 'Done for now',
            next.skipped === 0
                ? `${next.booked} transaction${next.booked === 1 ? '' : 's'} confirmed.`
                : `${next.booked} confirmed, ${next.skipped} skipped. Skipped ones stay in "To review".`,
        );
    };
    // Opened from the daily "N transactions to confirm" push (`?queue=1`): go straight into the queue.
    const [queueConsumed, setQueueConsumed] = useState(false);
    // Waits for a fresh fetch: a list cached from earlier may hold ones already confirmed elsewhere (the prompt's Record button).
    if (queueParam === '1' && !queueConsumed && tab === 'PENDING' && list.data && !list.isFetching) {
        setQueueConsumed(true);
        startQueue(list.data);
    }

    const checks = useQuery({ queryKey: [...MOMO_CAPTURES_KEY, 'balance-checks'], queryFn: () => momoCaptureService.balanceChecks(), enabled: tab === 'PENDING' });
    const balanceAct = useMutation({
        mutationFn: ({ id, action }: { id: string; action: 'adjust' | 'dismiss' }) => action === 'adjust' ? momoCaptureService.adjustBalance(id) : momoCaptureService.dismissBalanceCheck(id),
        onSuccess: (_d, v) => {
            refresh();
            if (v.action === 'adjust') { void qc.invalidateQueries({ queryKey: ['cashbook-entries'] }); void qc.invalidateQueries({ queryKey: ['external-balances'] }); }
        },
        onError: (e: Error) => { Alert.alert('Could not update', e.message); refresh(); },
    });

    const act = useMutation({
        mutationFn: ({ id, action, accountId, description }: { id: string; action: 'post' | 'dismiss'; accountId?: string | null; description?: string | null }) =>
            action === 'post' ? momoCaptureService.post(id, { accountId: accountId ?? undefined, description: description ?? undefined }) : momoCaptureService.dismiss(id),
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

            {tab === 'PENDING' && (list.data?.length ?? 0) >= 2 && (
                <Pressable onPress={() => startQueue(list.data ?? [])} style={({ pressed }) => [styles.confirmAll, pressed && { opacity: 0.85 }]}>
                    <Text style={styles.confirmAllText}>Confirm all {list.data!.length}</Text>
                    <Text style={styles.confirmAllSub}>One after another: tap a category, then Next</Text>
                </Pressable>
            )}

            <FlatList
                data={list.data ?? []}
                keyExtractor={(c) => c.id}
                contentContainerStyle={styles.list}
                ListHeaderComponent={tab === 'PENDING' && (checks.data?.length ?? 0) > 0 ? (
                    <View style={{ gap: 10 }}>
                        {checks.data!.map((b) => (
                            <BalanceCard key={b.id} b={b} busy={balanceAct.isPending && balanceAct.variables?.id === b.id}
                                onAdjust={() => balanceAct.mutate({ id: b.id, action: 'adjust' })}
                                onDismiss={() => balanceAct.mutate({ id: b.id, action: 'dismiss' })} />
                        ))}
                    </View>
                ) : null}
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
                                { text: 'Cancel', style: 'cancel' }, { text: 'Book anyway', style: 'destructive', onPress: () => setReviewing(item) },
                            ])
                            : setReviewing(item)) : undefined}
                        onDismiss={tab !== 'POSTED' ? () => act.mutate({ id: item.id, action: 'dismiss' }) : undefined}
                    />
                )}
            />

            {queue ? (
                <MomoReviewModal
                    capture={queue.items[queue.pos] ?? null}
                    busy={false}
                    queue={{ position: queue.pos + 1, total: queue.items.length }}
                    onClose={() => setQueue(null)}
                    onSkip={() => advance(false)}
                    // Booking runs in the background while the next one is already on screen; a failure shows an alert
                    // and the capture stays in "To review".
                    onConfirm={(choice) => { act.mutate({ id: queue.items[queue.pos].id, action: 'post', ...choice }); advance(true); }}
                />
            ) : (
                <MomoReviewModal
                    capture={reviewing}
                    busy={act.isPending && act.variables?.id === reviewing?.id}
                    onClose={() => setReviewing(null)}
                    onConfirm={(choice) => { if (reviewing) act.mutate({ id: reviewing.id, action: 'post', ...choice }); setReviewing(null); }}
                />
            )}
        </KeyboardAvoidingView>
    );
}

const BalanceCard: React.FC<{ b: MomoBalanceCheck; busy: boolean; onAdjust: () => void; onDismiss: () => void }> = ({ b, busy, onAdjust, onDismiss }) => {
    const diff = Number(b.difference ?? 0);
    const pending = Number(b.pending_net ?? 0);
    const when = new Date(b.observed_at);
    return (
        <View style={[styles.card, styles.balanceCard]}>
            <View style={styles.cardTop}>
                <View style={[styles.dirIcon, { backgroundColor: '#FFF7E6' }]}><Scale size={18} color={colors.warn} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cp}>{PROVIDER[b.provider]} balance differs by {formatKwacha(Math.abs(diff))}</Text>
                    <Text style={styles.meta}>Checked {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            </View>
            <Text style={styles.raw}>
                Your phone says {formatKwacha(Number(b.balance))}. MoneyWise has {formatKwacha(Number(b.ledger_balance ?? 0))}
                {pending !== 0 ? `, plus ${formatKwacha(Math.abs(pending))} ${pending > 0 ? 'received' : 'spent'} that is waiting below` : ''}.
                {diff > 0 ? ' A payment may be missing from MoneyWise.' : ' MoneyWise may have something the provider never charged.'}
                {' '}Review any waiting messages first. Adjusting books the {formatKwacha(Math.abs(diff))} difference as {diff > 0 ? 'money in' : 'money out'}.
            </Text>
            <View style={styles.actions}>
                {busy ? <ActivityIndicator color={colors.blue} /> : (
                    <>
                        <Pressable onPress={onDismiss} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}><Text style={styles.secondaryText}>Ignore</Text></Pressable>
                        <Pressable onPress={onAdjust} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}><Text style={styles.primaryText}>Adjust to match</Text></Pressable>
                    </>
                )}
            </View>
        </View>
    );
};

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
    confirmAll: { marginHorizontal: 20, marginTop: 4, marginBottom: 4, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.blue, gap: 2 },
    confirmAllText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    confirmAllSub: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
    empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
    balanceCard: { borderColor: colors.warn },
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
