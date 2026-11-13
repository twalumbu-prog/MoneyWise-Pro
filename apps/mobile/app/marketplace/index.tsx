import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, TextInput, ScrollView, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, X, Gavel } from 'lucide-react-native';
import { apiJson, formatKwacha } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Loading, Empty, ErrorNote } from '../../src/components/marketplace/ui';
import type { ImportBrowse, ImportCard } from '../../src/lib/marketplace';
import { daysRange } from '../../src/lib/marketplace';
import type { LocalListing, ListingsResponse } from '../../src/lib/listings';
import { listingPrice } from '../../src/lib/listings';
import { resized } from '../../src/lib/images';
import { colors, fonts } from '../../src/theme/tokens';

type Item = { key: string; title: string; price: string; note: string; sub: string; image: string | null; tag: 'Local' | 'International'; category: string | null; auction: boolean; open: string };

const ink = '#191919';
const fromLocal = (l: LocalListing): Item => {
    const a = l.auction?.status === 'OPEN' ? l.auction : null;
    return { key: `l-${l.id}`, title: l.name, price: listingPrice(l), note: a ? `Auction · ${a.bidCount} ${a.bidCount === 1 ? 'bid' : 'bids'}` : l.inAppCheckout ? 'Buy It Now' : '', sub: l.seller.location || l.seller.name, image: l.imageUrl ?? l.images?.[0] ?? null, tag: 'Local', category: l.category, auction: !!a, open: `/marketplace/listing/${l.id}` };
};
const fromImport = (p: ImportCard): Item => ({ key: `i-${p.id}`, title: p.title, price: p.perItemZmw != null ? `${p.estimated || p.vehicleEstimate ? 'about ' : ''}${formatKwacha(p.perItemZmw)}` : 'Price on request', note: `Arrives in ${daysRange(p.deliveryDaysMin, p.deliveryDaysMax)}`, sub: p.store ?? 'Overseas', image: p.images?.[0] ?? null, tag: 'International', category: p.category, auction: false, open: `/marketplace/imported/${p.id}` });

/** Every local item leads; one international item is let in after every few local ones, and the rest follow once the local items run out. */
const LOCAL_PER_INTERNATIONAL = 4;
function blend(local: Item[], international: Item[]): Item[] {
    const out: Item[] = [];
    let j = 0;
    local.forEach((l, i) => {
        out.push(l);
        if ((i + 1) % LOCAL_PER_INTERNATIONAL === 0 && j < international.length) out.push(international[j++]);
    });
    return [...out, ...international.slice(j)];
}

/**
 * The Marketplace laid out like eBay's Android app: a rounded search bar, round "Popular categories", coloured promo cards with a dark pill
 * button, and item cards with the price and a "Buy It Now" line. Local and international items are ONE feed: local items come first and
 * get the most room, international ones are mixed in behind them, and every card says which it is ("Local" or "International").
 */
export default function MarketplaceHome() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const [query, setQuery] = useState(''); const [term, setTerm] = useState('');
    const [auctionsOnly, setAuctionsOnly] = useState(false);
    const [category, setCategory] = useState('');
    useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 400); return () => clearTimeout(t); }, [query]);

    const local = useQuery({ queryKey: ['marketplace', 'listings'], queryFn: () => apiJson<ListingsResponse>('/marketplace/listings'), staleTime: 60_000, retry: false });
    const imports = useInfiniteQuery({
        queryKey: ['marketplace', 'imports', term, category, ''],
        initialPageParam: 0,
        enabled: !auctionsOnly,
        queryFn: ({ pageParam }) => apiJson<ImportBrowse>(`/marketplace/imports?page=${pageParam}${term ? `&q=${encodeURIComponent(term)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`),
        getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
        placeholderData: keepPreviousData, staleTime: 60_000, retry: false,
    });

    const localItems = useMemo(() => {
        const q = term.toLowerCase();
        return (local.data?.listings ?? [])
            .filter((l) => (!auctionsOnly || l.auction?.status === 'OPEN') && (!category || l.category === category) && (!q || `${l.name} ${l.description ?? ''} ${l.category ?? ''} ${l.seller.name}`.toLowerCase().includes(q)))
            .map(fromLocal);
    }, [local.data, auctionsOnly, term, category]);
    const importItems = useMemo(() => (auctionsOnly ? [] : (imports.data?.pages.flatMap((p) => p.products) ?? []).map(fromImport)), [imports.data, auctionsOnly]);

    // Popular categories: the biggest across both, each with a picture taken from an item in it.
    const cats = useMemo(() => {
        const counts = new Map<string, number>(); const pic = new Map<string, string>();
        (local.data?.categories ?? []).forEach((c) => counts.set(c.name, (counts.get(c.name) ?? 0) + c.count));
        (imports.data?.pages[0]?.categories ?? []).forEach((c) => counts.set(c.name, (counts.get(c.name) ?? 0) + c.count));
        [...(local.data?.listings ?? []).map(fromLocal), ...importItems].forEach((i) => { if (i.category && i.image && !pic.has(i.category)) pic.set(i.category, i.image); });
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name]) => ({ name, image: pic.get(name) ?? null }));
    }, [local.data, imports.data, importItems]);

    const browsing = !term && !category && !auctionsOnly;
    const results = useMemo(() => blend(localItems, importItems), [localItems, importItems]);

    const wantsImports = !auctionsOnly;
    const loading = auctionsOnly ? local.isPending : local.isPending && imports.isPending;
    const failed = auctionsOnly ? local.isError : local.isError && imports.isError;
    const open = (i: Item) => router.push(i.open as any);
    const cell = Math.floor((width - 16 * 2 - 12) / 2);

    const head = (
        <View style={{ gap: 14 }}>
            <View style={s.search}>
                <Search size={20} color={ink} />
                <TextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder="Search the Marketplace" placeholderTextColor="#707070" returnKeyType="search" autoCorrect={false} />
                {query ? <Pressable onPress={() => setQuery('')} hitSlop={10}><X size={18} color="#707070" /></Pressable> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
                <Chip icon={Gavel} label="Auctions" on={auctionsOnly} onPress={() => setAuctionsOnly((v) => !v)} />
                {category ? <Chip icon={X} label={category} on onPress={() => setCategory('')} /> : null}
            </ScrollView>
        </View>
    );

    const browse = (
        <View style={{ gap: 30, paddingTop: 18 }}>
            {cats.length ? (
                <View style={{ gap: 14 }}>
                    <Text style={s.h1}>Popular categories</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
                        {cats.map((c) => (
                            <Pressable key={c.name} onPress={() => setCategory(c.name)} style={{ width: 82, alignItems: 'center' }}>
                                <View style={s.circle}>{c.image ? <Image source={{ uri: resized(c.image, 200, { square: true }) }} style={{ width: 76, height: 76 }} resizeMode="cover" /> : null}</View>
                                <Text style={s.circleLabel} numberOfLines={2}>{c.name}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            ) : null}

            <View style={[s.promo, { backgroundColor: '#F8DC6B' }]}>
                <Text style={s.promoTitle}>Looking for the best price?</Text>
                <Text style={s.promoText}>See what the same thing costs in different shops.</Text>
                <Pressable style={[s.promoBtn, { backgroundColor: '#5B1A0B' }]} onPress={() => router.push('/marketplace/compare' as any)}><Text style={s.promoBtnText}>Compare prices</Text></Pressable>
            </View>

            {localItems.length ? <Row title="Local picks" sub="From sellers in Zambia" items={localItems.slice(0, 12)} onOpen={open} /> : null}

            <View style={[s.promo, { backgroundColor: '#7FDDD6' }]}>
                <Text style={s.promoTitle}>Need a supplier to quote you?</Text>
                <Text style={s.promoText}>Post what you need. Suppliers send their price.</Text>
                <Pressable style={[s.promoBtn, { backgroundColor: '#0B4A6F' }]} onPress={() => router.push('/marketplace/requests' as any)}><Text style={s.promoBtnText}>Ask for quotes</Text></Pressable>
            </View>


            <View style={[s.promo, { backgroundColor: '#E9E4FB' }]}>
                <Text style={s.promoTitle}>Following an international order?</Text>
                <Text style={s.promoText}>See where it is, from bought to delivered.</Text>
                <Pressable style={[s.promoBtn, { backgroundColor: '#2D1B69' }]} onPress={() => router.push('/marketplace/imported/orders' as any)}><Text style={s.promoBtnText}>My orders</Text></Pressable>
            </View>

            {results.length ? <View><Text style={s.h1}>Everything on the Marketplace</Text><Text style={s.h1Sub}>Local items first, with international ones mixed in</Text></View> : null}
        </View>
    );

    return (
        <View style={s.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Marketplace" />
            {loading ? <Loading /> : failed ? <ErrorNote text="Couldn’t load the Marketplace." onRetry={() => { void local.refetch(); void imports.refetch(); }} /> : (
                <FlatList
                    data={results}
                    numColumns={2}
                    keyExtractor={(t) => t.key}
                    columnWrapperStyle={{ gap: 12 }}
                    contentContainerStyle={s.list}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={<>{head}{browsing ? browse : <View style={{ height: 16 }} />}{browsing ? <View style={{ height: 14 }} /> : null}</>}
                    ListEmptyComponent={<Empty text={term || category ? 'Nothing matches that. Try another word or category.' : 'Nothing to show yet.'} />}
                    renderItem={({ item }) => <Card i={item} w={cell} onPress={() => open(item)} />}
                    onEndReached={() => { if (wantsImports && imports.hasNextPage && !imports.isFetchingNextPage) void imports.fetchNextPage(); }}
                    onEndReachedThreshold={0.6}
                    ListFooterComponent={imports.isFetchingNextPage ? <ActivityIndicator color={colors.blue} style={{ margin: 16 }} /> : <View style={{ height: 40 }} />}
                />
            )}
        </View>
    );
}

function Chip({ icon: Icon, label, on, onPress }: { icon: any; label: string; on?: boolean; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]}>
            <Icon size={18} color={on ? '#fff' : ink} />
            <Text style={[s.chipText, on && { color: '#fff' }]}>{label}</Text>
        </Pressable>
    );
}

function Row({ title, sub, items, onOpen }: { title: string; sub: string; items: Item[]; onOpen: (i: Item) => void }) {
    return (
        <View style={{ gap: 12 }}>
            <View style={s.rowHead}>
                <View style={{ flex: 1 }}><Text style={s.h1}>{title}</Text><Text style={s.h1Sub}>{sub}</Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
                {items.map((i) => <Card key={i.key} i={i} w={146} onPress={() => onOpen(i)} />)}
            </ScrollView>
        </View>
    );
}

/** An item card: a rounded grey picture, a two-line title, the bold price, then "Buy It Now" (or the auction state) and where it is from. */
function Card({ i, w, onPress }: { i: Item; w: number; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} style={{ width: w, marginBottom: 14 }}>
            <View style={[s.pic, { width: w, height: w }]}>
                {i.image ? <Image source={{ uri: resized(i.image, 420, { square: true }) }} style={{ width: w, height: w }} resizeMode="cover" /> : null}
                <View style={[s.label, i.tag === 'Local' ? s.labelLocal : s.labelIntl]}><Text style={[s.labelText, i.tag === 'Local' ? { color: '#0B5D2E' } : { color: '#8A4B00' }]}>{i.tag}</Text></View>
            </View>
            <Text style={s.title} numberOfLines={2}>{i.title}</Text>
            <Text style={s.price}>{i.price}</Text>
            {i.note ? <Text style={s.note}>{i.note}</Text> : null}
            <Text style={s.meta} numberOfLines={1}>{i.sub}</Text>
        </Pressable>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },
    list: { padding: 16, paddingBottom: 60 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 999, borderWidth: 1, borderColor: '#C7C7C7', backgroundColor: '#fff', paddingHorizontal: 16 },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: ink, paddingVertical: 0 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1, borderColor: '#C7C7C7', paddingHorizontal: 16, height: 44 },
    chipOn: { backgroundColor: ink, borderColor: ink },
    chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: ink },
    h1: { fontFamily: fonts.bodyBold, fontSize: 21, color: ink, letterSpacing: -0.3 },
    h1Sub: { fontFamily: fonts.body, fontSize: 13.5, color: '#707070', marginTop: 2 },
    circle: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#F1F1F1', overflow: 'hidden' },
    circleLabel: { fontFamily: fonts.body, fontSize: 12.5, color: ink, marginTop: 6, textAlign: 'center', lineHeight: 16 },
    rowHead: { flexDirection: 'row', alignItems: 'flex-end' },
    seeAll: { fontFamily: fonts.bodyBold, fontSize: 14, color: ink, textDecorationLine: 'underline' },
    promo: { borderRadius: 22, padding: 22, gap: 10 },
    promoTitle: { fontFamily: fonts.bodyBold, fontSize: 26, color: '#2B1608', letterSpacing: -0.4, lineHeight: 31 },
    promoText: { fontFamily: fonts.body, fontSize: 15, color: '#2B1608', lineHeight: 21 },
    promoBtn: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 24, paddingVertical: 14, marginTop: 4 },
    promoBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#fff' },
    pic: { backgroundColor: '#F4F4F4', borderRadius: 16, overflow: 'hidden' },
    label: { position: 'absolute', top: 8, left: 8, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    labelLocal: { backgroundColor: '#CFF1DC' },
    labelIntl: { backgroundColor: '#FFE3BD' },
    labelText: { fontFamily: fonts.bodyBold, fontSize: 10.5 },
    title: { fontFamily: fonts.body, fontSize: 14, color: ink, marginTop: 8, lineHeight: 19 },
    price: { fontFamily: fonts.bodyBold, fontSize: 16, color: ink, marginTop: 4 },
    note: { fontFamily: fonts.body, fontSize: 12.5, color: '#3C3C3C', marginTop: 1 },
    meta: { fontFamily: fonts.body, fontSize: 12, color: '#707070', marginTop: 2 },
});
