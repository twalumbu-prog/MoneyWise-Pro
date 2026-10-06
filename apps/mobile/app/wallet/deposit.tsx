import { useEffect, useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone, CreditCard, Check, AlertCircle } from 'lucide-react-native';
import { cashbookService, lencoService, detectMobileNetwork, formatKwacha } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { PaymentWaitingScreen } from '../../src/components/payments/PaymentWaitingScreen';
import { AnimatedSegmented } from '../../src/components/AnimatedTabs';
import { SelectField } from '../../src/components/invest/application/formFields';
import { useAuth } from '../../src/context/AuthContext';
import { useMobileMoneyCollection } from '../../src/hooks/useMobileMoneyCollection';
import { colors, fonts, radius } from '../../src/theme/tokens';
import { useGoBack } from '../../src/hooks/useGoBack';
import { phoneFromPrefixedInput, prefixedInputValue } from '../../src/lib/phone';

const OPERATOR_COLOR: Record<string, string> = { AIRTEL: '#EF4444', MTN: '#F59E0B', ZAMTEL: '#10B981' };

/**
 * Wallet → Deposit. Real money in through Lenco, the same way the web wallet deposit and QuickPay
 * links do it: amount and details, Mobile Money (or card, coming soon), the account holder's name
 * shown before paying, then the collection runs in the background while the payer approves on
 * their phone. Only real Lenco money lands in a MoneyWise wallet; money received outside Lenco
 * is logged from Inbox → Inflows → "Log money received" (app/log-received.tsx).
 */
export default function DepositScreen() {
    const insets = useSafeAreaInsets();
    const safeBack = useGoBack();
    const qc = useQueryClient();
    const { organizationId } = useAuth();

    const [method, setMethod] = useState<'MOBILE_MONEY' | 'CARD'>('MOBILE_MONEY');
    const [amount, setAmount] = useState('');
    const [purpose, setPurpose] = useState('');
    const [walletId, setWalletId] = useState('');
    const [phone, setPhone] = useState('');
    const [holder, setHolder] = useState('');
    const [resolving, setResolving] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);

    const { data: wallets = [] } = useQuery({
        queryKey: ['wallets-payment-flow'],
        queryFn: async () => {
            const data = await cashbookService.getWallets();
            return (Array.isArray(data) ? data : []).map((w: any) => ({ id: String(w.id), name: String(w.name), balance: Number(w.balance) || 0, isMain: !!w.is_main }));
        },
    });
    useEffect(() => {
        if (!walletId && wallets.length) setWalletId((wallets.find((w) => w.isMain) ?? wallets[0]).id);
    }, [wallets, walletId]);

    const operator = phone ? (detectMobileNetwork(phone) || null) : null;
    useEffect(() => {
        if (!operator) { setHolder(''); setResolveFailed(false); return; }
        let stop = false;
        const t = setTimeout(async () => {
            setResolving(true); setResolveFailed(false);
            try {
                const r = await lencoService.resolveMobileMoney(phone, operator.toLowerCase());
                if (stop) return;
                setHolder(r?.accountName || '');
                setResolveFailed(!r?.accountName);
            } catch { if (!stop) { setHolder(''); setResolveFailed(true); } }
            finally { if (!stop) setResolving(false); }
        }, 450);
        return () => { stop = true; clearTimeout(t); };
    }, [phone, operator]);

    const collection = useMobileMoneyCollection({
        storageKey: `wallet-deposit:${organizationId}`,
        onConfirmed: async () => {
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            qc.invalidateQueries({ queryKey: ['wallets-payment-flow'] });
            qc.invalidateQueries();
        },
    });

    const value = Number(amount) || 0;
    const wallet = wallets.find((w) => w.id === walletId);
    const canPay = method === 'MOBILE_MONEY' && value > 0 && !!wallet && !!operator && !resolving && !!organizationId && collection.phase === null;

    const pay = async () => {
        if (!canPay || !wallet || !organizationId) return;
        const label = purpose.trim() || 'Wallet Deposit';
        await collection.start({
            tag: 'WDEP',
            organizationId,
            walletId: wallet.id,
            amount: value,
            phone,
            operator: operator!,
            // Same as the web deposit: charge exactly what's being deposited, intent first.
            prepare: (ref) => cashbookService.logWalletDepositIntent(ref, label, value, wallet.id),
        });
    };

    const walletOptions = useMemo(() => wallets.map((w) => ({ value: w.id, label: `${w.name} · ${formatKwacha(w.balance)}` })), [wallets]);

    if (collection.phase) {
        return (
            <View style={styles.root}>
                <Stack.Screen options={{ headerShown: false }} />
                <PaymentWaitingScreen
                    phase={collection.phase}
                    amount={collection.amount}
                    businessName={wallet?.name || 'your wallet'}
                    payerPhone={collection.phone}
                    operator={collection.operator}
                    elapsedSeconds={collection.elapsed}
                    reference={collection.reference}
                    headerLabel="Deposit"
                    doneLabel="Done"
                    failureMessage={collection.failureMessage}
                    declined={collection.declined}
                    rechecking={collection.rechecking}
                    recheckNote={collection.recheckNote}
                    onRecheck={collection.recheck}
                    onRetry={collection.reset}
                    onCancel={collection.cancel}
                    onDone={() => { collection.reset(); safeBack(); }}
                />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Deposit" />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <AnimatedSegmented
                    value={method}
                    onChange={(v) => setMethod(v as 'MOBILE_MONEY' | 'CARD')}
                    trackStyle={styles.segTrack}
                    indicatorStyle={styles.segIndicator}
                    itemStyle={styles.segItem}
                    items={[
                        { value: 'MOBILE_MONEY', content: <View style={styles.segInner}><Smartphone size={15} color={colors.text} /><Text style={styles.segText}>Mobile Money</Text></View> },
                        { value: 'CARD', content: <View style={styles.segInner}><CreditCard size={15} color={colors.text} /><Text style={styles.segText}>Debit Card</Text></View> },
                    ]}
                />

                <View style={styles.card}>
                    <Text style={styles.label}>Amount (K)</Text>
                    <TextInput
                        style={[styles.input, styles.amountInput]}
                        value={amount}
                        onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.textFaint}
                    />
                    <Text style={[styles.label, styles.spaced]}>What is it for? (optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={purpose}
                        onChangeText={setPurpose}
                        placeholder="e.g. Top-up for expenses"
                        placeholderTextColor={colors.textFaint}
                    />
                    {wallets.length > 1 && (
                        <View style={styles.spaced}>
                            <SelectField label="Deposit into" value={walletId} options={walletOptions} onChange={setWalletId} />
                        </View>
                    )}
                </View>

                {method === 'MOBILE_MONEY' ? (
                    <View style={styles.card}>
                        <Text style={styles.label}>Your mobile money number</Text>
                        <View style={styles.phoneRow}>
                            <View style={styles.phonePrefix}><Text style={styles.flag}>🇿🇲</Text><Text style={styles.prefixText}>+260</Text></View>
                            <TextInput
                                style={styles.phoneInput}
                                value={prefixedInputValue(phone)}
                                onChangeText={(t) => setPhone(phoneFromPrefixedInput(t))}
                                placeholder="97 123 4567"
                                placeholderTextColor={colors.textFaint}
                                keyboardType="number-pad"
                                accessibilityLabel="Mobile money number"
                            />
                            {!!operator && <Text style={[styles.operator, { color: OPERATOR_COLOR[operator.toUpperCase()] || colors.text }]}>{operator.toUpperCase()}</Text>}
                        </View>

                        {phone.replace(/[^0-9]/g, '').length >= 9 && (
                            <View style={styles.holder}>
                                {resolving ? <ActivityIndicator size="small" color={colors.blue} />
                                    : holder ? <Check size={16} color={colors.positiveInk} />
                                    : <AlertCircle size={16} color={colors.warn} />}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.holderLabel}>ACCOUNT HOLDER</Text>
                                    <Text style={styles.holderName} numberOfLines={1}>
                                        {resolving ? 'Verifying number…' : holder || (resolveFailed ? 'Could not verify — check the number' : 'Waiting for a valid number…')}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={[styles.card, { alignItems: 'center', gap: 8, paddingVertical: 28 }]}>
                        <CreditCard size={26} color={colors.textMuted} />
                        <Text style={styles.soonTitle}>Card — coming soon</Text>
                        <Text style={styles.soonText}>Card payments aren't available in the app yet. Please use Mobile Money for now.</Text>
                    </View>
                )}

                {!!collection.error && (
                    <View style={styles.error}><AlertCircle size={15} color="#B91C1C" /><Text style={styles.errorText}>{collection.error}</Text></View>
                )}

            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>You'll be charged</Text>
                    <Text style={styles.totalAmount}>{formatKwacha(value)}</Text>
                </View>
                <Pressable
                    style={({ pressed }) => [styles.submit, !canPay && styles.disabled, pressed && canPay && { opacity: 0.85 }]}
                    onPress={pay}
                    disabled={!canPay}
                >
                    {collection.busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{value > 0 ? `Deposit ${formatKwacha(value)}` : 'Deposit'}</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    segTrack: { flexDirection: 'row', padding: 2, backgroundColor: '#F5F5F5', borderRadius: radius.pill },
    segIndicator: { borderRadius: radius.pill, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    segItem: { flex: 1, alignItems: 'center', paddingVertical: 9 },
    segInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    segText: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
    phoneRow: { flexDirection: 'row', alignItems: 'center', minHeight: 50, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
    phonePrefix: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, alignSelf: 'stretch', backgroundColor: '#F5F5F5', borderRightWidth: 1, borderRightColor: colors.borderStrong },
    flag: { fontSize: 16 },
    prefixText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textMuted },
    phoneInput: { flex: 1, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    operator: { fontFamily: fonts.bodyBold, fontSize: 12, marginRight: 14, letterSpacing: -0.3 },
    holder: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    holderLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
    holderName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginTop: 2 },
    soonTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    soonText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17, maxWidth: 240 },
    error: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: radius.md, backgroundColor: '#FEF2F2' },
    errorText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: '#B91C1C', lineHeight: 17 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    totalAmount: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 32 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    spaced: { marginTop: 18 },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    amountInput: { fontFamily: fonts.bodyBold, fontSize: 24 },
    totalLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
    footer: {
        paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface,
        borderTopWidth: 1, borderTopColor: colors.border,
    },
    submit: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    disabled: { opacity: 0.4 },
    submitText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
