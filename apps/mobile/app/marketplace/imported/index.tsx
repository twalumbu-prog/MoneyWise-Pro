import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { Card, Chip, SearchBox, Loading, Empty, ErrorNote, Btn } from '../../../src/components/marketplace/ui';
import type { ImportBrowse, ImportCard } from '../../../src/lib/marketplace';
import { daysRange } from '../../../src/lib/marketplace';
import { resized } from '../../../src/lib/images';
import { colors, fonts } from '../../../src/theme/tokens';

/** Things ordered for you from overseas, priced in kwacha with shipping, tax and fee included. */
export default function ImportedHome() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const cell = Math.floor((width - 20 * 2 - 12) / 2);
    const [query, setQuery] = useState(''); const [term, setTerm] = useState('');
    const [category, setCategory] = useState(''); const [store, setStore] = useState('');
    useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 450); return () => clearTimeout(t); }, [query]);

    const { data, isPending, isError, error, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
        queryKey: ['marketplace', 'imports', term, category, store],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => apiJson<ImportBrowse>(`/marketplace/imports?page=${pageParam}${term ? `&q=${encodeURIComponent(term)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}${store ? `&store=${encodeURIComponent(store)}` : ''}`),
        getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
        placeholderData: keepPreviousData, staleTime: 60_000, retry: false,
    });
    const first = data?.pages[0];
    const items = useMemo(() => data?.pages.flatMap((p) => p.products) ?? [], [data]);

    const header = (
        <View style={{ gap: 12, paddingBottom: 8 }}>
            <SearchBox value={query} onChangeText={setQuery} placeholder="Search phones, laptops, cars…" />
            {first?.stores?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Chip label="All stores" on={!store} onPress={() => setStore('')} />
                    {first.stores.map((s) => <Chip key={s.name} label={s.name} on={store === s.name} onPress={() => setStore(store === s.name ? '' : s.name)} />)}
                </ScrollView>
            ) : null}
            {first?.categories?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Chip label="Everything" on={!category} onPress={() => setCategory('')} />
                    {first.categories.slice(0, 20).map((c) => <Chip key={c.name} label={c.name} on={category === c.name} onPress={() => setCategory(category === c.name ? '' : c.name)} />)}
                </ScrollView>
            ) : null}
        </View>
    );

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Imported" />
            {isPending ? <Loading /> : isError ? <ErrorNote text={(error as any)?.message || 'Couldn’t load the products.'} onRetry={() => refetch()} /> : (
                <FlatList
                    data={items}
                    numColumns={2}
                    keyExtractor={(p) => p.id}
                    columnWrapperStyle={{ gap: 12 }}
                    contentContainerStyle={styles.list}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={<>
                        {header}
                        {first && !first.enabled ? <Empty text="Imports aren’t switched on yet." /> : null}
                        {first?.needsMigration ? <Empty text="Imports aren’t set up yet." /> : null}
                    </>}
                    ListEmptyComponent={first?.enabled ? <Empty text="Nothing matches that. Try another word, or another store." /> : null}
                    renderItem={({ item }) => <Tile p={item} size={cell} onPress={() => router.push(`/marketplace/imported/${item.id}` as any)} />}
                    onEndReached={() => { if (hasNextPage && !isFetchingNextPage) void fetchNextPage(); }}
                    onEndReachedThreshold={0.6}
                    ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={colors.blue} style={{ margin: 16 }} /> : <View style={{ height: 40 }} />}
                />
            )}
            <View style={styles.orders}><Btn label="My import orders" kind="tonal" onPress={() => router.push('/marketplace/imported/orders' as any)} /></View>
        </View>
    );
}

function Tile({ p, size, onPress }: { p: ImportCard; size: number; onPress: () => void }) {
    const img = p.images?.[0];
    return (
        <Card onPress={onPress} style={{ width: size, padding: 8 }}>
            {img ? <Image source={{ uri: resized(img, 360, { square: true }) }} style={{ width: size - 18, height: size - 18, borderRadius: 10, backgroundColor: '#F1F3F4' }} resizeMode="cover" /> : <View style={{ width: size - 18, height: size - 18, borderRadius: 10, backgroundColor: '#F1F3F4' }} />}
            <Text style={styles.name} numberOfLines={2}>{p.title}</Text>
            <Text style={styles.price}>{p.perItemZmw != null ? `${p.estimated || p.vehicleEstimate ? 'about ' : ''}${formatKwacha(p.perItemZmw)}` : 'Price on request'}</Text>
            <Text style={styles.meta}>{p.store ? `${p.store} · ` : ''}{daysRange(p.deliveryDaysMin, p.deliveryDaysMax)}</Text>
        </Card>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    list: { padding: 20, paddingBottom: 100 },
    name: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text, marginTop: 6, lineHeight: 16 },
    price: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginTop: 2 },
    meta: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted },
    orders: { position: 'absolute', left: 20, right: 20, bottom: 24 },
});
