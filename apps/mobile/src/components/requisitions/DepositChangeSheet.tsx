import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, X } from 'lucide-react-native';
import { lencoService, requisitionService, detectMobileNetwork, formatKwacha } from 'core';
import { PaymentWaitingScreen } from '../payments/PaymentWaitingScreen';
import { useMobileMoneyCollection } from '../../hooks/useMobileMoneyCollection';
import { colors, fonts, radius } from '../../theme/tokens';

function genReference(id: string): string {
    return `CHG-${Date.now()}-${id}`;
}

/**
 * "Deposit to Wallet" for returning requisition change — the mobile equivalent
 * of web's Lenco-SDK (window.LencoPay) checkout, which is browser-only and has
 * no native counterpart. Uses the same server-initiated mobile-money collection
 * (initiateMobileMoneyCollection / longPollCollectionStatus / finalizeCollection)
 * that InvestPaymentFlow already established as the native-compatible pattern,
 * targeting the requestor's own org wallet instead of a cross-org investment
 * target. On confirmed payment, finalizes via the same
 * requisitionService.submitChange(id, [], amount, 'MONEYWISE_WALLET', ref) call
 * web makes after its widget's onSuccess fires.
 */
export const DepositChangeSheet: React.FC<{
    visible: boolean;
    requisitionId: string;
    organizationId: string;
    walletId: string | null;
    amount: number;
    onClose: () => void;
    onDone: () => void;
}> = ({ visible, requisitionId, organizationId, walletId, amount, onClose, onDone }) => {
    const insets = useSafeAreaInsets();
    const [phone, setPhone] = useState('');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const collection = useMobileMoneyCollection({
        storageKey: `change:${requisitionId}`,
        // Same call web makes after its checkout succeeds; the server nets the CHG- deposit into the disbursal.
        onConfirmed: (ref) => requisitionService.submitChange(requisitionId, [], amount, 'MONEYWISE_WALLET', ref),
    });
    const step = collection.phase ? 'WAITING' : 'PAY';

    const operator = phone ? detectMobileNetwork(phone) || null : null;

    useEffect(() => {
        if (!visible) return;
        setPhone('');
        setResolvedAccountName('');
        setResolvingAccountName(false);
        setResolveFailed(false);
        setPayError(null);
    }, [visible]);

    useEffect(() => {
        if (step !== 'PAY') return;
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
                const res = await lencoService.resolveMobileMoney(phone, operator);
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
    }, [phone, operator, step]);

    const startDeposit = async () => {
        if (!walletId) {
            setPayError('No wallet is set up to receive this deposit yet.');
            return;
        }
        if (!operator) return;
        setPayError(null);
        await collection.start({
            tag: 'CHG',
            reference: genReference(requisitionId),
            organizationId,
            walletId,
            amount,
            phone,
            operator,
            prepare: (ref) => lencoService.logPublicWalletDepositIntent(ref, `Requisition change return`, amount, walletId),
        });
    };

    const disabled = collection.busy || !operator || !resolvedAccountName || resolvingAccountName || !walletId;

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
            <View style={styles.root}>
                {step === 'PAY' && (
                    <View style={styles.payRoot}>
                        <View style={[styles.payHeader, { paddingTop: insets.top + 12 }]}>
                            <Text style={styles.payHeaderTitle}>Deposit Change</Text>
                            <Pressable onPress={onClose} hitSlop={8}><X size={20} color={colors.textFaint} /></Pressable>
                        </View>

                        <View style={styles.amountCard}>
                            <Text style={styles.amountLabel}>AMOUNT TO DEPOSIT</Text>
                            <Text style={styles.amountValue}>{formatKwacha(amount)}</Text>
                        </View>

                        <View style={styles.walletSection}>
                            <Text style={styles.fieldLabel}>Pay with mobile money</Text>
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
                                        <><CheckCircle2 size={13} color="#059669" /><Text style={styles.verifyName}>{resolvedAccountName}</Text></>
                                    ) : resolveFailed ? (
                                        <Text style={styles.verifyError}>Could not verify — check the number</Text>
                                    ) : null}
                                </View>
                            )}
                        </View>

                        {!!(payError || collection.error) && (
                            <View style={styles.payErrorCard}><Text style={styles.payErrorText}>{payError || collection.error}</Text></View>
                        )}

                        <View style={styles.payFooter}>
                            <Pressable style={[styles.ctaBtn, disabled && styles.ctaBtnDisabled]} onPress={startDeposit} disabled={disabled}>
                                {collection.busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaBtnText}>Deposit {formatKwacha(amount)}</Text>}
                            </Pressable>
                        </View>
                    </View>
                )}

                {step === 'WAITING' && collection.phase && (
                    <PaymentWaitingScreen
                        phase={collection.phase}
                        amount={collection.amount || amount}
                        businessName="MoneyWise Wallet"
                        payerPhone={collection.phone}
                        operator={collection.operator}
                        elapsedSeconds={collection.elapsed}
                        reference={collection.reference}
                        headerLabel="Deposit change"
                        doneLabel="Done"
                        failureMessage={collection.failureMessage}
                        declined={collection.declined}
                        rechecking={collection.rechecking}
                        recheckNote={collection.recheckNote}
                        onRecheck={collection.recheck}
                        onRetry={collection.reset}
                        onCancel={collection.cancel}
                        onDone={() => { const ok = collection.phase === 'success'; collection.reset(); if (ok) onDone(); else onClose(); }}
                    />
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    payRoot: { flex: 1, backgroundColor: colors.canvasAlt },
    payHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    payHeaderTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    amountCard: { alignItems: 'center', paddingVertical: 20 },
    amountLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.6 },
    amountValue: { fontFamily: fonts.bodyBold, fontSize: 34, color: colors.text, marginTop: 4 },
    walletSection: { paddingHorizontal: 20 },
    fieldLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginBottom: 8 },
    phoneRow: {
        minHeight: 48, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
        flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    },
    phonePrefix: { paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.border },
    phonePrefixText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    phoneInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, paddingHorizontal: 14 },
    operatorTag: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', marginRight: 14 },
    verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    verifyMuted: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    verifyName: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted },
    verifyError: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.danger },
    payErrorCard: { backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: 12, marginHorizontal: 20, marginTop: 16 },
    payErrorText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, lineHeight: 17 },
    payFooter: { marginTop: 'auto', paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16 },
    ctaBtn: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    ctaBtnDisabled: { backgroundColor: colors.borderStrong },
    ctaBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    submittingOverlay: {
        ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.6)',
        alignItems: 'center', justifyContent: 'center',
    },
});
