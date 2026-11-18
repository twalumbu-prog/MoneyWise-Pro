import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, BadgeCheck, Star, Clock } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { Screen, Btn, Field, Loading, ErrorNote, Notice } from '../../../src/components/marketplace/ui';
import type { ListingsResponse } from '../../../src/lib/listings';
import { listingPrice } from '../../../src/lib/listings';
import { resized } from '../../../src/lib/images';
import { colors, fonts } from '../../../src/theme/tokens';

const left = (endsAt: string, now: number) => {
    const ms = new Date(endsAt).getTime() - now;
    if (ms <= 0) return 'Ended';
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return d > 0 ? `${d}d ${h % 24}h left` : h > 0 ? `${h}h ${m % 60}m left` : `${m}m left`;
};

/** One local item, laid out like an eBay item page: big photos, price, then Buy it now / Place bid, then the seller. */
export default function ListingDetail() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const { width } = useWindowDimensions();
    const [photo, setPhoto] = useState(0);
    const [bid, setBid] = useState(''); const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState<'bid' | 'buy' | null>(null); const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
    const q = useQuery({ queryKey: ['marketplace', 'listings'], queryFn: () => apiJson<ListingsResponse>('/marketplace/listings'), staleTime: 30_000 });
    const idProfile = useQuery({ queryKey: ['kyc-profile'], queryFn: () => apiJson<{ applicant: Record<string, string> | null }>('/investments/kyc-profile'), staleTime: 60_000, retry: false });
    useEffect(() => { const ph = idProfile.data?.applicant?.phone; if (ph) setPhone((c) => c || ph); }, [idProfile.data]);

    if (q.isPending) return <Screen title="Item"><Loading /></Screen>;
    const l = q.data?.listings.find((x) => x.id === id);
    if (!l) return <Screen title="Item"><ErrorNote text="That item isn’t available any more." onRetry={() => q.refetch()} /></Screen>;
    const pics = l.images?.length ? l.images : l.imageUrl ? [l.imageUrl] : [];
    const a = l.auction;
    const open = a?.status === 'OPEN';

    const refresh = () => qc.invalidateQueries({ queryKey: ['marketplace', 'listings'] });
    const placeBid = async () => {
        const amount = Number(bid || a?.minNextBid);
        if (!a || !(amount >= a.minNextBid)) { setError(`Bid at least ${formatKwacha(a?.minNextBid ?? 0)}.`); return; }
        if (!phone.trim()) { setError('Enter your mobile money number: the winner pays with it.'); return; }
        setBusy('bid'); setError(null);
        try { await apiJson(`/marketplace/auctions/${a.id}/bids`, { method: 'POST', body: JSON.stringify({ amount, phone }) }); setBid(''); await refresh(); }
        catch (e: any) { setError(e?.message || 'Your bid didn’t go through.'); } finally { setBusy(null); }
    };
    const buyNow = async () => {
        if (!a) return;
        if (!phone.trim()) { setError('Enter your mobile money number first.'); return; }
        setBusy('buy'); setError(null);
        try { await apiJson(`/marketplace/auctions/${a.id}/buy-now`, { method: 'POST', body: JSON.stringify({ phone }) }); await refresh(); router.push(`/marketplace/listing/checkout?productId=${l.id}&auction=${a.id}` as any); }
        catch (e: any) { setError(e?.message || 'We couldn’t buy it now.'); } finally { setBusy(null); }
    };

    return (
        <Screen title="">
            {pics.length ? (
                <View style={{ marginHorizontal: -20, marginTop: -20, backgroundColor: '#F7F7F7' }}>
                    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / width))}>
                        {pics.map((u) => <Image key={u} source={{ uri: resized(u, 900) }} style={{ width, height: width }} resizeMode="contain" />)}
                    </ScrollView>
                    {pics.length > 1 ? <View style={s.dots}>{pics.map((_, i) => <View key={i} style={[s.dot, i === photo && s.dotOn]} />)}</View> : null}
                </View>
            ) : null}

            <Text style={s.name}>{l.name}</Text>
            <Text style={s.price}>{listingPrice(l)}</Text>
            {open ? (
                <View style={s.meta}>
                    <Clock size={14} color={colors.textMuted} /><Text style={s.sub}>{left(a!.endsAt, now)} · {a!.bidCount} {a!.bidCount === 1 ? 'bid' : 'bids'}{a!.hasReserve && !a!.reserveMet ? ' · reserve not met' : ''}</Text>
                </View>
            ) : null}
            {a?.iAmHighBidder && open ? <Notice tone="ok" text="You’re the highest bidder." /> : null}
            {error ? <Notice tone="error" text={error} /> : null}

            {l.isMine ? <Text style={s.sub}>This is your item.</Text> : open ? (
                <View style={{ gap: 10 }}>
                    <Field label={`Your max bid (at least ${formatKwacha(a!.minNextBid)})`} value={bid} onChangeText={(v) => { setBid(v.replace(/[^0-9.]/g, '')); setError(null); }} keyboardType="decimal-pad" placeholder={String(a!.minNextBid)} />
                    <Field label="Mobile money number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0971234567" hint="The winner pays with it." />
                    <Btn label="Place bid" onPress={placeBid} busy={busy === 'bid'} />
                    {a!.buyNowPrice ? <Btn label={`Buy it now · ${formatKwacha(a!.buyNowPrice)}`} kind="dark" onPress={buyNow} busy={busy === 'buy'} /> : null}
                </View>
            ) : a?.status === 'SOLD' && a.iWon ? (
                <Btn label="You won. Pay now" kind="dark" onPress={() => router.push(`/marketplace/listing/checkout?productId=${l.id}&auction=${a.id}` as any)} />
            ) : a ? <Notice tone="warn" text="This auction has ended." /> : l.inAppCheckout ? (
                <Btn label="Buy it now" kind="dark" onPress={() => router.push(`/marketplace/listing/checkout?productId=${l.id}` as any)} />
            ) : <Notice tone="warn" text={['PRODUCT', 'SERVICE_FIXED', 'SERVICE_BOOKING', 'SERVICE_BOOKING_DAILY'].includes(l.productType) ? `${l.seller.name} hasn’t finished setting up MoneyWise payments, so this can’t be bought yet.` : 'Donations, quotes and digital items can’t be paid for in the app yet.'} />}

            <View style={s.seller}>
                <Text style={s.sellerName}>{l.seller.name}{l.seller.verified ? '  ' : ''}{l.seller.verified ? <BadgeCheck size={14} color={colors.blue} /> : null}</Text>
                {l.seller.location ? <View style={s.meta}><MapPin size={13} color={colors.textMuted} /><Text style={s.sub}>{l.seller.location}</Text></View> : null}
                {l.seller.rating.count > 0 ? <View style={s.meta}><Star size={13} color="#F59E0B" /><Text style={s.sub}>{l.seller.rating.average.toFixed(1)} · {l.seller.rating.count} {l.seller.rating.count === 1 ? 'review' : 'reviews'}</Text></View> : null}
            </View>
            {l.description ? <><Text style={s.head}>About this item</Text><Text style={s.body}>{l.description}</Text></> : null}
            <Pressable onPress={() => router.push('/marketplace' as any)}><Text style={s.link}>Keep shopping</Text></Pressable>
        </Screen>
    );
}

const s = StyleSheet.create({
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C4C7C5' },
    dotOn: { backgroundColor: '#111' },
    name: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text, lineHeight: 25, marginTop: 6 },
    price: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.text },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted },
    seller: { gap: 4, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 14, marginTop: 6 },
    sellerName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    head: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text, marginTop: 6 },
    body: { fontFamily: fonts.body, fontSize: 13.5, color: colors.text, lineHeight: 20 },
    link: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue, textAlign: 'center', marginTop: 10 },
});
