import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, X, AlertCircle, ChevronRight } from 'lucide-react-native';
import { requisitionService, organizationService, formatKwacha } from 'core';
import { EXTERNAL_LOAN_PROVIDERS, type LoanProvider } from '../../src/data/loanCatalog';
import { LoanLogo } from '../../src/components/loans/LoanLogo';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Stage = 1 | 2 | 3;
const REPAYMENT_OPTIONS = [3, 6, 12, 18, 24, 36];

/** Native port of apps/web/src/components/requisitions/MobileStaffLoanWizard.tsx. */
export default function NewStaffLoanScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const { data: org } = useQuery({ queryKey: ['organization'], queryFn: () => organizationService.getOrganization() });

    const [stage, setStage] = useState<Stage>(1);
    const [providerId, setProviderId] = useState<string | null>(null);
    const [productId, setProductId] = useState<string | null>(null);
    const [staffName, setStaffName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [amount, setAmount] = useState('');
    const [repaymentPeriod, setRepaymentPeriod] = useState(12);
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const providers: LoanProvider[] = [
        {
            id: 'internal', name: 'Internal Organization',
            description: `Direct staff loan from ${org?.name ?? 'your organisation'} with favourable rates.`,
            logo: null,
            products: [{ id: 'standard', name: 'Standard Staff Loan', interest: 15, maxPeriod: 36 }],
        },
        ...EXTERNAL_LOAN_PROVIDERS,
    ];

    const provider = providers.find((p) => p.id === providerId);
    const product = provider?.products.find((p) => p.id === productId);
    const numericAmount = Number(amount) || 0;
    const interestRate = product?.interest ?? 15;
    const totalRepayment = numericAmount * (1 + interestRate / 100);
    const monthlyDeduction = repaymentPeriod > 0 ? totalRepayment / repaymentPeriod : 0;

    const title = stage === 1 ? 'New Staff Loan' : stage === 2 ? (provider?.name ?? 'New Staff Loan') : `${provider?.name ?? ''} — ${product?.name ?? ''}`;

    const goBack = () => {
        if (stage === 1) router.back();
        else setStage((s) => (s - 1) as Stage);
    };

    const submit = async () => {
        if (!staffName.trim()) { setError("Please enter the staff member's name."); return; }
        if (!employeeId.trim()) { setError('Please enter the employee ID.'); return; }
        if (numericAmount <= 0) { setError('Please enter a valid loan amount.'); return; }
        setError(null);
        setSubmitting(true);
        try {
            await requisitionService.create({
                description: `LOAN: ${staffName} - ${provider?.name} - ${product?.name} - ${remarks || 'Staff Loan'}`,
                department: 'HR',
                type: 'LOAN',
                estimated_total: numericAmount,
                staff_name: staffName,
                employee_id: employeeId,
                loan_amount: numericAmount,
                repayment_period: repaymentPeriod,
                interest_rate: interestRate,
                monthly_deduction: monthlyDeduction,
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
            <View style={styles.header}>
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
                        <Text style={styles.stepTitle}>Select a Provider</Text>
                        <Text style={styles.stepSub}>Choose where you want to request your loan from.</Text>
                        {providers.map((p) => (
                            <Pressable key={p.id} style={styles.providerRow} onPress={() => { setProviderId(p.id); setStage(2); }}>
                                <LoanLogo logo={p.logo} orgLogoUrl={org?.logo_url} size={48} />
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
                        <Text style={styles.stepSub}>Choose a loan product from {provider.name}.</Text>
                        {provider.products.map((p) => (
                            <Pressable key={p.id} style={styles.productRow} onPress={() => { setProductId(p.id); setStage(3); }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.providerName}>{p.name}</Text>
                                    <View style={styles.pillRow}>
                                        <View style={styles.interestPill}><Text style={styles.interestPillText}>{p.interest}% Interest</Text></View>
                                        <View style={styles.periodPill}><Text style={styles.periodPillText}>Up to {p.maxPeriod}mo</Text></View>
                                    </View>
                                </View>
                                <ChevronRight size={18} color={colors.textFaint} />
                            </Pressable>
                        ))}
                    </>
                )}

                {stage === 3 && product && provider && (
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Text style={styles.stepTitle}>Loan Details</Text>
                        <Text style={styles.stepSub}>Fill in the details for your {product.name}.</Text>

                        <Text style={styles.label}>Staff Member Name</Text>
                        <TextInput style={styles.input} value={staffName} onChangeText={setStaffName} placeholder="Enter full name" placeholderTextColor={colors.textFaint} />

                        <Text style={[styles.label, styles.spaced]}>Employee ID</Text>
                        <TextInput style={styles.input} value={employeeId} onChangeText={setEmployeeId} placeholder="e.g. EMP-001" placeholderTextColor={colors.textFaint} />

                        <Text style={[styles.label, styles.spaced]}>Loan Amount (K)</Text>
                        <TextInput style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />

                        <Text style={[styles.label, styles.spaced]}>Repayment Period</Text>
                        <View style={styles.periodGrid}>
                            {REPAYMENT_OPTIONS.filter((m) => m <= product.maxPeriod).map((m) => (
                                <Pressable key={m} style={[styles.periodBtn, repaymentPeriod === m && styles.periodBtnActive]} onPress={() => setRepaymentPeriod(m)}>
                                    <Text style={[styles.periodBtnText, repaymentPeriod === m && styles.periodBtnTextActive]}>{m}mo</Text>
                                </Pressable>
                            ))}
                        </View>

                        <Text style={[styles.label, styles.spaced]}>Additional Remarks (optional)</Text>
                        <TextInput style={[styles.input, styles.multiline]} value={remarks} onChangeText={setRemarks} multiline placeholder="Any notes…" placeholderTextColor={colors.textFaint} />

                        {numericAmount > 0 && (
                            <View style={styles.previewCard}>
                                <Text style={styles.previewLabel}>REPAYMENT PREVIEW</Text>
                                <View style={styles.previewRow}>
                                    <Text style={styles.previewRowLabel}>Monthly Deduction (Payroll)</Text>
                                    <Text style={styles.previewRowValueBig}>{formatKwacha(monthlyDeduction)}</Text>
                                </View>
                                <View style={styles.previewRow}>
                                    <Text style={styles.previewRowLabel}>Total (incl. {interestRate}% interest)</Text>
                                    <Text style={styles.previewRowValue}>{formatKwacha(totalRepayment)}</Text>
                                </View>
                            </View>
                        )}
                    </KeyboardAvoidingView>
                )}
            </ScrollView>

            {stage === 3 && (
                <View style={styles.footer}>
                    <Pressable
                        style={[styles.submitBtn, (submitting || numericAmount <= 0 || !staffName.trim() || !employeeId.trim()) && styles.submitBtnDisabled]}
                        onPress={submit}
                        disabled={submitting || numericAmount <= 0 || !staffName.trim() || !employeeId.trim()}
                    >
                        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Submit Request</Text>}
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
    interestPill: { backgroundColor: colors.tabActiveBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    interestPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.blue, textTransform: 'uppercase', letterSpacing: 0.4 },
    periodPill: { backgroundColor: colors.canvasAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    periodPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    label: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    spaced: { marginTop: 16 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg,
        paddingHorizontal: 16, paddingVertical: 13,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    periodBtn: {
        width: '31%', paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border,
    },
    periodBtnActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    periodBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    periodBtnTextActive: { color: '#FFFFFF' },
    previewCard: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 20, marginTop: 20, gap: 14 },
    previewLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    previewRowLabel: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
    previewRowValueBig: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#FFFFFF' },
    previewRowValue: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    footer: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    submitBtn: { backgroundColor: colors.text, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    submitBtnDisabled: { backgroundColor: colors.borderStrong },
    submitBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
