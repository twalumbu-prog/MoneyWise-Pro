import { useEffect, useRef, useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calculatePlatformFee } from 'shared';
import {
    cashbookService, lencoService, detectMobileNetwork, formatKwacha, organizationService,
} from 'core';
import type { PaymentPhase } from '../../src/components/payments/PaymentWaitingScreen';
import { PaymentWaitingScreen } from '../../src/components/payments/PaymentWaitingScreen';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

function genReference(subaccountId: string): string {
    return `DEP-${Date.now()}-${subaccountId.substring(0, 8)}-CASHXFER`;
}

/**
 * Native port of apps/web/src/components/TransferToWalletModal.tsx — moves
 * real cash into a MoneyWise wallet via Lenco. Web opens Lenco's own JS
 * checkout widget (`window.LencoPay.getPaid`), which has no native
 * equivalent; this uses the same server-initiated mobile-money collection
 * QuickPay's public checkout already relies on in production
 * (`POST /lenco/public-collection/mobile-money` + long-poll + finalize),
 * wallet-scoped rather than auth-scoped so it's exactly as safe to call here
 * as from the unauthenticated public portal. Card payments aren't available
 * through this path (the widget offered card + mobile money; the direct
 * collection API is mobile-money only) — same "coming soon" scope trim used
 * for Card in the Invest payment flow.
 */
export default function LencoTransferScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const { organizationId } = useAuth();

    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState('');
    const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
    const [phone, setPhone] = useState('');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [phase, setPhase] = useState<PaymentPhase | 'form'>('form');
    const [elapsed, setElapsed] = useState(0);
    const [reference, setReference] = useState('');
    const cancelledRef = useRef(false);
    const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const { data: org } = useQuery({ queryKey: ['organization'], queryFn: () => organizationService.getOrganization() });
    const { data: wallets = [] } = useQuery({
        queryKey: ['wallets-lenco-transfer'],
        queryFn: async () => {
            const data = await cashbookService.getWallets();
            return (data || []).map((w: any) => ({ id: w.id, name: w.name, balance: Number(w.balance) || 0 }));
        },
    });
    const { data: overview } = useQuery({ queryKey: ['cashbook-entries', 'overview'], queryFn: () => cashbookService.getOverview() });
    const sourceBalance = overview?.externalBalances?.CASH ?? 0;

    useEffect(() => {
        if (wallets.length > 0 && !walletId) {
            const main = wallets.find((w: any) => w.is_main) ?? wallets[0];
            setWalletId(main.id);
        }
    }, [wallets, walletId]);

    const operator = phone ? (detectMobileNetwork(phone) || null) : null;

    useEffect(() => {
        if (!operator) {
            setResolvedAccountName('');
            setResolveFailed(false);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setResolvingAccountName(true);
            setResolveFailed(false);
            try {
                const res = await lencoService.resolveMobileMoney(phone, operator.toLowerCase());
                if (cancelled) return;
                setResolvedAccountName(res?.accountName || '');
                if (!res?.accountName) setResolveFailed(true);
            } catch {
                if (cancelled) return;
                setResolvedAccountName('');
                setResolveFailed(true);
            } finally {
                if (!cancelled) setResolvingAccountName(false);
            }
        }, 500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [phone, operator]);

    useEffect(() => () => { if (elapsedInterval.current) clearInterval(elapsedInterval.current); }, []);

    const gross = Number(amount) || 0;
    const platformFee = calculatePlatformFee(gross);
    const lencoFee = Math.round(gross * 0.01 * 100) / 100;
    const depositCharge = Math.round((platformFee + lencoFee) * 100) / 100;
    const netToWallet = gross > 0 ? Math.round((gross - depositCharge) * 100) / 100 : 0;
    const destWallet = wallets.find((w: any) => w.id === walletId);

    const valid = gross > 0 && gross <= sourceBalance && netToWallet > 0 && !!walletId
        && !!operator && !!resolvedAccountName && !resolvingAccountName;

    const cancel = async () => {
        cancelledRef.current = true;
        if (elapsedInterval.current) clearInterval(elapsedInterval.current);
        try { await lencoService.cancelCollection(reference); } catch { /* best-effort */ }
        setPhase('form');
    };

    const startTransfer = async () => {
        if (!organizationId || !destWallet) return;
        setError(null);
        setSubmitting(true);
        cancelledRef.current = false;

        const ref = genReference(org?.lenco_subaccount_id || organizationId);
        setReference(ref);

        try {
            await cashbookService.logWalletDepositIntent(ref, `Transfer to MoneyWise (from Cash Account)`, netToWallet, walletId);

            const initRes = await lencoService.initiateMobileMoneyCollection({
                reference: ref, amount: gross, phone, operator: operator!.toLowerCase(), walletId,
            });
            const status = initRes?.data?.status;
            if (status !== 'pay-offline' && status !== 'pending' && status !== 'successful') {
                throw new Error(`Payment could not be started (status: ${status || 'unknown'}). Please try again.`);
            }

            setSubmitting(false);
            setPhase('confirm');
            setElapsed(0);
            elapsedInterval.current = setInterval(() => setElapsed((e) => e + 1), 1000);

            for (let attempt = 0; attempt < 8; attempt++) {
                if (cancelledRef.current) return;
                setPhase((p) => (p === 'confirm' ? 'polling' : p));
                try {
                    const res = await lencoService.longPollCollectionStatus(ref, organizationId);
                    if (cancelledRef.current) return;
                    if (res.verified) {
                        if (elapsedInterval.current) clearInterval(elapsedInterval.current);
                        setPhase('success');
                        lencoService.finalizeCollection(ref, organizationId).catch(() => {});
                        try {
                            await cashbookService.transferToWallet(gross, ref, 'CASH', destWallet.name);
                        } catch { /* cash-side leg failed; the deposit itself is real and reconciles */ }
                        qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
                        return;
                    }
                } catch {
                    // transient — the loop just retries
                }
            }
            if (elapsedInterval.current) clearInterval(elapsedInterval.current);
            setError('We confirmed the request with Lenco, but it hasn\'t appeared in your ledger yet. It will reconcile automatically — check back shortly.');
            setPhase('form');
        } catch (e: any) {
            setSubmitting(false);
            setPhase('form');
            setError(e?.message ?? 'Failed to start the transfer. Please try again.');
        }
    };

    if (phase !== 'form') {
        return (
            <View style={styles.root}>
                <Stack.Screen options={{ headerShown: false }} />
                <PaymentWaitingScreen
                    phase={phase}
                    amount={gross}
                    businessName={destWallet?.name || 'your wallet'}
                    payerPhone={phone}
                    operator={operator}
                    elapsedSeconds={elapsed}
                    reference={reference}
                    onCancel={cancel}
                    onDone={() => router.back()}
                />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Transfer to MoneyWise" />

            <View style={styles.scroll}>
                <Text style={styles.subtitle}>Deposit cash funds into a MoneyWise wallet via Lenco.</Text>

                {error && <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>}

                <View style={styles.fromToRow}>
                    <View style={styles.fromToCard}>
                        <Text style={styles.fromToLabel}>FROM</Text>
                        <Text style={styles.fromToValue}>Cash Account</Text>
                        <Text style={styles.fromToSub}>Bal: {formatKwacha(sourceBalance)}</Text>
                    </View>
                    <View style={styles.fromToCard}>
                        <Text style={styles.fromToLabel}>TO</Text>
                        <Pressable onPress={() => setWalletDropdownOpen((o) => !o)}>
                            <Text style={styles.fromToValue} numberOfLines={1}>{destWallet?.name ?? 'Select wallet'}</Text>
                        </Pressable>
                    </View>
                </View>
                {walletDropdownOpen && (
                    <View style={styles.walletDropdown}>
                        {wallets.map((w: any) => (
                            <Pressable key={w.id} style={styles.walletDropdownRow} onPress={() => { setWalletId(w.id); setWalletDropdownOpen(false); }}>
                                <Text style={styles.walletDropdownName}>{w.name}</Text>
                                <Text style={styles.walletDropdownBalance}>{formatKwacha(w.balance)}</Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                <Text style={styles.label}>Amount to Transfer (K)</Text>
                <TextInput
                    style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint}
                />

                <View style={styles.feeCard}>
                    <View style={styles.feeRow}><Text style={styles.feeLabelMuted}>Total charged</Text><Text style={styles.feeValueMuted}>{formatKwacha(gross)}</Text></View>
                    <View style={styles.feeRow}><Text style={styles.feeLabelFaint}>Platform fee</Text><Text style={styles.feeValueFaint}>− {formatKwacha(platformFee)}</Text></View>
                    <View style={styles.feeRow}><Text style={styles.feeLabelFaint}>Lenco fee (1%)</Text><Text style={styles.feeValueFaint}>− {formatKwacha(lencoFee)}</Text></View>
                    <View style={[styles.feeRow, styles.feeRowTotal]}><Text style={styles.feeLabelTotal}>Credited to wallet</Text><Text style={styles.feeValueTotal}>{formatKwacha(netToWallet)}</Text></View>
                </View>

                <Text style={[styles.label, styles.spaced]}>Mobile money number to charge</Text>
                <View style={styles.phoneRow}>
                    <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+260</Text></View>
                    <TextInput
                        style={styles.phoneInput} value={phone} onChangeText={setPhone}
                        keyboardType="phone-pad" placeholder="971 234 567" placeholderTextColor={colors.textFaint}
                    />
                    {operator && <Text style={styles.operatorTag}>{operator}</Text>}
                </View>
                {operator && (
                    <View style={styles.verifyRow}>
                        {resolvingAccountName ? (
                            <><ActivityIndicator size="small" color={colors.textFaint} /><Text style={styles.verifyMuted}>Verifying account holder…</Text></>
                        ) : resolvedAccountName ? (
                            <Text style={styles.verifyName}>{resolvedAccountName}</Text>
                        ) : resolveFailed ? (
                            <Text style={styles.verifyError}>Could not verify — check the number</Text>
                        ) : null}
                    </View>
                )}

                <Text style={styles.footnote}>
                    You'll get a payment prompt on this number. The cash balance is only deducted once the deposit is confirmed.
                </Text>
            </View>

            <View style={styles.footer}>
                <Pressable style={[styles.submit, !valid && styles.submitDisabled]} onPress={startTransfer} disabled={!valid || submitting}>
                    {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Continue to Lenco</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { flex: 1, padding: 20, gap: 4 },
    subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: 14 },
    errorCard: { backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: 12, marginBottom: 14 },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, lineHeight: 17 },
    fromToRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    fromToCard: { flex: 1, backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 12 },
    fromToLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5 },
    fromToValue: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginTop: 4 },
    fromToSub: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textFaint, marginTop: 2 },
    walletDropdown: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 14, overflow: 'hidden' },
    walletDropdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
    walletDropdownName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    walletDropdownBalance: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted },
    label: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
    spaced: { marginTop: 18 },
    input: {
        fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg,
        paddingHorizontal: 16, paddingVertical: 13, backgroundColor: colors.canvasAlt,
    },
    feeCard: { backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 14, marginTop: 14, gap: 5 },
    feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
    feeLabelMuted: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    feeValueMuted: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    feeLabelFaint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    feeValueFaint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    feeRowTotal: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 3 },
    feeLabelTotal: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#059669' },
    feeValueTotal: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#059669' },
    phoneRow: {
        minHeight: 48, backgroundColor: colors.canvasAlt, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
        flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    },
    phonePrefix: { paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.border },
    phonePrefixText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    phoneInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, paddingHorizontal: 14 },
    operatorTag: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', marginRight: 14 },
    verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    verifyMuted: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    verifyName: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#059669' },
    verifyError: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.danger },
    footnote: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 16, marginTop: 16 },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    submit: { backgroundColor: colors.text, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    submitDisabled: { backgroundColor: colors.borderStrong },
    submitText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
