import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Star, Users, BadgeCheck } from 'lucide-react-native';
import { INVEST_PROVIDERS, TYPE_CONFIG } from '../../../../src/data/investCatalog';
import { InvestLogo } from '../../../../src/components/invest/InvestLogo';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';

/** Provider profile + product list, matching apps/web/src/pages/invest/InvestCompany.tsx. */
export default function InvestCompanyScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const provider = INVEST_PROVIDERS.find((p) => p.id === id) ?? INVEST_PROVIDERS[0];

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title={provider.name} />

            <FlatList
                data={provider.products}
                keyExtractor={(p) => p.id}
                contentContainerStyle={styles.list}
                ListHeaderComponent={
                    <>
                        <View style={styles.banner} />
                        <View style={styles.headerCard}>
                            <View style={styles.logoWrap}><InvestLogo logo={provider.logo} size={64} /></View>
                            <View style={styles.nameRow}>
                                <Text style={styles.name}>{provider.name}</Text>
                                <BadgeCheck size={18} color={colors.blue} />
                            </View>
                            <View style={styles.statsRow}>
                                <View style={styles.statItem}><Star size={12} color="#EAB308" fill="#EAB308" /><Text style={styles.statText}>{provider.reviews}</Text></View>
                                <View style={styles.statItem}><Users size={12} color={colors.textMuted} /><Text style={styles.statText}>{provider.investors}</Text></View>
                            </View>
                        </View>
                        <Text style={styles.sectionTitle}>All Investment Products</Text>
                    </>
                }
                renderItem={({ item: product, index }) => (
                    <Pressable
                        onPress={() => router.push(`/apps/invest/product/${product.id}`)}
                        style={[styles.row, index > 0 && styles.rowBorder]}
                    >
                        <View style={styles.rowMain}>
                            <View style={styles.rowTitleLine}>
                                <Text style={styles.rowTitle}>{product.name}</Text>
                                {product.isNew && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
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
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    list: { paddingBottom: 32 },
    banner: { height: 96, backgroundColor: colors.navy },
    headerCard: { paddingHorizontal: 20, marginTop: -32, gap: 8 },
    logoWrap: {
        width: 72, height: 72, borderRadius: 18, backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center', padding: 6,
        borderWidth: 2, borderColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    name: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text },
    statsRow: { flexDirection: 'row', gap: 16 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statText: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginHorizontal: 20, marginTop: 20, marginBottom: 10 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16,
        backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    rowBorder: { borderTopWidth: 0 },
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
});
