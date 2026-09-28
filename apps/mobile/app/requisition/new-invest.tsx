import { useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Dimensions,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, X, AlertCircle, ChevronRight, Star, Users } from 'lucide-react-native';
import {
    requisitionService, generateDailyHistory, generateIntradayHistory, sliceForTimeframe,
} from 'core';
import type { Timeframe } from 'core';
import { useInvestProviders } from '../../src/hooks/useInvestProviders';
import { InvestLogo } from '../../src/components/invest/InvestLogo';
import { InvestAreaChart } from '../../src/components/invest/InvestAreaChart';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Stage = 1 | 2 | 3 | 4;
const CHART_WIDTH = Dimensions.get('window').width - 40;

/**
 * Native port of apps/web/src/components/requisitions/MobileInvestWizard.tsx
 * — a requisition-creating investment REQUEST (goes through the normal
 * approval chain), distinct from Menu > Invest's real Lenco-collection
 * deposit flow. Reuses the same provider catalog and area chart already
 * built for that other flow rather than re-deriving them, since both draw
 * from the same demo product data.
 */
export default function NewInvestRequestScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const insets = useSafeAreaInsets();

    const [stage, setStage] = useState<Stage>(1);
    const [providerId, setProviderId] = useState<string | null>(null);
    const [productId, setProductId] = useState<string | null>(null);
    const [timeframe, setTimeframe] = useState<Timeframe>('1M');
    const [amount, setAmount] = useState('');
    const [frequency, setFrequency] = useState<'ONCE' | 'MONTHLY'>('MONTHLY');
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const providers = useInvestProviders();
    const provider = providers.find((p) => p.id === providerId);
    const product = provider?.products.find((p) => p.id === productId);
    const numericAmount = Number(amount) || 0;

    const chartPoints = useMemo(() => {
        if (!product) return [];
        const daily = generateDailyHistory(product.id, product.price, product.ytd, product.type);
        const intraday = generateIntradayHistory(product.id, daily);
        return sliceForTimeframe(daily, intraday, timeframe);
    }, [product, timeframe]);

    const title = stage === 1 ? 'Invest' : stage === 2 ? (provider?.name ?? 'Invest') : `${provider?.name ?? ''} — ${product?.name ?? ''}`;

    const goBack = () => {
        if (stage === 1) router.back();
        else setStage((s) => (s - 1) as Stage);
    };

    const submit = async () => {
        if (numericAmount <= 0) { setError('Please enter a valid investment amount.'); return; }
        setError(null);
        setSubmitting(true);
        try {
            await requisitionService.create({
                description: `INVESTMENT: ${provider?.name} - ${product?.name} (${frequency})`,
                department: 'HR',
                type: 'OTHER',
                estimated_total: numericAmount,
                items: [{ description: `Investment Deduction - ${product?.name}`, quantity: 1, unit_price: numericAmount, estimated_amount: numericAmount }],
            } as any);
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            router.back();
        } catch (e: any) {
            setError(e?.message ?? 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
                <Pressable onPress={goBack} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
                <Pressable onPress={() => router.back()} hitSlop={10}><X size={22} color={colors.textFaint} /></Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                {error && (
                    <View style={styles.errorCard}><AlertCircle size={15} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
                )}

                {stage === 1 && (
                    <>
                        <Text style={styles.stepTitle}>Choose a Partner</Text>
                        <Text style={styles.stepSub}>Select an investment provider to see their products.</Text>
                        {providers.map((p) => (
                            <Pressable key={p.id} style={styles.providerRow} onPress={() => { setProviderId(p.id); setStage(2); }}>
                                <InvestLogo logo={p.logo} size={48} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.providerName}>{p.name}</Text>
                                    <Text style={styles.providerDesc} numberOfLines={2}>{p.description}</Text>
                                </View>
                                <ChevronRight size={18} color={colors.textFaint} />
                            </Pressable>
                        ))}
                    </>
                )}

                {stage === 2 && provider && (
                    <>
                        <Text style={styles.stepTitle}>Select a Product</Text>
                        <Text style={styles.stepSub}>Available investment options from {provider.name}.</Text>
                        {provider.products.map((p) => (
                            <Pressable key={p.id} style={styles.productRow} onPress={() => { setProductId(p.id); setStage(3); }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.providerName}>{p.name}</Text>
                                    <View style={styles.pillRow}>
                                        <View style={styles.interestPill}><Text style={styles.interestPillText}>{p.expectedReturn} Return</Text></View>
                                        <View style={styles.periodPill}><Text style={styles.periodPillText}>{p.risk} Risk</Text></View>
                                    </View>
                                </View>
                                <ChevronRight size={18} color={colors.textFaint} />
                            </Pressable>
                        ))}
                    </>
                )}

                {stage === 3 && product && provider && (
                    <>
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

                        <View style={styles.statsRow}>
                            <View style={styles.statItem}><Star size={13} color="#EAB308" fill="#EAB308" /><Text style={styles.statText}>{product.reviews}</Text></View>
                            <View style={styles.statItem}><Users size={13} color={colors.text} /><Text style={styles.statText}>{product.investors}</Text></View>
                        </View>
                        <Text style={styles.description}>{product.description}</Text>

                        <Pressable style={styles.investBtn} onPress={() => setStage(4)}>
                            <Text style={styles.investBtnText}>Invest</Text>
                        </Pressable>
                    </>
                )}

                {stage === 4 && product && (
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Text style={styles.stepTitle}>Investment Setup</Text>
                        <Text style={styles.stepSub}>Configure your investment for {product.name}</Text>

                        <Text style={styles.label}>Amount (K)</Text>
                        <TextInput style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />

                        <Text style={[styles.label, styles.spaced]}>Deduction Frequency</Text>
                        <View style={styles.freqRow}>
                            <Pressable style={[styles.freqBtn, frequency === 'ONCE' && styles.freqBtnActive]} onPress={() => setFrequency('ONCE')}>
                                <Text style={[styles.freqText, frequency === 'ONCE' && styles.freqTextActive]}>One-Time</Text>
                            </Pressable>
                            <Pressable style={[styles.freqBtn, frequency === 'MONTHLY' && styles.freqBtnActive]} onPress={() => setFrequency('MONTHLY')}>
                                <Text style={[styles.freqText, frequency === 'MONTHLY' && styles.freqTextActive]}>Auto-Invest</Text>
                                <Text style={[styles.freqSub, frequency === 'MONTHLY' && styles.freqSubActive]}>MONTHLY PAYROLL</Text>
                            </Pressable>
                        </View>

                        <Text style={[styles.label, styles.spaced]}>Additional Remarks (optional)</Text>
                        <TextInput style={[styles.input, styles.multiline]} value={remarks} onChangeText={setRemarks} multiline placeholder="Any notes…" placeholderTextColor={colors.textFaint} />
                    </KeyboardAvoidingView>
                )}
            </ScrollView>

            {stage === 4 && (
                <View style={styles.footer}>
                    <Pressable style={[styles.submitBtn, (submitting || numericAmount <= 0) && styles.submitBtnDisabled]} onPress={submit} disabled={submitting || numericAmount <= 0}>
                        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Confirm Investment</Text>}
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginHorizontal: 8 },
    scroll: { padding: 20, gap: 4, paddingBottom: 40 },
    errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FEF2F2', borderRadius: radius.lg, padding: 14, marginBottom: 12 },
    errorText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, lineHeight: 17 },
    stepTitle: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text },
    stepSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginTop: 4, marginBottom: 18 },
    providerRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg,
        borderWidth: 1, borderColor: colors.border, marginBottom: 12,
    },
    productRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: radius.lg,
        borderWidth: 1, borderColor: colors.border, marginBottom: 12,
    },
    providerName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    providerDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    pillRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    interestPill: { backgroundColor: '#ECFDF5', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    interestPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.4 },
    periodPill: { backgroundColor: colors.canvasAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    periodPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    priceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
    code: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
    priceLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },
    price: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.text },
    priceUnit: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
    ytd: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#16A34A', marginTop: 4 },
    chartCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
    statsRow: { flexDirection: 'row', gap: 20, marginBottom: 12 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statText: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
    description: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 20, marginBottom: 20 },
    investBtn: { backgroundColor: colors.text, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    investBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
    label: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    spaced: { marginTop: 16 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg,
        paddingHorizontal: 16, paddingVertical: 13,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    freqRow: { flexDirection: 'row', gap: 8 },
    freqBtn: {
        flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border,
    },
    freqBtnActive: { backgroundColor: colors.text, borderColor: colors.text },
    freqText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    freqTextActive: { color: '#FFFFFF' },
    freqSub: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    freqSubActive: { color: 'rgba(255,255,255,0.6)' },
    footer: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    submitBtn: { backgroundColor: colors.text, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    submitBtnDisabled: { backgroundColor: colors.borderStrong },
    submitBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
