import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react-native';
import { tapService, requisitionService, cashbookService, formatKwacha, parseTapCode, type TapRequestView } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useAuth } from '../../src/context/AuthContext';
import { rememberTapCode } from '../../src/lib/pendingTap';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Pay a request: the code from a tap, QR code or link. The server decides whether this person may open it. The person sees who is
 * asking and how much, confirms with fingerprint or face, and the payment goes through the normal MoneyWise-to-MoneyWise transfer.
 */
export default function PayRequest() {
    const params = useLocalSearchParams<{ code: string }>();
    const code = parseTapCode(String(params.code ?? '')) ?? '';
    const router = useRouter();
    const qc = useQueryClient();
    const { userRole, session, loading: authLoading } = useAuth();

    const [view, setView] = useState<TapRequestView | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stage, setStage] = useState<'confirm' | 'sending' | 'done'>('confirm');
    const [openReq, setOpenReq] = useState<string | null>(null);

    // Opened from a link before signing in: remember it, sign in, and come straight back.
    useEffect(() => {
        if (authLoading || session || !code) return;
        rememberTapCode(code);
        router.replace('/' as any);
    }, [authLoading, session, code, router]);

    useEffect(() => {
        if (authLoading || !session) return;
        if (!code) { setLoadError('That isn’t a MoneyWise request code.'); return; }
        tapService.resolve(code).then((v) => { setView(v); if (v.amount) setAmount(String(v.amount)); }).catch((e) => setLoadError(e?.message || 'This request isn’t available.'));
    }, [code, authLoading, session]);

    const { data: wallets = [] } = useQuery({
        queryKey: ['wallets-tap-pay'],
        queryFn: async () => (await cashbookService.getWallets() as any[]).map((w) => ({ id: String(w.id), name: String(w.name), balance: Number(w.balance) || 0, isMain: !!w.is_main })),
    });
    useEffect(() => { if (!walletId && wallets.length) setWalletId((wallets.find((w) => w.isMain) ?? wallets[0]).id); }, [wallets, walletId]);

    const value = view?.amount ?? (Number(amount) || 0);
    const wallet = wallets.find((w) => w.id === walletId);
    const short = !!wallet && wallet.balance + 0.005 < value;
    const isAdmin = userRole === 'ADMIN';
    const canPay = !!view && value > 0 && !!wallet && !short && isAdmin && !busy;

    const confirmIdentity = async (): Promise<boolean> => {
        if (Platform.OS === 'web') return true;
        try {
            const has = await LocalAuthentication.hasHardwareAsync();
            const enrolled = has && (await LocalAuthentication.isEnrolledAsync());
            if (!enrolled) return true; // no fingerprint or face set up on this phone
            const r = await LocalAuthentication.authenticateAsync({ promptMessage: `Pay ${formatKwacha(value)} to ${view?.recipient.name ?? ''}`, cancelLabel: 'Cancel' });
            return r.success;
        } catch { return true; }
    };

    const pay = async () => {
        if (!view || !canPay) return;
        setError(null); setBusy(true);
        try {
            if (!(await confirmIdentity())) { setBusy(false); return; }
            setStage('sending');
            const claimed = await tapService.claim(code);
            const r = claimed.recipient;
            if (claimed.amount && Math.abs(claimed.amount - value) > 0.005) throw new Error('The amount asked for has changed. Open the request again.');
            const data: any = {
                description: `Tap payment to ${r.name}${view.note ? ` · ${view.note}` : ''}`.slice(0, 200),
                estimated_total: value,
                payment_method: 'MONEYWISE_PAY',
                recipient_account: r.id,
                recipient_bank_code: 'MONEYWISE',
                recipient_name: r.name,
                recipient_organization_id: r.organization_id || undefined,
            };
            const created = await requisitionService.create(data);
            setOpenReq(created.id);
            await tapService.attach(code, created.id);
            const result: any = await requisitionService.autoDisburse(created.id, {
                payment_method: 'MONEYWISE_PAY', total_prepared: value, recipient_account: r.id, recipient_bank_code: 'moneywise',
                recipient_account_name: r.name, recipient_organization_id: r.organization_id || undefined, wallet_id: walletId || undefined,
            });
            if (result?.lencoStatus === 'pending') {
                for (let attempt = 0; attempt < 8; attempt++) {
                    await new Promise((res) => setTimeout(res, 4000));
                    const poll: any = await requisitionService.verifyDisbursement(created.id);
                    if (poll.status === 'successful') break;
                    if (poll.status === 'failed') throw new Error(poll.error || poll.details?.reasonForFailure || 'The transfer was rejected.');
                }
            }
            void qc.invalidateQueries({ queryKey: ['requisitions'] }); void qc.invalidateQueries({ queryKey: ['wallets'] }); void qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            setStage('done');
        } catch (e: any) {
            setStage('confirm');
            setError(`${e?.message || 'The payment didn’t go through.'}${openReq ? ' Nothing was lost; open the payment to see where it stands.' : ''}`);
        } finally { setBusy(false); }
    };

    return (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Pay request" />
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                {loadError ? (
                    <View style={[s.card, { alignItems: 'center', gap: 10 }]}>
                        <AlertCircle size={40} color="#B06000" />
                        <Text style={s.title}>Can’t open this request</Text>
                        <Text style={s.sub}>{loadError}</Text>
                        <Pressable style={s.btn} onPress={() => router.replace('/tap' as any)}><Text style={s.btnText}>Back</Text></Pressable>
                    </View>
                ) : !view ? <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
                : stage === 'done' ? (
                    <View style={[s.card, { alignItems: 'center', gap: 10 }]}>
                        <CheckCircle2 size={56} color="#137333" />
                        <Text style={s.big}>{formatKwacha(value)} sent</Text>
                        <Text style={s.sub}>to {view.recipient.name}</Text>
                        <Pressable style={s.btn} onPress={() => router.replace('/(tabs)/wallet' as any)}><Text style={s.btnText}>Done</Text></Pressable>
                    </View>
                ) : (
                    <>
                        <View style={s.card}>
                            <Text style={s.label}>YOU ARE PAYING</Text>
                            <View style={s.who}>
                                <View style={s.avatar}><Text style={s.avatarText}>{view.recipient.name.trim().charAt(0).toUpperCase()}</Text></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.name}>{view.recipient.name}</Text>
                                    <Text style={s.sub2}>{view.recipient.organization_name} · {view.recipient.moneywise_id}</Text>
                                </View>
                            </View>
                            {view.note ? <Text style={s.note}>“{view.note}”</Text> : null}
                            {view.amount ? <Text style={s.amount}>{formatKwacha(view.amount)}</Text> : (
                                <TextInput style={s.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} keyboardType="decimal-pad" placeholder="Amount (K)" placeholderTextColor={colors.textFaint} editable={stage === 'confirm'} />
                            )}
                        </View>

                        <View style={s.card}>
                            <Text style={s.label}>PAY FROM</Text>
                            <View style={s.row}>
                                {wallets.map((w) => (
                                    <Pressable key={w.id} onPress={() => setWalletId(w.id)} style={[s.chip, walletId === w.id && s.chipOn]}><Text style={[s.chipText, walletId === w.id && { color: '#FFFFFF' }]}>{w.name} · {formatKwacha(w.balance)}</Text></Pressable>
                                ))}
                            </View>
                            {short ? <Text style={s.errorInline}>This wallet doesn’t have enough. Pick another or deposit first.</Text> : null}
                        </View>

                        {!isAdmin ? <Text style={s.error}>Only the account holder can pay by tap. Ask them to scan it.</Text> : null}
                        {error ? <Text style={s.error}>{error}</Text> : null}

                        <Pressable style={[s.btn, !canPay && { opacity: 0.45 }]} disabled={!canPay} onPress={pay}>
                            {stage === 'sending' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>{value > 0 ? `Pay ${formatKwacha(value)}` : 'Pay'}</Text>}
                        </Pressable>
                        <View style={s.safe}><ShieldCheck size={14} color={colors.textMuted} /><Text style={s.safeText}>You confirm with your fingerprint or face. Check the name and amount before you pay.</Text></View>
                    </>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
    label: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.textFaint, letterSpacing: 0.7 },
    who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.blue },
    name: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    sub2: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    note: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
    amount: { fontFamily: fonts.bodyBold, fontSize: 34, color: colors.text, letterSpacing: -0.5 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, fontFamily: fonts.bodyBold, fontSize: 22, color: colors.text, backgroundColor: '#fff' },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
    title: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text, textAlign: 'center' },
    big: { fontFamily: fonts.bodyBold, fontSize: 24, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19, textAlign: 'center' },
    btn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', alignSelf: 'stretch' },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    error: { fontFamily: fonts.body, fontSize: 12, color: '#B31412', backgroundColor: '#FCE8E6', borderRadius: radius.md, padding: 12, lineHeight: 17 },
    errorInline: { fontFamily: fonts.body, fontSize: 12, color: '#B31412' },
    safe: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', justifyContent: 'center' },
    safeText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, lineHeight: 16 },
});
