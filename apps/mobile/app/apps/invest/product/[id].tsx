import { useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal,
    ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Star, Users, X } from 'lucide-react-native';
import {
    requisitionService, generateDailyHistory, generateIntradayHistory, sliceForTimeframe,
} from 'core';
import type { Timeframe } from 'core';
import { findProduct } from '../../../../src/data/investCatalog';
import { InvestLogo } from '../../../../src/components/invest/InvestLogo';
import { InvestAreaChart } from '../../../../src/components/invest/InvestAreaChart';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';

const CHART_WIDTH = Dimensions.get('window').width - 40;

/**
 * Product detail — chart + about, matching InvestProductDetail.tsx /
 * MobileInvestWizard.tsx's stage-3 view. The "Invest" CTA opens the same
 * amount/frequency/remarks form as MobileInvestWizard's stage 4 and submits
 * through the real requisitionService.create() — the actual, backend-connected
 * half of web's invest feature. Web's separate InvestPaymentFlow +
 * investCertificate.ts (a canvas-drawn PDF) sits behind that decorative path;
 * it creates no real record (no requisition, no ledger entry — the whole
 * apps/web/src/pages/invest tree has zero API calls), so this consolidates
 * both of web's "invest" entry points into the one flow that actually does
 * something, rather than porting a canvas certificate generator for a
 * transaction that never happened.
 */
export default function InvestProductDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const found = findProduct(String(id));
    const [timeframe, setTimeframe] = useState<Timeframe>('1M');
    const [sheetOpen, setSheetOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [frequency, setFrequency] = useState<'ONCE' | 'MONTHLY'>('MONTHLY');
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    const openSheet = () => {
        setError(null);
        setSheetOpen(true);
    };

    const submit = async () => {
        const numeric = Number(amount.replace(/[^0-9.]/g, ''));
        if (!numeric || numeric <= 0) {
            setError('Please enter a valid investment amount.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await requisitionService.create({
                description: `INVESTMENT: ${provider.name} - ${product.name} (${frequency})${remarks ? ` — ${remarks}` : ''}`,
                department: 'HR',
                type: 'OTHER',
                estimated_total: numeric,
                items: [{ description: `Investment Deduction - ${product.name}`, quantity: 1, unit_price: numeric, estimated_amount: numeric }],
            });
            setSheetOpen(false);
            setAmount('');
            setRemarks('');
            Alert.alert('Investment submitted', 'Your request has gone to Approvals for review.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

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
                <Pressable style={styles.investBtn} onPress={openSheet}>
                    <Text style={styles.investBtnText}>Invest</Text>
                </Pressable>
            </View>

            <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
                <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={styles.sheet}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Investment Setup</Text>
                            <Pressable onPress={() => setSheetOpen(false)} hitSlop={8}><X size={20} color={colors.textFaint} /></Pressable>
                        </View>
                        <Text style={styles.sheetSub}>Configure your investment for {product.name}</Text>

                        {error && (
                            <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
                        )}

                        <Text style={styles.label}>Amount (K)</Text>
                        <TextInput
                            style={styles.input} value={amount} onChangeText={setAmount}
                            keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint}
                        />

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
                        <TextInput
                            style={[styles.input, styles.multiline]} value={remarks} onChangeText={setRemarks}
                            multiline placeholder="Any notes…" placeholderTextColor={colors.textFaint}
                        />

                        <Pressable style={[styles.submitBtn, (submitting || !amount) && styles.submitBtnDisabled]} onPress={submit} disabled={submitting || !amount}>
                            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Confirm Investment</Text>}
                        </Pressable>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
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
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 4 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    sheetSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: 10 },
    errorBox: { backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: 12, marginBottom: 10 },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger },
    label: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    spaced: { marginTop: 16 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    freqRow: { flexDirection: 'row', gap: 8 },
    freqBtn: {
        flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border,
    },
    freqBtnActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    freqText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    freqTextActive: { color: '#FFFFFF' },
    freqSub: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    freqSubActive: { color: 'rgba(255,255,255,0.6)' },
    submitBtn: { marginTop: 20, backgroundColor: colors.navy, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
