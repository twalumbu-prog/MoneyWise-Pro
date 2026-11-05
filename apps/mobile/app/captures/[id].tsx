import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Linking } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react-native';
import { captureService, formatKwacha } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';
import { useAuth } from '../../src/context/AuthContext';

const CAPTURES_KEY = ['captures'];

const FLAG_TEXT: Record<string, string> = {
    INJECTION_SUSPECTED: 'This evidence contains text that looks like instructions. Check it carefully.',
    NO_AMOUNT: 'No amount could be read. Enter it from the evidence.',
    UNCONVERTED_CURRENCY: 'This is not in Kwacha. Enter the Kwacha amount.',
    AI_BUDGET_EXCEEDED: "Today's reading limit was reached, so nothing was filled in.",
    AI_UNAVAILABLE: 'The receipt could not be read automatically.',
    MATCH_CONFLICT: 'The matching wallet entry is already linked to another capture.',
    POSSIBLE_LENCO_DUPLICATE: 'This same amount has since arrived in your MoneyWise wallet. If it is the same money, undo this entry.',
    AMOUNT_NOT_IN_TEXT: 'This amount does not appear in the chat. Check it before approving.',
    EXTRACTION_INVALID: 'The message could not be read automatically.',
    INVOICE_NOT_APPLIED: 'This was booked, but could not be applied to the open invoice. Apply it from the ledger.',
};

type Form = { amount: string; occurred_on: string; direction: 'IN' | 'OUT'; wallet_id: string; account_id: string; description: string };

/** Review one captured transaction: evidence first, then the draft, then the decision. */
export default function CaptureReviewScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const canReview = ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(userRole || '');

    const q = useQuery({ queryKey: [...CAPTURES_KEY, 'detail', id], queryFn: () => captureService.detail(id!), enabled: !!id });
    const [form, setForm] = useState<Form | null>(null);
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const [items, setItems] = useState<any[]>([]);
    const [reply, setReply] = useState('');

    useEffect(() => {
        const c = q.data?.capture;
        if (!c) return;
        setForm({
            amount: c.zmw_amount != null ? String(c.zmw_amount) : '', occurred_on: c.occurred_on ?? '', direction: c.direction ?? 'OUT',
            wallet_id: c.suggested_wallet_id ?? '', account_id: c.suggested_account_id ?? '', description: c.evidence_summary ?? c.counterparty_name ?? '',
        });
        setItems(c.line_items ?? []);
        setTouched(new Set());
    }, [q.data]);

    const thread = useQuery({
        queryKey: [...CAPTURES_KEY, 'thread', id], queryFn: () => captureService.conversation(id!),
        enabled: !!id && !!q.data?.capture.conversation_id,
    });

    const done = (leave: boolean) => {
        void qc.invalidateQueries({ queryKey: CAPTURES_KEY });
        void qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
        if (leave) router.back();
    };
    const act = useMutation({
        mutationFn: (fn: () => Promise<unknown>) => fn(),
        onError: (e: Error) => Alert.alert('That did not work', e.message),
    });

    if (q.isLoading || !form || !q.data) {
        return <View style={styles.root}><Stack.Screen options={{ headerShown: false }} /><ScreenHeader title="Review" /><ActivityIndicator style={{ marginTop: 40 }} color={colors.blue} /></View>;
    }

    const d = q.data;
    const c = d.capture;
    const open = c.status === 'NEW' || c.status === 'NEEDS_REVIEW';
    const editable = canReview && open;
    const isMomo = !!c.momo_capture_id;
    const set = (k: keyof Form, v: string) => { setForm({ ...form, [k]: v }); setTouched(new Set(touched).add(k)); };
    const ai = (k: keyof Form, filled: boolean) => filled && !touched.has(k) && !c.deterministic;
    const undoOpen = !!d.undoAvailableUntil && new Date(d.undoAvailableUntil) > new Date();
    const canUndo = canReview && (c.status === 'DISMISSED' || (c.status === 'MERGED' && c.match_type === 'LENCO_ENTRY' && !isMomo) || ((c.status === 'APPROVED' || c.status === 'AUTO_POSTED') && undoOpen));
    const candidates = (c.match_candidates ?? []).filter((m: any) => m.kind === 'LENCO_ENTRY').map((m: any) => ({ ...m, entry: d.entries.find((e) => e.id === m.id) })).filter((m: any) => m.entry);
    const matched = c.matched_cashbook_entry_id ? d.entries.find((e) => e.id === c.matched_cashbook_entry_id) : null;

    const editItem = (i: number, k: string, v: string) => {
        setItems(items.map((li, n) => (n === i ? { ...li, [k]: v } : li)));
        setTouched(new Set(touched).add('line_items'));
    };
    const replyOpen = canReview && !!thread.data?.repliesEnabled && !!thread.data.replyWindowEndsAt && new Date(thread.data.replyWindowEndsAt) > new Date();

    const approve = () => act.mutate(
        () => captureService.approve(c.id, {
            amount: Number(form.amount), occurred_on: form.occurred_on, direction: form.direction, description: form.description,
            account_id: form.account_id || null, ...(isMomo ? {} : { wallet_id: form.wallet_id || null }),
            ...(touched.has('line_items') ? { line_items: items } : {}),
        }),
        { onSuccess: () => done(true) },
    );

    return (
        <KeyboardAvoidingView style={styles.root} behavior="padding">
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Review" />
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                {d.attachments.map((a) => a.mime === 'application/pdf' ? (
                    <Pressable key={a.id} onPress={() => a.url && Linking.openURL(a.url)} style={styles.card}><Text style={styles.link}>Open PDF</Text></Pressable>
                ) : (
                    a.url ? <Image key={a.id} source={{ uri: a.url }} style={styles.image} resizeMode="contain" /> : null
                ))}
                {d.momoMessages.map((m) => <Text key={m.id} style={styles.raw}>{m.raw_text}</Text>)}
                {(d.chatMessages ?? []).map((m) => (
                    <View key={m.id} style={[styles.bubble, m.direction === 'OUT' && styles.bubbleOut]}><Text style={styles.bubbleText}>{m.body || `[${m.message_type}]`}</Text></View>
                ))}
                {items.map((li, i) => (
                    <View key={i} style={styles.itemRow}>
                        <TextInput style={[styles.input, styles.itemQty]} keyboardType="decimal-pad" editable={editable} value={String(li.qty ?? '')} onChangeText={(v) => editItem(i, 'qty', v)} />
                        <TextInput style={[styles.input, { flex: 1 }]} editable={editable} value={String(li.name ?? '')} onChangeText={(v) => editItem(i, 'name', v)} />
                        <TextInput style={[styles.input, styles.itemTotal]} keyboardType="decimal-pad" editable={editable} value={String(li.total ?? '')} onChangeText={(v) => editItem(i, 'total', v)} />
                    </View>
                ))}
                {c.flags.map((f) => <Text key={f} style={styles.flag}>{FLAG_TEXT[f] ?? f}</Text>)}
                {c.claim_state === 'CLAIMED' && c.direction === 'IN' && <Text style={styles.hint}>Not yet seen in any wallet. Approve only if you know the money arrived.</Text>}

                <Label text="Amount (K)" ai={ai('amount', c.zmw_amount != null)} />
                <TextInput style={styles.input} keyboardType="decimal-pad" value={form.amount} editable={editable} onChangeText={(v) => set('amount', v)} />
                <Label text="Date" ai={ai('occurred_on', !!c.occurred_on)} />
                <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} value={form.occurred_on} editable={editable} onChangeText={(v) => set('occurred_on', v)} />
                <Label text="Direction" ai={ai('direction', !!c.direction)} />
                <Choices options={[{ id: 'IN', label: 'Money in' }, { id: 'OUT', label: 'Money out' }]} value={form.direction} disabled={!editable} onChange={(v) => set('direction', v)} />
                {!isMomo && (<>
                    <Label text="Paid through" ai={ai('wallet_id', !!c.suggested_wallet_id)} />
                    <Choices options={d.wallets.map((w) => ({ id: w.id, label: w.name }))} value={form.wallet_id} disabled={!editable} onChange={(v) => set('wallet_id', v)} />
                </>)}
                <Label text="Category" ai={ai('account_id', !!c.suggested_account_id)} />
                <Choices options={d.categories.map((a) => ({ id: a.id, label: `${a.emoji ? `${a.emoji} ` : ''}${a.name}` }))} value={form.account_id} disabled={!editable} onChange={(v) => set('account_id', v)} />
                <Label text="Description" ai={ai('description', !!c.evidence_summary)} />
                <TextInput style={styles.input} value={form.description} editable={editable} onChangeText={(v) => set('description', v)} />

                {matched && <Text style={styles.match}>Matches wallet {Number(matched.debit) > 0 ? 'inflow' : 'payment'} {formatKwacha(Number(matched.debit) || Number(matched.credit))} on {matched.date}. No new entry is created.</Text>}
                {editable && candidates.length > 0 && <Text style={styles.sub}>Possible matches in your MoneyWise wallet</Text>}
                {editable && candidates.map((m: any) => (
                    <Pressable key={m.id} disabled={act.isPending} onPress={() => act.mutate(() => captureService.merge(c.id, { cashbookEntryId: m.id, accountId: form.account_id || undefined }), { onSuccess: () => done(true) })} style={styles.card}>
                        <Text style={styles.candidate} numberOfLines={2}>{m.entry.description}{m.phoneMatch ? ' · same phone' : ''}</Text>
                        <Text style={styles.link}>Merge</Text>
                    </Pressable>
                ))}

                {replyOpen && (<>
                    <Text style={styles.sub}>Reply to the customer</Text>
                    <TextInput style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]} multiline maxLength={2000} value={reply} onChangeText={setReply} />
                    <View style={styles.actions}>
                        <Pressable disabled={act.isPending} onPress={() => act.mutate(async () => setReply((await captureService.draftReply(c.id)).text))} style={styles.secondary}><Text style={styles.secondaryText}>Draft</Text></Pressable>
                        <Pressable disabled={act.isPending || !reply.trim()} onPress={() => act.mutate(() => captureService.sendReply(c.id, reply), { onSuccess: () => { setReply(''); void q.refetch(); void thread.refetch(); } })} style={styles.primary}><Text style={styles.primaryText}>Send</Text></Pressable>
                    </View>
                </>)}

                {act.isPending ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.blue} /> : (
                    <View style={styles.actions}>
                        {editable && <Pressable onPress={() => act.mutate(() => captureService.dismiss(c.id), { onSuccess: () => done(true) })} style={styles.secondary}><Text style={styles.secondaryText}>Not a transaction</Text></Pressable>}
                        {editable && <Pressable onPress={approve} style={styles.primary}><Text style={styles.primaryText}>{touched.size ? 'Save & approve' : 'Approve'}</Text></Pressable>}
                        {canUndo && <Pressable onPress={() => act.mutate(() => captureService.undo(c.id), { onSuccess: () => { done(false); void q.refetch(); } })} style={styles.secondary}><Text style={styles.secondaryText}>Undo</Text></Pressable>}
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const Label: React.FC<{ text: string; ai: boolean }> = ({ text, ai }) => (
    <View style={styles.labelRow}><Text style={styles.label}>{text}</Text>{ai && <Sparkles size={12} color={colors.blue} />}</View>
);

const Choices: React.FC<{ options: { id: string; label: string }[]; value: string; disabled: boolean; onChange: (v: string) => void }> = ({ options, value, disabled, onChange }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => (
            <Pressable key={o.id} disabled={disabled} onPress={() => onChange(o.id)} style={[styles.choice, value === o.id && styles.choiceOn]}>
                <Text style={[styles.choiceText, value === o.id && { color: '#FFFFFF' }]}>{o.label}</Text>
            </Pressable>
        ))}
    </ScrollView>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    body: { padding: 20, gap: 8, paddingBottom: 48 },
    image: { width: '100%', height: 320, borderRadius: radius.md, backgroundColor: colors.surface },
    raw: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 18, backgroundColor: colors.tabActiveBg, borderRadius: radius.sm, padding: 12 },
    bubble: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 },
    bubbleOut: { alignSelf: 'flex-end', backgroundColor: colors.tabActiveBg },
    bubbleText: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
    flag: { fontFamily: fonts.body, fontSize: 12, color: colors.warn, backgroundColor: '#FFFBEB', borderRadius: radius.sm, padding: 10 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    input: { fontFamily: fonts.body, fontSize: 15, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 10 },
    choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
    choiceOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    choiceText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    match: { fontFamily: fonts.body, fontSize: 12, color: colors.positiveInk, backgroundColor: '#E7FBF2', borderRadius: radius.sm, padding: 10, marginTop: 8 },
    sub: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted, marginTop: 8 },
    card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
    candidate: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    link: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    itemRow: { flexDirection: 'row', gap: 6 },
    itemQty: { width: 48 },
    itemTotal: { width: 80 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
    secondary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    secondaryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    primary: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.blue },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});
