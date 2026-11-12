import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Minus, Plus, ShieldCheck, CheckCircle2, Truck } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { Screen, Card, Chip, Btn, Field, Loading, ErrorNote, Notice } from '../../../src/components/marketplace/ui';
import type { QuoteResponse, DeliveryMethod, PlacedOrder } from '../../../src/lib/listings';
import { resized } from '../../../src/lib/images';
import { colors, fonts } from '../../../src/theme/tokens';

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** Pay for a local item from a MoneyWise wallet, inside the app: how you get it, your phone, which wallet, then Pay. */
export default function Checkout() {
    const { productId, auction } = useLocalSearchParams<{ productId: string; auction?: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const key = useRef(newKey());
    const [quantity, setQuantity] = useState(1);
    const [variantId, setVariantId] = useState<string | null>(null);
    const [area, setArea] = useState('');
    const [method, setMethod] = useState<DeliveryMethod>('PICKUP');
    const [address, setAddress] = useState(''); const [notes, setNotes] = useState(''); const [phone, setPhone] = useState('');
    const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<PlacedOrder | null>(null);

    const { data: q, isPending, isError, error: loadError, refetch } = useQuery({
        queryKey: ['marketplace', 'quote', productId, auction, variantId, quantity, area],
        queryFn: () => apiJson<QuoteResponse>('/marketplace/checkout/quote', { method: 'POST', body: JSON.stringify({ productId, auctionId: auction || undefined, variantId: variantId || undefined, quantity, area: area || undefined, speed: 'STANDARD' }) }),
        placeholderData: keepPreviousData, staleTime: 15_000, retry: false,
    });
    const idProfile = useQuery({ queryKey: ['kyc-profile'], queryFn: () => apiJson<{ applicant: Record<string, string> | null }>('/investments/kyc-profile'), staleTime: 60_000, retry: false });
    useEffect(() => { const ph = idProfile.data?.applicant?.phone; if (ph) setPhone((c) => c || ph); }, [idProfile.data]);
    useEffect(() => { if (q && !walletId && q.wallets.length) setWalletId((q.wallets.find((w) => w.is_main) ?? q.wallets[0]).id); }, [q, walletId]);
    useEffect(() => { const o = q?.delivery.options.find((x) => x.method === method); if (method !== 'PICKUP' && o && !o.available) setMethod('PICKUP'); }, [q, method]);

    if (isPending && !q) return <Screen title="Checkout"><Loading /></Screen>;
    if (isError || !q) return <Screen title="Checkout"><ErrorNote text={(loadError as any)?.message || 'We can’t check out this item. It may have been sold or taken down.'} onRetry={() => refetch()} /></Screen>;
    if (!q.supported || q.stay) {
        return <Screen title="Checkout"><Card><Text style={s.bold}>{q.item.name}</Text><Text style={s.sub}>{q.unsupportedReason || 'Picking dates for rooms and rentals isn’t in the app yet.'}</Text></Card></Screen>;
    }

    const isThing = q.item.type === 'PRODUCT';
    const chosen = q.delivery.options.find((o) => o.method === method);
    const deliveryFee = method !== 'PICKUP' && chosen?.available ? chosen.fee : 0;
    const total = Math.round((q.item.itemTotal + deliveryFee) * 100) / 100;
    const wallet = q.wallets.find((w) => w.id === walletId);
    const short = !!wallet && wallet.balance + 0.005 < total;
    const stockBlocked = q.stock.tracked && (q.stock.soldOut || (q.stock.variants.length > 0 && !q.stock.variantId) || (q.stock.variantId !== null && q.stock.maxQuantity < 1));
    const canQty = !q.auction && isThing;

    const pay = async () => {
        if (method !== 'PICKUP' && (!area || !address.trim())) { setError('Add your area and delivery address.'); return; }
        if (!phone.trim()) { setError('Add a phone number so the seller can reach you.'); return; }
        setBusy(true); setError(null);
        try {
            const r = await apiJson<{ order: PlacedOrder }>('/marketplace/orders', { method: 'POST', body: JSON.stringify({ productId, auctionId: auction || undefined, variantId: variantId || undefined, quantity, area: area || undefined, speed: 'STANDARD', deliveryMethod: method, address, notes, phone, walletId, idempotencyKey: key.current, payLater: false }) });
            void qc.invalidateQueries({ queryKey: ['marketplace'] }); void qc.invalidateQueries({ queryKey: ['wallets'] });
            setDone(r.order);
        } catch (e: any) { setError(e?.message || 'The payment didn’t go through. Nothing was taken from your wallet.'); key.current = newKey(); } finally { setBusy(false); }
    };

    if (done) {
        const processing = done.status === 'PAYMENT_PROCESSING';
        return (
            <Screen title="Checkout">
                <View style={s.done}>
                    <CheckCircle2 size={60} color={processing ? '#E37400' : '#137333'} />
                    <Text style={s.doneTitle}>{processing ? 'Payment on its way' : 'Order placed'}</Text>
                    <Text style={s.sub}>{processing ? 'Your wallet transfer is being confirmed. The order updates by itself.' : `${formatKwacha(done.total)} paid to ${q.seller.name}. They’ve been told.`}</Text>
                    <Text style={s.bold}>{done.product_name}{done.quantity > 1 ? ` ×${done.quantity}` : ''}</Text>
                    <Text style={s.sub}>{done.delivery_method !== 'PICKUP' ? `Delivery to ${done.delivery_area ?? ''}${done.delivery_address ? `, ${done.delivery_address}` : ''}` : isThing ? 'Collect from the seller' : 'The seller will contact you'}</Text>
                    <Btn label="Keep shopping" onPress={() => router.replace('/marketplace' as any)} />
                </View>
            </Screen>
        );
    }

    return (
        <Screen title="Checkout">
            {q.auction ? <Notice tone="ok" text="You won this auction. Pay to claim it." /> : null}
            <Card>
                <View style={s.row}>
                    {q.item.imageUrl ? <Image source={{ uri: resized(q.item.imageUrl, 200, { square: true }) }} style={s.thumb} /> : <View style={s.thumb} />}
                    <View style={{ flex: 1 }}>
                        <Text style={s.bold} numberOfLines={2}>{q.item.name}</Text>
                        <Text style={s.sub}>Sold by {q.seller.name}</Text>
                        {canQty ? (
                            <View style={s.qty}>
                                <Pressable onPress={() => setQuantity((n) => Math.max(1, n - 1))} style={s.qtyBtn}><Minus size={14} color={colors.text} /></Pressable>
                                <Text style={s.qtyNum}>{quantity}</Text>
                                <Pressable onPress={() => setQuantity((n) => Math.min(q.stock.tracked ? Math.max(1, q.stock.maxQuantity) : 20, n + 1))} style={s.qtyBtn}><Plus size={14} color={colors.text} /></Pressable>
                            </View>
                        ) : null}
                    </View>
                </View>
                {q.stock.tracked && q.stock.variants.length ? (
                    <View style={s.wrap}>{q.stock.variants.map((v) => <Chip key={v.id} label={`${v.name}${v.stock < 1 ? ' (sold out)' : ''}`} on={q.stock.variantId === v.id} onPress={() => { setVariantId(v.id); setQuantity(1); }} />)}</View>
                ) : null}
                {q.stock.soldOut ? <Notice tone="error" text="This item is sold out." /> : null}
            </Card>

            {isThing ? (
                <Card>
                    <Text style={s.head}>How do you want to get it?</Text>
                    <View style={s.hint}><Truck size={14} color={colors.blue} /><Text style={[s.sub, { flex: 1 }]}>Delivery works in Lusaka only for now. Everywhere else, collect from the seller.</Text></View>
                    <Text style={s.label}>Your area in Lusaka</Text>
                    <View style={s.wrap}>
                        <Chip label="Not in Lusaka" on={!area} onPress={() => setArea('')} />
                        {q.delivery.areas.map((a) => <Chip key={a} label={a} on={area === a} onPress={() => setArea(a)} />)}
                    </View>
                    {q.delivery.options.map((o) => (
                        <Pressable key={o.method} disabled={!o.available} onPress={() => { setMethod(o.method); setError(null); }} style={[s.opt, method === o.method && s.optOn, !o.available && { opacity: 0.5 }]}>
                            <View style={[s.radio, method === o.method && s.radioOn]} />
                            <View style={{ flex: 1 }}><Text style={s.bold}>{o.label}{o.comingSoon ? ' (soon)' : ''}</Text><Text style={s.sub}>{o.note}</Text></View>
                            <Text style={s.bold}>{o.method === 'PICKUP' || (o.available && o.fee === 0) ? 'Free' : o.fee > 0 ? formatKwacha(o.fee) : '–'}</Text>
                        </Pressable>
                    ))}
                    {method !== 'PICKUP' ? <Field label="Delivery address" value={address} onChangeText={(v) => { setAddress(v); setError(null); }} placeholder="House or plot number, street, landmark" multiline /> : null}
                </Card>
            ) : null}

            <Card>
                <Text style={s.head}>Your details</Text>
                <Field label="Phone number" value={phone} onChangeText={(v) => { setPhone(v); setError(null); }} keyboardType="phone-pad" placeholder="0971234567" />
                <Field label="Note to the seller (optional)" value={notes} onChangeText={setNotes} placeholder="Colour, size, best time…" />
            </Card>

            <Card>
                <Text style={s.head}>Pay from</Text>
                <View style={s.wrap}>{q.wallets.map((w) => <Chip key={w.id} label={`${w.name} · ${formatKwacha(w.balance)}`} on={walletId === w.id} onPress={() => { setWalletId(w.id); setError(null); }} />)}</View>
                {short ? <Text style={s.err}>This wallet has {formatKwacha(wallet?.balance ?? 0)}. Add money or choose another wallet.</Text> : null}
                <Text style={s.sub}>MoneyWise Pay goes straight to the seller. Instant, no fees. Pay in 4 isn’t in the app yet.</Text>
            </Card>

            <Card>
                <View style={s.sumRow}><Text style={s.sub}>{q.item.quantity > 1 ? `${formatKwacha(q.item.unitPrice)} × ${q.item.quantity}` : q.auction ? 'Winning bid' : 'Item'}</Text><Text style={s.bold}>{formatKwacha(q.item.itemTotal)}</Text></View>
                <View style={s.sumRow}><Text style={s.sub}>Delivery</Text><Text style={s.bold}>{method !== 'PICKUP' ? formatKwacha(deliveryFee) : 'Free'}</Text></View>
                <View style={s.sumRow}><Text style={s.sub}>MoneyWise fee</Text><Text style={[s.bold, { color: '#137333' }]}>K0.00</Text></View>
                <View style={[s.sumRow, s.totalRow]}><Text style={s.total}>Total</Text><Text style={s.total}>{formatKwacha(total)}</Text></View>
            </Card>

            {error ? <Notice tone="error" text={error} /> : null}
            <Btn label={`Pay ${formatKwacha(total)}`} onPress={pay} busy={busy} disabled={short || !walletId || stockBlocked} />
            <View style={s.hint}><ShieldCheck size={14} color={colors.blue} /><Text style={[s.sub, { flex: 1 }]}>Your wallet pays the seller’s wallet directly. If something goes wrong, report a problem from your orders.</Text></View>
        </Screen>
    );
}

const s = StyleSheet.create({
    row: { flexDirection: 'row', gap: 12 },
    thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#F1F3F4' },
    bold: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    head: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, marginTop: 4 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    hint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    qty: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    qtyBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    qtyNum: { width: 28, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    opt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
    optOn: { borderColor: colors.blue, backgroundColor: '#F0F6FF' },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#9AA0A6' },
    radioOn: { borderColor: colors.blue, backgroundColor: colors.blue },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
    totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 },
    total: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    err: { fontFamily: fonts.body, fontSize: 12, color: '#B31412' },
    done: { alignItems: 'center', gap: 10, paddingVertical: 36 },
    doneTitle: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.text },
});
