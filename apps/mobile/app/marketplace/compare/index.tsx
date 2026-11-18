import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { apiJson } from 'core';
import { Screen, Card, Chip, SearchBox, Loading, Empty, ErrorNote } from '../../../src/components/marketplace/ui';
import type { CatalogBrowse } from '../../../src/lib/marketplace';
import { unitText } from '../../../src/lib/marketplace';
import { colors, fonts } from '../../../src/theme/tokens';

/** Pick what you want to buy; the next screen compares the places selling it. */
export default function CompareHome() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [term, setTerm] = useState('');
    const [category, setCategory] = useState('');
    useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 350); return () => clearTimeout(t); }, [query]);

    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['compare', 'catalog', term, category],
        queryFn: () => apiJson<CatalogBrowse>(`/marketplace/catalog?${new URLSearchParams({ vertical: 'ALL', ...(term ? { q: term } : {}), ...(category ? { category } : {}) }).toString()}`),
        staleTime: 60_000, retry: false,
    });

    return (
        <Screen title="Compare prices" scroll={false}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <SearchBox value={query} onChangeText={setQuery} placeholder="Search cement, rice, cooking oil…" />
                {data?.categories?.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        <Chip label="All" on={!category} onPress={() => setCategory('')} />
                        {data.categories.map((c) => <Chip key={c.name} label={c.name} on={category === c.name} onPress={() => setCategory(category === c.name ? '' : c.name)} />)}
                    </ScrollView>
                ) : null}
                {isPending ? <Loading /> : isError ? <ErrorNote text={(error as any)?.message || 'Couldn’t load the list.'} onRetry={() => refetch()} />
                    : data.needsMigration ? <Empty text="Price comparison isn’t switched on yet." />
                    : data.items.length === 0 ? <Empty text="Nothing matches that. Try another word." />
                    : data.items.map((i) => (
                        <Card key={i.id} onPress={() => router.push(`/marketplace/compare/${i.slug}` as any)}>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.name}>{i.name}</Text>
                                    <Text style={styles.sub}>{i.category} · per {unitText(i)}</Text>
                                </View>
                                <ChevronRight size={18} color={colors.textFaint} />
                            </View>
                        </Card>
                    ))}
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    scroll: { padding: 20, gap: 12, paddingBottom: 60 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
