import { useEffect, useMemo, useState } from 'react';
import { TourTarget } from '../../src/components/walkthrough/TourTarget';
import { KB_DONE_ID } from '../../src/components/KeyboardDoneBar';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, KeyboardAvoidingView, 
    Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone, CreditCard, AlertCircle } from 'lucide-react-native';
import { cashbookService, lipilaService, formatKwacha } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { PaymentWaitingScreen } from '../../src/components/payments/PaymentWaitingScreen';
import { AnimatedSegmented } from '../../src/components/AnimatedTabs';
import { SelectField } from '../../src/components/invest/application/formFields';
import { useAuth } from '../../src/context/AuthContext';
import { useMobileMoneyCollection } from '../../src/hooks/useMobileMoneyCollection';
import { colors, fonts, radius } from '../../src/theme/tokens';
import { useGoBack } from '../../src/hooks/useGoBack';
import { MobileMoneyNumberField, useMomoHolder } from '../../src/components/payments/MobileMoneyNumberField';

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
    const { organizationId, userRole } = useAuth();
    const router = useRouter();

    const startParams = useLocalSearchParams<{ method?: string }>();
    const [method, setMethod] = useState<'MOBILE_MONEY' | 'CARD'>(startParams.method === 'card' ? 'CARD' : 'MOBILE_MONEY');
    // Arriving from "Insufficient funds" on the send screen pre-fills the shortfall and the wallet to top up.
    const params = useLocalSearchParams<{ amount?: string; walletId?: string }>();
    const [amount, setAmount] = useState(params.amount && Number(params.amount) > 0 ? String(params.amount) : '');
    const [purpose, setPurpose] = useState('');
    const [walletId, setWalletId] = useState(params.walletId ? String(params.walletId) : '');
    const [phone, setPhone] = useState('');

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

    const { operator, holder, resolving, resolveFailed } = useMomoHolder(phone, method === 'MOBILE_MONEY');

    // Card (Lipila): the money lands in the business's Card Wallet. The card page opens in the browser; we ask for the result until it is decided.
    const CARD_RATE = 0.04;
    // Cards need two things: the business is open for them, and it has saved its own Lipila key and switched them on.
    const { data: cardSettings } = useQuery({ queryKey: ['lipila-cards-available', organizationId], queryFn: () => lipilaService.settings().catch(() => null) });
    const cardAvailable = !!(cardSettings && cardSettings.available && cardSettings.enabled);
    const cardOpenButNotSetUp = !!(cardSettings && cardSettings.available && !cardSettings.enabled);
    const [cardRef, setCardRef] = useState<string | null>(null);
    const [cardBusy, setCardBusy] = useState(false);
    const [cardError, setCardError] = useState<string | null>(null);
    useEffect(() => {
        if (!cardRef) return;
        let stop = false;
        const t = setInterval(async () => {
            try {
                const d = await lipilaService.status(cardRef);
                if (stop) return;
                if (d.verified) { setCardRef(null); qc.invalidateQueries(); safeBack(); }
                else if (d.status === 'failed') { setCardRef(null); setCardError(d.message || 'The card payment did not go through. Nothing was charged.'); }
            } catch { /* keep waiting */ }
        }, 3000);
        return () => { stop = true; clearInterval(t); };
    }, [cardRef]);

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
    const cardCharged = value > 0 ? Math.round((value / (1 - CARD_RATE)) * 100) / 100 : 0;
    const canPayCard = method === 'CARD' && cardAvailable && value >= 10 && !cardRef && !cardBusy;
    const canPay = (method === 'MOBILE_MONEY' && value > 0 && !!wallet && !!operator && !resolving && !!organizationId && collection.phase === null) || canPayCard;

    const payCard = async () => {
        setCardError(null);
        setCardBusy(true);
        try {
            const r = await lipilaService.deposit(value);
            if (!r.redirectUrl) throw new Error('The card payment could not be started. Please try again.');
            setCardRef(r.reference);
            await Linking.openURL(r.redirectUrl);
        } catch (e: any) {
            setCardError(e?.message || 'The card payment could not be started.');
        } finally {
            setCardBusy(false);
        }
    };

    const pay = async () => {
        if (method === 'CARD') { await payCard(); return; }
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
        <KeyboardAvoidingView style={styles.root} behavior="padding">
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
<TourTarget id="deposit-amount">
                    <Text style={styles.label}>Amount (K)</Text>
                    <TextInput
                        style={[styles.input, styles.amountInput]}
                        value={amount}
                        onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                        keyboardType="decimal-pad" inputAccessoryViewID={KB_DONE_ID}
                        placeholder="0.00"
                        placeholderTextColor={colors.textFaint}
                    />
                </TourTarget>
                    <Text style={[styles.label, styles.spaced]}>What is it for? (optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={purpose}
                        onChangeText={setPurpose}
                        placeholder="e.g. Top-up for expenses"
                        placeholderTextColor={colors.textFaint}
                    />
                    {method === 'MOBILE_MONEY' && wallets.length > 1 && (
                        <View style={styles.spaced}>
                            <SelectField label="Deposit into" value={walletId} options={walletOptions} onChange={setWalletId} />
                        </View>
                    )}
                </View>

                {method === 'MOBILE_MONEY' ? (
                    <View style={styles.card}>
                        <MobileMoneyNumberField
                            phone={phone} onChangePhone={setPhone}
                            operator={operator} holder={holder} resolving={resolving} resolveFailed={resolveFailed}
                        />
                    </View>
                ) : cardAvailable ? (
                    <View style={[styles.card, { gap: 8 }]}>
                        <Text style={styles.soonTitle}>Pay with a Visa, Mastercard or Amex</Text>
                        <Text style={[styles.soonText, { textAlign: 'left', maxWidth: undefined }]}>This goes to your Card Wallet (your Lipila account), not the Lenco wallet. You enter your card on a secure page.</Text>
                        {value > 0 ? (
                            <View style={{ gap: 4, marginTop: 4 }}>
                                <View style={styles.totalRow}><Text style={styles.totalLabel}>Deposit</Text><Text style={styles.soonText}>{formatKwacha(value)}</Text></View>
                                <View style={styles.totalRow}><Text style={styles.totalLabel}>Card fee (4%)</Text><Text style={styles.soonText}>{formatKwacha(cardCharged - value)}</Text></View>
                            </View>
                        ) : null}
                        {value > 0 && value < 10 ? <Text style={styles.errorText}>The smallest card deposit is K10.</Text> : null}
                        {cardRef ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}><ActivityIndicator color={colors.blue} /><Text style={styles.soonText}>Finish the payment in your browser. This screen updates by itself.</Text></View> : null}
                    </View>
                ) : (
                    <View style={[styles.card, { alignItems: 'center', gap: 8, paddingVertical: 28 }]}>
                        <CreditCard size={26} color={colors.textMuted} />
                        <Text style={styles.soonTitle}>Card isn't set up yet</Text>
                        <Text style={styles.soonText}>
                            {cardOpenButNotSetUp
                                ? (cardSettings?.configured
                                    ? 'Your Lipila key is saved, but card payments are switched off. Turn them on in the card settings.'
                                    : 'Add your own Lipila key to take card deposits. It only takes a minute in the card settings.')
                                : 'Card payments aren’t open for this account yet. Please use Mobile Money for now.'}
                        </Text>
                        {cardOpenButNotSetUp && userRole === 'ADMIN' ? (
                            <Pressable style={styles.setupBtn} onPress={() => router.push('/settings/lipila' as any)}><Text style={styles.setupBtnText}>Set up card payments</Text></Pressable>
                        ) : cardOpenButNotSetUp ? (
                            <Text style={styles.soonText}>Ask the account holder to set it up.</Text>
                        ) : null}
                    </View>
                )}

                {!!cardError && (
                    <View style={styles.error}><AlertCircle size={15} color="#B91C1C" /><Text style={styles.errorText}>{cardError}</Text></View>
                )}

                {!!collection.error && (
                    <View style={styles.error}><AlertCircle size={15} color="#B91C1C" /><Text style={styles.errorText}>{collection.error}</Text></View>
                )}

            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>You'll be charged</Text>
                    <Text style={styles.totalAmount}>{formatKwacha(method === 'CARD' ? cardCharged : value)}</Text>
                </View>
                <Pressable
                    style={({ pressed }) => [styles.submit, !canPay && styles.disabled, pressed && canPay && { opacity: 0.85 }]}
                    onPress={pay}
                    disabled={!canPay}
                >
                    {collection.busy || cardBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{value > 0 ? `Deposit ${formatKwacha(value)}` : 'Deposit'}</Text>}
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
    setupBtn: { marginTop: 6, backgroundColor: colors.blue, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
    setupBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
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
