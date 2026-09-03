import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Star, Users } from 'lucide-react-native';
import { generateDailyHistory, generateIntradayHistory, sliceForTimeframe } from 'core';
import type { Timeframe } from 'core';
import { findProduct } from '../../../../src/data/investCatalog';
import { InvestLogo } from '../../../../src/components/invest/InvestLogo';
import { InvestAreaChart } from '../../../../src/components/invest/InvestAreaChart';
import { InvestPaymentFlow } from '../../../../src/components/invest/InvestPaymentFlow';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';

const CHART_WIDTH = Dimensions.get('window').width - 40;

/**
 * Product detail — chart + about, matching InvestProductDetail.tsx. The
 * "Invest" CTA opens InvestPaymentFlow, the native port of
 * apps/web/src/pages/invest/InvestPaymentFlow.tsx (method sheet → amount
 * keypad → wallet/mobile-money/card payment → success).
 */
export default function InvestProductDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const found = findProduct(String(id));
    const [timeframe, setTimeframe] = useState<Timeframe>('1M');
    const [flowOpen, setFlowOpen] = useState(false);

    const chartPoints = useMemo(() => {
        if (!found) return [];
        const daily = generateDailyHistory(found.product.id, found.product.price, found.product.ytd, found.product.type);
        const intraday = generateIntradayHistory(found.product.id, daily);
        return sliceForTimeframe(daily, intraday, timeframe);
    }, [found, timeframe]);

    if (!found) {
        return (
            <View style={styles.root}>
                <Stack.Screen options={{ headerShown: false }} />
                <ScreenHeader title="Invest" />
                <View style={styles.empty}><Text style={styles.emptyText}>Product not found.</Text></View>
            </View>
        );
    }

    const { provider, product } = found;

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title={product.name} />

            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.priceRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.code}>{product.code}</Text>
                        <View style={styles.priceLine}>
                            <Text style={styles.price}>{product.price}</Text>
                            <Text style={styles.priceUnit}>{product.priceUnit}</Text>
                        </View>
                        <Text style={styles.ytd}>▲ {product.ytd}</Text>
                    </View>
                    <InvestLogo logo={provider.logo} size={56} />
                </View>

                <View style={styles.chartCard}>
                    <InvestAreaChart points={chartPoints} timeframe={timeframe} onTimeframeChange={setTimeframe} width={CHART_WIDTH} />
                </View>

                <View style={styles.aboutSection}>
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}><Star size={13} color="#EAB308" fill="#EAB308" /><Text style={styles.statText}>{product.reviews}</Text></View>
                        <View style={styles.statItem}><Users size={13} color={colors.text} /><Text style={styles.statText}>{product.investors}</Text></View>
                    </View>
                    <View style={styles.pillRow}>
                        <View style={styles.returnPill}><Text style={styles.returnPillText}>{product.expectedReturn} Return</Text></View>
                        <View style={styles.riskPill}><Text style={styles.riskPillText}>{product.risk} Risk</Text></View>
                    </View>
                    <Text style={styles.description}>{product.description}</Text>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Text style={styles.footerNote}>Secure payments powered by {provider.name}</Text>
                <Pressable style={styles.investBtn} onPress={() => setFlowOpen(true)}>
                    <Text style={styles.investBtnText}>Invest</Text>
                </Pressable>
            </View>

            <InvestPaymentFlow visible={flowOpen} onClose={() => setFlowOpen(false)} product={product} provider={provider} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, gap: 16, paddingBottom: 32 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    priceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    code: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
    priceLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },
    price: { fontFamily: fonts.bodyBold, fontSize: 30, color: colors.text },
    priceUnit: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
    ytd: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#16A34A', marginTop: 4 },
    chartCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border },
    aboutSection: { gap: 12 },
    statsRow: { flexDirection: 'row', gap: 20 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statText: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
    pillRow: { flexDirection: 'row', gap: 8 },
    returnPill: { backgroundColor: '#ECFDF5', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    returnPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5 },
    riskPill: { backgroundColor: colors.canvasAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    riskPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    description: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 20 },
    footer: {
        paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, gap: 10, alignItems: 'center',
        backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    },
    footerNote: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    investBtn: { width: '100%', backgroundColor: colors.navy, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    investBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
