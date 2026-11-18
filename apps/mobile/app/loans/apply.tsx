import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, AlertCircle, Clock, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react-native';
import { apiJson } from 'core';
import { Screen, Card, Btn, Field, Loading, ErrorNote, Notice } from '../../src/components/marketplace/ui';
import type { LendersResponse, Readiness } from '../../src/lib/loans';
import { loanRange } from '../../src/lib/loans';
import { colors, fonts } from '../../src/theme/tokens';

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** Apply for one loan: how much, for how long, what for, and what you agree to share with the lender. */
export default function ApplyForLoan() {
    const { productId } = useLocalSearchParams<{ productId: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const key = useRef(newKey());

    const lenders = useQuery({ queryKey: ['loans', 'lenders'], queryFn: () => apiJson<LendersResponse>('/loans'), staleTime: 60_000 });
    const found = (() => {
        for (const l of lenders.data?.lenders ?? []) { const p = l.products.find((x) => x.id === productId); if (p) return { lender: l, product: p }; }
        return null;
    })();
    const ready = useQuery({ queryKey: ['loans', 'readiness', productId], enabled: !!productId, queryFn: () => apiJson<Readiness>(`/loans/readiness?productId=${productId}`), staleTime: 30_000 });
    const idProfile = useQuery({ queryKey: ['kyc-profile'], queryFn: () => apiJson<{ applicant: Record<string, string> | null }>('/investments/kyc-profile'), staleTime: 60_000, retry: false });

    const scope = lenders.data?.consentScope ?? [];
    const [amount, setAmount] = useState('');
    const [months, setMonths] = useState('');
    const [purpose, setPurpose] = useState('');
    const [phone, setPhone] = useState('');
    const [agreed, setAgreed] = useState<string[] | null>(null);
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    useEffect(() => { const ph = idProfile.data?.applicant?.phone; if (ph) setPhone((cur) => cur || ph); }, [idProfile.data]);
    useEffect(() => { if (agreed === null && scope.length) setAgreed(scope.map((x) => x.key)); }, [scope, agreed]);
    const ticked = agreed ?? [];

    if (lenders.isPending) return <Screen title="Apply"><Loading /></Screen>;
    if (!found) return <Screen title="Apply"><ErrorNote text="That loan isn’t available any more." onRetry={() => router.back()} /></Screen>;
    const { lender, product } = found;

    const send = async () => {
        if (!(Number(amount) > 0)) { setError('Enter how much you need.'); return; }
        if (!phone.trim()) { setError('Add a phone number so the lender can reach you.'); return; }
        if (!consent || ticked.length === 0) { setError('Choose what to share and tick the box to agree.'); return; }
        setBusy(true); setError(null);
        try {
            await apiJson('/loans/applications', { method: 'POST', body: JSON.stringify({ productId: product.id, amount: Number(amount), termMonths: months ? Number(months) : undefined, purpose, phone, consent: true, scope: ticked, idempotencyKey: key.current }) });
            void qc.invalidateQueries({ queryKey: ['loans', 'applications'] });
            setSent(true);
        } catch (e: any) { setError(e?.message || 'We couldn’t send the application.'); key.current = newKey(); } finally { setBusy(false); }
    };

    if (sent) {
        return (
            <Screen title="Application sent">
                <View style={s.done}>
                    <CheckCircle2 size={56} color="#137333" />
                    <Text style={s.doneTitle}>Sent to {lender.name}</Text>
                    <Text style={s.sub}>They will review it and get in touch. You can follow it under My applications, and withdraw it before they decide.</Text>
                    <Btn label="Follow my application" onPress={() => router.replace('/loans' as any)} />
                </View>
            </Screen>
        );
    }

    return (
        <Screen title={`Apply to ${lender.name}`}>
            <Text style={s.sub}>{product.name}{loanRange(product) ? ` · ${loanRange(product)}` : ''}</Text>
            {error ? <Notice tone="error" text={error} /> : null}

            <Field label="Amount (K)" value={amount} onChangeText={(v) => { setAmount(v.replace(/[^0-9.]/g, '')); setError(null); }} keyboardType="decimal-pad" placeholder="e.g. 20000" />
            <Field label="Preferred months (optional)" value={months} onChangeText={(v) => { setMonths(v.replace(/\D/g, '')); setError(null); }} keyboardType="numeric" placeholder={product.tenors?.length ? `e.g. ${product.tenors[1] ?? product.tenors[0]}` : 'e.g. 6'} />
            <Field label="What is it for?" value={purpose} onChangeText={setPurpose} placeholder="Stock for the festive season, a new freezer…" />
            <Field label="Phone number" value={phone} onChangeText={(v) => { setPhone(v); setError(null); }} keyboardType="phone-pad" placeholder="0971234567" hint={`${lender.name} decides the final amount and repayment period after they review your application.`} />

            <Card>
                <View style={s.cardHead}><Sparkles size={16} color={colors.blue} /><Text style={s.cardTitle}>Your MoneyWise ID</Text></View>
                {ready.isPending ? <Loading /> : ready.data ? (
                    <>
                        <Text style={s.sub}>{ready.data.covered} of {ready.data.total} things {lender.name} asks for are already covered, so you don’t fill them in again.</Text>
                        {ready.data.items.map((it) => (
                            <View key={it.key} style={s.item}>
                                {it.status === 'READY' || it.status === 'MONEYWISE' ? <Check size={15} color="#137333" /> : it.status === 'MISSING' ? <AlertCircle size={15} color="#B06000" /> : <Clock size={15} color="#9AA0A6" />}
                                <View style={{ flex: 1 }}>
                                    <Text style={s.itemText}>{it.label}</Text>
                                    {it.note ? <Text style={s.itemNote}>{it.note}</Text> : null}
                                </View>
                                <Text style={s.itemState}>{it.status === 'READY' ? 'On your ID' : it.status === 'MONEYWISE' ? 'From MoneyWise' : it.status === 'MISSING' ? 'Add to your ID' : `Give to ${lender.name}`}</Text>
                            </View>
                        ))}
                        {ready.data.missing > 0 ? <Pressable onPress={() => router.push('/settings/kyc-profile' as any)}><Text style={s.link}>{ready.data.hasId ? 'Finish your MoneyWise ID' : 'Set up your MoneyWise ID'} (once, then it works everywhere)</Text></Pressable> : null}
                    </>
                ) : null}
            </Card>

            <Card>
                <View style={s.cardHead}><ShieldCheck size={16} color={colors.blue} /><Text style={s.cardTitle}>What {lender.name} will see</Text></View>
                <Text style={s.sub}>Only what you tick. It helps them decide faster than paper. They don’t get access to your account, and you can withdraw the application before they decide.</Text>
                {scope.map((x) => {
                    const on = ticked.includes(x.key);
                    return (
                        <Pressable key={x.key} style={s.check} onPress={() => setAgreed((a) => { const cur = a ?? []; return on ? cur.filter((k) => k !== x.key) : [...cur, x.key]; })}>
                            <View style={[s.box, on && s.boxOn]}>{on ? <Check size={13} color="#fff" /> : null}</View><Text style={s.checkText}>{x.label}</Text>
                        </Pressable>
                    );
                })}
                <Pressable style={[s.check, s.consent]} onPress={() => { setConsent((c) => !c); setError(null); }}>
                    <View style={[s.box, consent && s.boxOn]}>{consent ? <Check size={13} color="#fff" /> : null}</View>
                    <Text style={[s.checkText, { fontFamily: fonts.bodyBold }]}>I agree to share the items ticked above with {lender.name} for this application.</Text>
                </Pressable>
            </Card>

            {!product.terms_confirmed ? <Notice tone="warn" text={`Amounts, terms and rates for this loan are still being confirmed with ${lender.name}. They’ll confirm the exact offer if they approve you.`} /> : null}
            <Btn label="Send application" onPress={send} busy={busy} />
        </Screen>
    );
}

const s = StyleSheet.create({
    sub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    itemText: { fontFamily: fonts.body, fontSize: 13, color: '#3C4043' },
    itemNote: { fontFamily: fonts.body, fontSize: 11, color: '#B06000' },
    itemState: { fontFamily: fonts.body, fontSize: 11, color: '#80868B' },
    link: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue, textDecorationLine: 'underline', marginTop: 6 },
    check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
    consent: { borderTopWidth: 1, borderTopColor: '#E3E5E8', marginTop: 6, paddingTop: 12 },
    box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.textFaint, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    checkText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: '#3C4043', lineHeight: 18 },
    done: { alignItems: 'center', gap: 12, paddingVertical: 36 },
    doneTitle: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text, textAlign: 'center' },
});
