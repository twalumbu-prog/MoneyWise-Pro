import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Search, ChevronRight } from 'lucide-react-native';
import { TYPE_CONFIG } from '../../../src/data/investCatalog';
import { useInvestProviders } from '../../../src/hooks/useInvestProviders';
import { InvestLogo } from '../../../src/components/invest/InvestLogo';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { AnimatedSegmented, AnimatedTabContent } from '../../../src/components/AnimatedTabs';
import { colors, fonts, radius } from '../../../src/theme/tokens';

type InvestTab = 'HOME' | 'TRENDING' | 'UNIT_TRUSTS';
const TABS: { id: InvestTab; label: string }[] = [
    { id: 'HOME', label: 'Home' },
    { id: 'TRENDING', label: 'Trending' },
    { id: 'UNIT_TRUSTS', label: 'Unit Trusts' },
];

/** Invest browsing home, matching apps/web/src/pages/invest/InvestHome.tsx's mobile layout. */
export default function InvestHomeScreen() {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<InvestTab>('HOME');
    const providers = useInvestProviders();

    const groups = useMemo(() => providers.flatMap((provider) => {
        let products = provider.products;
        if (tab === 'TRENDING') products = products.filter((p) => p.trending);
        if (tab === 'UNIT_TRUSTS') products = products.filter((p) => p.type === 'UNIT_TRUST');
        if (search) {
            const q = search.toLowerCase();
            products = products.filter((p) => p.name.toLowerCase().includes(q) || provider.name.toLowerCase().includes(q));
        }
        return products.length === 0 ? [] : [{ provider, products }];
    }), [providers, tab, search]);

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Invest" />

            <View style={styles.searchWrap}>
                <Search size={16} color={colors.textFaint} />
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search investment products"
                    placeholderTextColor={colors.textFaint}
                />
            </View>

            <AnimatedSegmented
                value={tab}
                onChange={(v) => setTab(v as InvestTab)}
                trackStyle={styles.tabRow}
                indicatorStyle={styles.tabIndicator}
                itemStyle={styles.tab}
                items={TABS.map((t) => ({
                    value: t.id,
                    content: <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>,
                }))}
            />

            <AnimatedTabContent tabKey={tab} index={TABS.findIndex((t) => t.id === tab)} style={{ flex: 1 }}>
            <FlatList
                data={groups}
                keyExtractor={(g) => g.provider.id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No results{search ? ` for "${search}"` : ''}</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={styles.group}>
                        <View style={styles.groupHeader}>
                            <View style={styles.groupHeaderMain}>
                                <InvestLogo logo={item.provider.logo} size={32} />
                                <Text style={styles.providerName} numberOfLines={1}>{item.provider.name}</Text>
                            </View>
                            <Pressable style={styles.seeMore} onPress={() => router.push(`/apps/invest/company/${item.provider.id}`)}>
                                <Text style={styles.seeMoreText}>See more</Text>
                                <ChevronRight size={13} color={colors.text} />
                            </Pressable>
                        </View>

                        <View style={styles.card}>
                            {item.products.map((product, idx) => (
                                <Pressable
                                    key={product.id}
                                    onPress={() => router.push(`/apps/invest/product/${product.id}`)}
                                    style={[styles.row, idx > 0 && styles.rowBorder]}
                                >
                                    <View style={styles.rowMain}>
                                        <View style={styles.rowTitleLine}>
                                            <Text style={styles.rowTitle}>{product.name}</Text>
                                            {product.isNew && (
                                                <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
                                            )}
                                        </View>
                                        <Text style={styles.rowPerf}>▲ {product.performance}  <Text style={styles.rowPerfMuted}>Last Updated {product.lastUpdated}</Text></Text>
                                        <View style={styles.rowMeta}>
                                            <View style={styles.typePill}>
                                                <View style={[styles.typeDot, { backgroundColor: TYPE_CONFIG[product.type].dot }]} />
                                                <Text style={styles.typePillText}>{TYPE_CONFIG[product.type].label}</Text>
                                            </View>
                                            <Text style={styles.investorsText}>{product.investors} Investors</Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={20} color={colors.text} />
                                </Pressable>
                            ))}
                        </View>
                    </View>
                )}
            />
            </AnimatedTabContent>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 6,
        backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, paddingHorizontal: 16, height: 48,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
    tabRow: {
        flexDirection: 'row', gap: 4, marginHorizontal: 16, marginTop: 12, padding: 4,
        backgroundColor: colors.chipActiveBg, borderRadius: radius.pill,
    },
    tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
    tabIndicator: {
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    tabText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    tabTextActive: { color: colors.text },
    list: { padding: 16, paddingTop: 12, gap: 24 },
    group: { gap: 8 },
    groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
    groupHeaderMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    providerName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, flexShrink: 1 },
    seeMore: { flexDirection: 'row', alignItems: 'center', gap: 1 },
    seeMoreText: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowMain: { flex: 1, gap: 4 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
    newBadge: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
    newBadgeText: { fontFamily: fonts.bodyBold, fontSize: 8, color: '#FFFFFF' },
    rowPerf: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#16A34A' },
    rowPerfMuted: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted, fontWeight: '400' },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    typePill: {
        flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface,
        borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 0.5, borderColor: colors.border,
    },
    typeDot: { width: 5, height: 5, borderRadius: 2.5 },
    typePillText: { fontFamily: fonts.bodyMedium, fontSize: 8, color: colors.textMuted },
    investorsText: { fontFamily: fonts.bodyMedium, fontSize: 8, color: colors.textMuted },
    empty: { paddingVertical: 60, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
});
