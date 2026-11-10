import { useState } from 'react';
import { View, Text, Alert, Linking, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { WEB_ORIGIN } from '../../../src/platform/constants';
import { Screen, Card, Pill, Btn, Field, Loading, ErrorNote, Notice } from '../../../src/components/marketplace/ui';
import type { RfqDetail, QuoteView } from '../../../src/lib/marketplace';
import { RFQ_STATUS, qtyText, shortDay, daysLeft } from '../../../src/lib/marketplace';
import { colors, fonts } from '../../../src/theme/tokens';

export default function RequestDetail() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const { data, isPending, isError, error, refetch, isRefetching } = useQuery({ queryKey: ['rfq', 'one', id], queryFn: () => apiJson<RfqDetail>(`/marketplace/rfq/${id}`), retry: false, refetchInterval: 30_000 });
    const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [accepted, setAccepted] = useState<{ name: string; phone: string | null } | null>(null);
    const [unitPrice, setUnitPrice] = useState(''); const [fee, setFee] = useState(''); const [valid, setValid] = useState(''); const [note, setNote] = useState('');
    const refresh = () => { void qc.invalidateQueries({ queryKey: ['rfq'] }); return refetch(); };

    if (isPending) return <Screen title="Request"><Loading /></Screen>;
    if (isError || !data) return <Screen title="Request"><ErrorNote text={(error as any)?.message || 'Couldn’t load the request.'} onRetry={() => refetch()} /></Screen>;
    const { request: r, quotes, role, buyer } = data;
    const open = r.status === 'OPEN';
    const st = RFQ_STATUS[r.status];
    const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e: any) { setErr(e?.message || 'That did not work.'); } finally { setBusy(false); } };

    const accept = (q: QuoteView) => Alert.alert(`Accept ${q.supplierName}’s quote?`, `${formatKwacha(q.total)}. The other suppliers will be told you chose another quote.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => void act(async () => {
            const a = await apiJson<{ payPath: string | null; supplier: { name: string; phone: string | null } }>(`/marketplace/rfq/quotes/${q.id}/accept`, { method: 'POST' });
            await refresh();
            if (a.payPath) await Linking.openURL(`${WEB_ORIGIN}${a.payPath}`); else setAccepted(a.supplier);
        }) },
    ]);
    const cancel = () => Alert.alert('Cancel this request?', 'Suppliers will no longer be able to quote.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel request', style: 'destructive', onPress: () => void act(async () => { await apiJson(`/marketplace/rfq/${id}/cancel`, { method: 'POST' }); await refresh(); }) },
    ]);
    const send = () => act(async () => { await apiJson(`/marketplace/rfq/${id}/quotes`, { method: 'POST', body: JSON.stringify({ unitPrice: Number(unitPrice), deliveryFee: Number(fee) || 0, validUntil: valid || undefined, note }) }); setUnitPrice(''); setFee(''); setNote(''); await refresh(); });
    const myTotal = (Number(unitPrice) || 0) * r.quantity + (Number(fee) || 0);
    const mine = role === 'SUPPLIER' ? quotes[0] : null;

    return (
        <Screen title={r.reference} onRefresh={() => { void refresh(); }} refreshing={isRefetching}>
            {err ? <Notice tone="error" text={err} /> : null}
            {accepted ? <Notice tone="ok" text={`Quote accepted. Contact ${accepted.name}${accepted.phone ? ` on ${accepted.phone}` : ''} to arrange payment and delivery.`} /> : null}

            <Card>
                <View style={styles.top}><Text style={styles.title}>{r.title}</Text>{st ? <Pill label={st.label} bg={st.bg} fg={st.fg} /> : null}</View>
                <Text style={styles.sub}>{qtyText(r.quantity)} {r.unit}</Text>
                <Text style={styles.sub}>{[r.deliveryTown, r.deliveryProvince].filter(Boolean).join(', ') || 'Delivery place not given'}{r.deliveryAddress ? ` · ${r.deliveryAddress}` : ''}</Text>
                {r.neededBy ? <Text style={styles.sub}>Needed by {shortDay(r.neededBy)}</Text> : null}
                {open ? <Text style={styles.sub}>{daysLeft(r.expiresAt)} days left to quote</Text> : null}
                {r.details ? <Text style={styles.body}>{r.details}</Text> : null}
                {r.catalogItem ? <Pressable onPress={() => router.push(`/marketplace/compare/${r.catalogItem!.slug}` as any)}><Text style={styles.link}>See what it costs around Zambia</Text></Pressable> : null}
            </Card>

            {role === 'BUYER' ? (
                <>
                    <Text style={styles.section}>QUOTES ({quotes.length})</Text>
                    {quotes.length === 0 ? <Text style={styles.empty}>No quotes yet. Suppliers have been told. Pull down to refresh.</Text> : quotes.map((q) => (
                        <Card key={q.id} style={q.cheapest ? { borderColor: '#137333' } : undefined}>
                            <View style={styles.top}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.title}>{q.supplierName}</Text>
                                    <Text style={styles.sub}>{formatKwacha(q.unitPrice)} per {r.unit} × {qtyText(q.quantity)}{q.deliveryFee > 0 ? ` + ${formatKwacha(q.deliveryFee)} delivery` : q.delivers ? ' · delivery included' : ' · no delivery'}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.price}>{formatKwacha(q.total)}</Text>
                                    {q.status === 'SUBMITTED' && q.extraVsBest ? <Text style={styles.extra}>{formatKwacha(q.extraVsBest)} more</Text> : null}
                                </View>
                            </View>
                            <View style={styles.pills}>
                                {q.cheapest ? <Pill label="Cheapest" bg="#E6F4EA" fg="#137333" /> : null}
                                {q.onMoneyWise ? <Pill label="On MoneyWise" /> : null}
                                {q.status === 'ACCEPTED' ? <Pill label="Accepted" bg="#E6F4EA" fg="#137333" /> : null}
                                {q.status === 'DECLINED' ? <Pill label="Not chosen" bg="#F1F3F4" fg="#5F6368" /> : null}
                            </View>
                            {q.note ? <Text style={styles.body}>“{q.note}”</Text> : null}
                            {open && q.status === 'SUBMITTED' ? <Btn label="Accept this quote" onPress={() => accept(q)} busy={busy} /> : null}
                            {q.status === 'ACCEPTED' && q.payPath ? <Btn label={`Pay ${formatKwacha(q.total)}`} onPress={() => Linking.openURL(`${WEB_ORIGIN}${q.payPath}`)} /> : null}
                            {q.status === 'ACCEPTED' && q.supplierPhone ? <Btn label="Call supplier" kind="tonal" onPress={() => Linking.openURL(`tel:${q.supplierPhone!.replace(/[^+\d]/g, '')}`)} /> : null}
                        </Card>
                    ))}
                    {open ? <Btn label="Cancel request" kind="danger" onPress={cancel} busy={busy} /> : null}
                </>
            ) : (
                <>
                    {buyer && mine?.status === 'ACCEPTED' ? (
                        <Card><Text style={styles.title}>Your quote was accepted</Text><Text style={styles.sub}>{buyer.name ?? 'The buyer'}{buyer.address ? ` · ${buyer.address}` : ''}</Text>
                            {buyer.phone ? <Pressable style={styles.call} onPress={() => Linking.openURL(`tel:${buyer.phone}`)}><Phone size={14} color={colors.blue} /><Text style={styles.callText}>{buyer.phone}</Text></Pressable> : null}</Card>
                    ) : null}
                    {mine ? (
                        <Card>
                            <Text style={styles.title}>Your quote: {formatKwacha(mine.total)}</Text>
                            <Text style={styles.sub}>{formatKwacha(mine.unitPrice)} per {r.unit}{mine.deliveryFee > 0 ? ` + ${formatKwacha(mine.deliveryFee)} delivery` : ''}</Text>
                            {open && mine.status === 'SUBMITTED' ? <Btn label="Withdraw my quote" kind="danger" busy={busy} onPress={() => void act(async () => { await apiJson(`/marketplace/rfq/quotes/${mine.id}/withdraw`, { method: 'POST' }); await refresh(); })} /> : null}
                        </Card>
                    ) : open ? (
                        <Card>
                            <Text style={styles.title}>Send your quote</Text>
                            <Field label={`Price per ${r.unit} (K)`} value={unitPrice} onChangeText={(v) => setUnitPrice(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
                            <Field label="Delivery fee (K, optional)" value={fee} onChangeText={(v) => setFee(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
                            <Field label="Valid until (optional)" value={valid} onChangeText={setValid} placeholder="YYYY-MM-DD" />
                            <Field label="Note (optional)" value={note} onChangeText={setNote} multiline />
                            <Text style={styles.sub}>Total for the buyer: {formatKwacha(myTotal)}</Text>
                            <Btn label="Send quote" onPress={send} busy={busy} disabled={!(Number(unitPrice) > 0)} />
                        </Card>
                    ) : null}
                </>
            )}
        </Screen>
    );
}

const styles = StyleSheet.create({
    top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
    title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    body: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 18, marginTop: 4 },
    link: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue, marginTop: 6 },
    section: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.textFaint, letterSpacing: 0.6, marginTop: 6 },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
    price: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    extra: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#B31412' },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    call: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF1FF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 },
    callText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
});
