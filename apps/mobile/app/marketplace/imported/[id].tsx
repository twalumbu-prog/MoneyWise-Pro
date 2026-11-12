import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { Screen, Card, Chip, Btn, Field, Loading, ErrorNote, Notice } from '../../../src/components/marketplace/ui';
import type { ImportQuoteResponse, ImportOrder } from '../../../src/lib/marketplace';
import { daysRange } from '../../../src/lib/marketplace';
import { resized } from '../../../src/lib/images';
import { colors, fonts, radius } from '../../../src/theme/tokens';

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** One imported product: the full price in kwacha, then order it and pay from a MoneyWise wallet. */
export default function ImportedItem() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const { width } = useWindowDimensions();
    const idempotencyKey = useRef(newKey());
    const [quantity, setQuantity] = useState(1);
    const [photo, setPhoto] = useState(0);
    const [optionNote, setOptionNote] = useState('');
    const [picked, setPicked] = useState<Record<string, string>>({});
    const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<ImportOrder | null>(null);

    const { data: q, isPending, isError, error: loadError, refetch } = useQuery({
        queryKey: ['marketplace', 'imports', 'quote', id, quantity],
        queryFn: () => apiJson<ImportQuoteResponse>('/marketplace/imports/quote', { method: 'POST', body: JSON.stringify({ id, quantity }) }),
        placeholderData: keepPreviousData, staleTime: 30_000, retry: false,
    });
    useEffect(() => { if (q && !walletId && q.wallets.length) setWalletId((q.wallets.find((w) => w.is_main) ?? q.wallets[0]).id); }, [q, walletId]);

    if (isPending) return <Screen title="International"><Loading /></Screen>;
    if (isError || !q) return <Screen title="International"><ErrorNote text={(loadError as any)?.message || 'Couldn’t load this product.'} onRetry={() => refetch()} /></Screen>;

    const p = q.product;
    const wallet = q.wallets.find((w) => w.id === walletId);
    const total = q.quote.totalZmw;
    const short = !!wallet && wallet.balance + 0.005 < total;
    const note = [optionNote.trim(), ...Object.entries(picked).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('; ');
    const blocked = !!p.vehicleEstimate;

    const order = async () => {
        if (!phone.trim()) { setError('Add a phone number so we can reach you.'); return; }
        if (!address.trim()) { setError('Add where we should bring it in Lusaka (or where you’ll collect it).'); return; }
        setBusy(true); setError(null);
        try {
            const r = await apiJson<{ order: ImportOrder }>('/marketplace/imports/orders', { method: 'POST', body: JSON.stringify({ productId: id, quantity, optionNote: note, phone: phone.trim(), address: address.trim(), walletId, idempotencyKey: idempotencyKey.current }) });
            void qc.invalidateQueries({ queryKey: ['wallets'] }); void qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            setDone(r.order);
        } catch (e: any) {
            setError(e?.message || 'The payment didn’t go through. Nothing was taken from your wallet.');
            idempotencyKey.current = newKey();
        } finally { setBusy(false); }
    };

    if (done) {
        return (
            <Screen title="Order placed">
                <Notice tone="ok" text={`We have your order for ${done.title}. ${formatKwacha(done.total_zmw)} was taken from your wallet.`} />
                <Btn label="Track my order" onPress={() => router.replace('/marketplace/imported/orders' as any)} />
                <Btn label="Keep shopping" kind="tonal" onPress={() => router.replace('/marketplace' as any)} />
            </Screen>
        );
    }

    return (
        <Screen title="International">
            {p.images?.length ? (
                <View style={{ gap: 8 }}>
                    <Image source={{ uri: resized(p.images[Math.min(photo, p.images.length - 1)], 900) }} style={{ width: width - 40, height: width - 40, borderRadius: radius.lg, backgroundColor: '#F1F3F4' }} resizeMode="contain" />
                    {p.images.length > 1 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {p.images.slice(0, 10).map((u, i) => (
                                <Pressable key={u} onPress={() => setPhoto(i)}><Image source={{ uri: resized(u, 160, { square: true }) }} style={[styles.thumb, i === photo && { borderColor: colors.blue }]} /></Pressable>
                            ))}
                        </ScrollView>
                    ) : null}
                </View>
            ) : null}

            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.sub}>{[p.store, p.origin ? `from ${p.origin}` : null, `arrives in ${daysRange(p.deliveryDaysMin, p.deliveryDaysMax)}`].filter(Boolean).join(' · ')}</Text>
            {p.specs ? <Text style={styles.sub}>{[p.specs.year, p.specs.mileageKm ? `${p.specs.mileageKm.toLocaleString()} km` : null, p.specs.engineCc ? `${p.specs.engineCc} cc` : null, p.specs.fuel, p.specs.transmission, p.specs.color].filter(Boolean).join(' · ')}</Text> : null}
            {p.description ? <Text style={styles.body} numberOfLines={8}>{p.description}</Text> : null}

            <Card>
                <Text style={styles.big}>{formatKwacha(q.quote.perItemZmw)}{q.quote.estimate || p.estimated ? ' (estimate)' : ''}</Text>
                <Text style={styles.sub}>Each, delivered to Lusaka with shipping, {q.taxLabel || 'tax'} and our fee included.</Text>
                <View style={styles.qtyRow}>
                    <Text style={styles.label}>Quantity</Text>
                    <View style={styles.stepper}>
                        <Pressable style={styles.stepBtn} onPress={() => setQuantity((n) => Math.max(1, n - 1))}><Minus size={16} color={colors.textMuted} /></Pressable>
                        <Text style={styles.qty}>{quantity}</Text>
                        <Pressable style={styles.stepBtn} onPress={() => setQuantity((n) => Math.min(20, n + 1))}><Plus size={16} color={colors.textMuted} /></Pressable>
                    </View>
                </View>
                <Line label="Item" v={q.quote.itemZmw} /><Line label="Shipping" v={q.quote.shippingZmw} /><Line label="Tax" v={q.quote.taxesZmw} /><Line label="Fee" v={q.quote.feeZmw} />
                <View style={styles.totalRow}><Text style={styles.title}>Total</Text><Text style={styles.big}>{formatKwacha(total)}</Text></View>
                {q.taxNote ? <Text style={styles.sub}>{q.taxNote}</Text> : null}
            </Card>

            {p.options?.map((o) => (
                <View key={o.name} style={{ gap: 6 }}>
                    <Text style={styles.label}>{o.name}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {o.values.map((v) => <Chip key={v} label={v} on={picked[o.name] === v} onPress={() => setPicked((s) => ({ ...s, [o.name]: v }))} />)}
                    </ScrollView>
                </View>
            ))}

            {blocked ? <Notice tone="warn" text="This car’s price is still an estimate, so it can’t be ordered yet. Ask us for a firm price." /> : !q.enabled ? <Notice tone="warn" text="International orders aren’t switched on yet." /> : (
                <>
                    {error ? <Notice tone="error" text={error} /> : null}
                    <Field label="Note for us (optional)" value={optionNote} onChangeText={setOptionNote} placeholder="Colour, size, anything we should know" />
                    <Field label="Your phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="09…" />
                    <Field label="Where should we bring it in Lusaka?" value={address} onChangeText={setAddress} multiline />
                    <View style={{ gap: 6 }}>
                        <Text style={styles.label}>Pay from</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {q.wallets.map((w) => <Chip key={w.id} label={`${w.name} · ${formatKwacha(w.balance)}`} on={walletId === w.id} onPress={() => setWalletId(w.id)} />)}
                        </ScrollView>
                        {short ? <Text style={[styles.sub, { color: '#B31412' }]}>This wallet doesn’t have enough. Pick another or deposit first.</Text> : null}
                    </View>
                    <Btn label={`Pay ${formatKwacha(total)}`} onPress={order} busy={busy} disabled={!walletId || short} />
                </>
            )}
        </Screen>
    );
}

const Line = ({ label, v }: { label: string; v: number }) => (
    <View style={styles.line}><Text style={styles.sub}>{label}</Text><Text style={styles.sub}>{formatKwacha(v)}</Text></View>
);

const styles = StyleSheet.create({
    title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    body: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 },
    big: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text },
    label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    thumb: { width: 54, height: 54, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#F1F3F4' },
    qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F5F5', borderRadius: 999, padding: 3 },
    stepBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    qty: { minWidth: 28, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    line: { flexDirection: 'row', justifyContent: 'space-between' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
});
