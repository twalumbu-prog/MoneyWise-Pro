import { useEffect, useRef, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
    ChevronLeft, X, Repeat, Smartphone, CreditCard, ChevronDown, CheckCircle2, Delete,
} from 'lucide-react-native';
import {
    cashbookService, lencoService, detectMobileNetwork, formatKwacha,
} from 'core';
import type { InvestProduct, InvestProvider } from '../../data/investCatalog';
import { PaymentWaitingScreen, type PaymentPhase } from '../payments/PaymentWaitingScreen';
import { colors, fonts, radius } from '../../theme/tokens';

type Step = 'METHOD' | 'AMOUNT' | 'PAY' | 'WAITING' | 'ACTIVATING' | 'SUCCESS';
type Method = 'AUTO_INVEST' | 'DEPOSIT';
type PayMethod = 'WALLET' | 'MOBILE_MONEY' | 'CARD';

interface WalletOption { id: string; name: string; balance: number }

function parsePrice(priceStr: string): number {
    return parseFloat(priceStr.replace(/[K,]/g, '')) || 0;
}

function formatAmountDisplay(amountStr: string): string {
    if (!amountStr) return '0';
    const [intPart, decPart] = amountStr.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

function genReference(): string {
    return `INV${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

const QUICK_AMOUNTS = [500, 1000, 2500];
const KEYPAD_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'back']];

/**
 * Native port of apps/web/src/pages/invest/InvestPaymentFlow.tsx. Same step
 * machine: a method bottom sheet, an on-screen-keypad amount screen, a
 * Moneywise/Mobile Money/Card payment tab, then a waiting/activating screen
 * into success. Deposit confirmation is simulated with fixed timers on web
 * too (see its own comment) — these demo invest products have no backing
 * wallet in the ledger to receive real funds, so there's nothing to poll.
 * Web's canvas-drawn "Download Certificate of Deposit" isn't ported (no
 * canvas on native); the summary card on the success screen carries the same
 * information instead.
 */
export const InvestPaymentFlow: React.FC<{
    visible: boolean;
    onClose: () => void;
    product: InvestProduct;
    provider: InvestProvider;
}> = ({ visible, onClose, product, provider }) => {
    const insets = useSafeAreaInsets();
    const [step, setStep] = useState<Step>('METHOD');
    const [method, setMethod] = useState<Method>('DEPOSIT');
    const [amountStr, setAmountStr] = useState('');
    const [payMethod, setPayMethod] = useState<PayMethod>('WALLET');
    const [selectedWalletId, setSelectedWalletId] = useState<string>('');
    const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
    const [phone, setPhone] = useState('');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const [phase, setPhase] = useState<PaymentPhase>('initiating');
    const [elapsed, setElapsed] = useState(0);
    const [reference, setReference] = useState('');
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const { data: wallets = [] } = useQuery({
        queryKey: ['wallets-payment-flow'],
        queryFn: async (): Promise<WalletOption[]> => {
            const data = await cashbookService.getWallets();
            return (data || []).map((w: any) => ({ id: w.id, name: w.name, balance: Number(w.balance) || 0 }));
        },
        enabled: visible,
    });

    const unitPrice = parsePrice(product.price);
    const isUnitTrust = product.type === 'UNIT_TRUST';
    const amount = parseFloat(amountStr) || 0;
    const units = isUnitTrust && unitPrice > 0 ? amount / unitPrice : 0;
    const operator = phone ? detectMobileNetwork(phone) || null : null;
    const selectedWallet = wallets.find((w) => w.id === selectedWalletId) || null;

    useEffect(() => {
        if (!visible) return;
        setStep('METHOD');
        setMethod('DEPOSIT');
        setAmountStr('');
        setPayMethod('WALLET');
        setWalletDropdownOpen(false);
        setPhone('');
        setResolvedAccountName('');
        setResolvingAccountName(false);
        setResolveFailed(false);
        setPhase('initiating');
        setElapsed(0);
        setReference('');
        return () => {
            timers.current.forEach(clearTimeout);
            timers.current = [];
            if (elapsedInterval.current) clearInterval(elapsedInterval.current);
        };
    }, [visible]);

    useEffect(() => {
        if (wallets.length > 0 && !selectedWalletId) setSelectedWalletId(wallets[0].id);
    }, [wallets, selectedWalletId]);

    useEffect(() => {
        if (step !== 'PAY' || payMethod !== 'MOBILE_MONEY') return;
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
    }, [phone, operator, payMethod, step]);

    const appendDigit = (d: string) => {
        if (d === '.' && amountStr.includes('.')) return;
        if (amountStr.replace('.', '').length >= 9) return;
        setAmountStr((prev) => prev + d);
    };
    const backspace = () => setAmountStr((prev) => prev.slice(0, -1));

    const clearTimers = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (elapsedInterval.current) clearInterval(elapsedInterval.current);
    };

    const startDepositSimulation = () => {
        setReference(genReference());
        setStep('WAITING');
        setPhase('initiating');
        setElapsed(0);
        elapsedInterval.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        timers.current.push(setTimeout(() => setPhase('confirm'), 1400));
        timers.current.push(setTimeout(() => setPhase('polling'), 3200));
        timers.current.push(setTimeout(() => { clearTimers(); setPhase('success'); }, 5800));
    };

    const startAutoInvestActivation = () => {
        setReference(genReference());
        setStep('ACTIVATING');
        timers.current.push(setTimeout(() => setStep('SUCCESS'), 1400));
    };

    const startWalletPayment = () => {
        setReference(genReference());
        setStep('ACTIVATING');
        timers.current.push(setTimeout(() => setStep('SUCCESS'), 1200));
    };

    const handleAmountCta = () => {
        if (amount <= 0) return;
        if (method === 'DEPOSIT') setStep('PAY');
        else startAutoInvestActivation();
    };

    const handlePayCta = () => {
        if (payMethod === 'WALLET') startWalletPayment();
        else if (payMethod === 'MOBILE_MONEY') startDepositSimulation();
    };

    const handleClose = () => { clearTimers(); onClose(); };

    const ctaLabel = method === 'DEPOSIT' ? 'Proceed to Payment' : 'Activate Auto-Invest';
    const charge = Math.max(1, Math.round(amount * 0.01 * 100) / 100);
    const payDisabled =
        payMethod === 'CARD' ||
        (payMethod === 'MOBILE_MONEY' && (!operator || !resolvedAccountName || resolvingAccountName)) ||
        (payMethod === 'WALLET' && (!selectedWallet || selectedWallet.balance < amount));

    const methodLabel = method === 'AUTO_INVEST'
        ? 'Auto-Invest'
        : payMethod === 'WALLET' ? `Moneywise${selectedWallet ? ` (${selectedWallet.name})` : ''}`
        : payMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Debit Card';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={handleClose} presentationStyle="fullScreen">
            <View style={styles.root}>
                {step === 'METHOD' && (
                    <View style={styles.methodSheet}>
                        <View style={styles.sheetHandle} />
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle} numberOfLines={1}>Invest in {product.name}</Text>
                            <Pressable onPress={handleClose} hitSlop={8}><X size={18} color={colors.textFaint} /></Pressable>
                        </View>
                        <Text style={styles.sheetSub}>Choose how you'd like to fund this investment.</Text>

                        <Pressable style={styles.methodOption} onPress={() => { setMethod('AUTO_INVEST'); setStep('AMOUNT'); }}>
                            <View style={[styles.methodIcon, { backgroundColor: colors.tabActiveBg }]}>
                                <Repeat size={20} color={colors.blue} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.methodTitle}>Auto-Invest</Text>
                                <Text style={styles.methodDesc}>Recurring scheduled contributions</Text>
                            </View>
                        </Pressable>

                        <Pressable style={styles.methodOption} onPress={() => { setMethod('DEPOSIT'); setStep('AMOUNT'); }}>
                            <View style={[styles.methodIcon, { backgroundColor: '#ECFDF5' }]}>
                                <Text style={styles.methodIconEmoji}>💳</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.methodTitle}>Deposit</Text>
                                <Text style={styles.methodDesc}>Fund instantly via mobile money</Text>
                            </View>
                        </Pressable>
                    </View>
                )}

                {step === 'AMOUNT' && (
                    <View style={styles.amountRoot}>
                        <View style={[styles.amountHeader, { paddingTop: insets.top + 12 }]}>
                            <Pressable onPress={() => setStep('METHOD')} hitSlop={8}><ChevronLeft size={22} color={colors.text} /></Pressable>
                            <Text style={styles.amountHeaderTitle} numberOfLines={1}>{product.name}</Text>
                            <View style={{ width: 22 }} />
                        </View>

                        <View style={styles.amountDisplayWrap}>
                            <Text style={styles.amountCaption}>
                                {isUnitTrust ? `Buy ${product.id.toUpperCase()} Units` : `Deposit into ${product.name}`}
                            </Text>
                            <Text style={styles.amountBig}>K{formatAmountDisplay(amountStr || '0')}</Text>
                            {isUnitTrust && unitPrice > 0 && (
                                <View style={{ alignItems: 'center', marginTop: 4 }}>
                                    <Text style={styles.unitLine}>1 Unit trust  ⇄  K{unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                                    <Text style={styles.unitLine}>Gets you <Text style={styles.unitLineBold}>{units.toLocaleString(undefined, { maximumFractionDigits: 2 })} Units</Text></Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.quickAmountRow}>
                            {QUICK_AMOUNTS.map((q) => (
                                <Pressable key={q} style={styles.quickAmountBtn} onPress={() => setAmountStr(String(q))}>
                                    <Text style={styles.quickAmountText}>K{q.toLocaleString()}</Text>
                                </Pressable>
                            ))}
                        </View>

                        <View style={styles.keypad}>
                            {KEYPAD_ROWS.map((row, ri) => (
                                <View key={ri} style={styles.keypadRow}>
                                    {row.map((key) => (
                                        <Pressable key={key} style={styles.keypadKey} onPress={() => (key === 'back' ? backspace() : appendDigit(key))}>
                                            {key === 'back' ? <Delete size={22} color={colors.text} /> : <Text style={styles.keypadKeyText}>{key}</Text>}
                                        </Pressable>
                                    ))}
                                </View>
                            ))}
                        </View>

                        <View style={styles.amountFooter}>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Total</Text>
                                <Text style={styles.totalValue}>K{formatAmountDisplay(amountStr || '0')}</Text>
                            </View>
                            <Pressable style={[styles.ctaBtn, amount <= 0 && styles.ctaBtnDisabled]} onPress={handleAmountCta} disabled={amount <= 0}>
                                <Text style={styles.ctaBtnText}>{ctaLabel}</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                {step === 'PAY' && (
                    <View style={styles.payRoot}>
                        <View style={[styles.payHeader, { paddingTop: insets.top + 12 }]}>
                            <Pressable onPress={() => setStep('AMOUNT')} hitSlop={8}><ChevronLeft size={22} color={colors.text} /></Pressable>
                            <Text style={styles.payHeaderTitle}>Payment</Text>
                        </View>

                        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.payScroll}>
                            <View style={styles.payTabRow}>
                                {(['WALLET', 'MOBILE_MONEY', 'CARD'] as PayMethod[]).map((pm) => (
                                    <Pressable key={pm} style={[styles.payTab, payMethod === pm && styles.payTabActive]} onPress={() => setPayMethod(pm)}>
                                        {pm === 'WALLET' && <Text style={styles.payTabIcon}>💳</Text>}
                                        {pm === 'MOBILE_MONEY' && <Smartphone size={13} color={colors.text} />}
                                        {pm === 'CARD' && <CreditCard size={13} color={colors.text} />}
                                        <Text style={[styles.payTabText, payMethod === pm && styles.payTabTextActive]}>
                                            {pm === 'WALLET' ? 'Moneywise' : pm === 'MOBILE_MONEY' ? 'Mobile Money' : 'Debit Card'}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            {payMethod === 'WALLET' && (
                                <View style={styles.walletSection}>
                                    <Text style={styles.fieldLabel}>Pay from</Text>
                                    <Pressable style={styles.walletSelector} onPress={() => setWalletDropdownOpen((o) => !o)}>
                                        <View>
                                            <Text style={styles.walletSelectorName}>
                                                {selectedWallet?.name || (wallets.length === 0 ? 'Loading wallets…' : 'Select a wallet')}
                                            </Text>
                                            {selectedWallet && <Text style={styles.walletSelectorBalance}>Balance: {formatKwacha(selectedWallet.balance)}</Text>}
                                        </View>
                                        <ChevronDown size={16} color={colors.textFaint} />
                                    </Pressable>
                                    {walletDropdownOpen && (
                                        <View style={styles.walletDropdown}>
                                            {wallets.map((w) => (
                                                <Pressable
                                                    key={w.id}
                                                    style={[styles.walletDropdownRow, w.id === selectedWalletId && styles.walletDropdownRowActive]}
                                                    onPress={() => { setSelectedWalletId(w.id); setWalletDropdownOpen(false); }}
                                                >
                                                    <Text style={[styles.walletDropdownName, w.id === selectedWalletId && styles.walletDropdownNameActive]}>{w.name}</Text>
                                                    <Text style={styles.walletDropdownBalance}>{formatKwacha(w.balance)}</Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                    )}
                                    {selectedWallet && amount > 0 && selectedWallet.balance < amount && (
                                        <Text style={styles.insufficientText}>Insufficient balance in {selectedWallet.name}.</Text>
                                    )}
                                </View>
                            )}

                            {payMethod === 'MOBILE_MONEY' && (
                                <View style={styles.walletSection}>
                                    <Text style={styles.fieldLabel}>Enter your mobile money number</Text>
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
                            )}

                            {payMethod === 'CARD' && (
                                <View style={styles.cardComingSoon}>
                                    <Text style={styles.cardComingSoonTitle}>Card payments coming soon</Text>
                                    <Text style={styles.cardComingSoonSub}>Use Moneywise or Mobile Money for now.</Text>
                                </View>
                            )}
                        </ScrollView>

                        <View style={styles.payFooter}>
                            <View style={styles.payFooterRow}>
                                <Text style={styles.payFooterLabel}>Transfer Amount</Text>
                                <Text style={styles.payFooterLabel}>{formatKwacha(amount)}</Text>
                            </View>
                            {payMethod !== 'WALLET' && (
                                <View style={styles.payFooterRow}>
                                    <Text style={styles.payFooterSubLabel}>Withdraw Charge</Text>
                                    <Text style={styles.payFooterSubLabel}>{formatKwacha(charge)}</Text>
                                </View>
                            )}
                            <Pressable style={[styles.ctaBtn, payDisabled && styles.ctaBtnDisabled]} onPress={handlePayCta} disabled={payDisabled}>
                                <Text style={styles.ctaBtnText}>Invest {formatKwacha(amount)}</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                {step === 'WAITING' && (
                    <PaymentWaitingScreen
                        phase={phase}
                        amount={amount}
                        businessName={provider.name}
                        payerPhone={phone}
                        operator={operator}
                        elapsedSeconds={elapsed}
                        reference={reference}
                        onCancel={() => { clearTimers(); setStep('PAY'); }}
                        onDone={() => setStep('SUCCESS')}
                    />
                )}

                {step === 'ACTIVATING' && (
                    <View style={[styles.activatingRoot, { paddingTop: insets.top }]}>
                        <ActivityIndicator size="large" color={colors.blue} />
                        <Text style={styles.activatingText}>
                            {method === 'AUTO_INVEST' ? 'Activating Auto-Invest…' : `Paying from ${selectedWallet?.name || 'wallet'}…`}
                        </Text>
                    </View>
                )}

                {step === 'SUCCESS' && (
                    <View style={[styles.successRoot, { paddingTop: insets.top }]}>
                        <View style={styles.successCenter}>
                            <View style={styles.successIcon}><CheckCircle2 size={44} color="#05C702" /></View>
                            <Text style={styles.successTitle}>{method === 'AUTO_INVEST' ? 'Auto-Invest Activated' : 'Investment Successful'}</Text>
                            <Text style={styles.successSub}>
                                {method === 'AUTO_INVEST'
                                    ? `${formatKwacha(amount)} will be deducted from your payroll each cycle.`
                                    : `Your deposit into ${product.name} was successful.`}
                            </Text>

                            <View style={styles.successSummary}>
                                <SummaryRow label="Product" value={product.name} />
                                <SummaryRow label="Company" value={provider.name} />
                                <SummaryRow label="Amount" value={formatKwacha(amount)} />
                                {isUnitTrust && <SummaryRow label="Units Acquired" value={units.toLocaleString(undefined, { maximumFractionDigits: 2 })} />}
                                <SummaryRow label="Method" value={methodLabel} />
                                <SummaryRow label="Reference" value={reference} mono last />
                            </View>
                        </View>

                        <Pressable style={styles.successDoneBtn} onPress={handleClose}>
                            <Text style={styles.successDoneBtnText}>Done</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const SummaryRow: React.FC<{ label: string; value: string; mono?: boolean; last?: boolean }> = ({ label, value, mono, last }) => (
    <View style={[styles.summaryRow, !last && styles.summaryRowBorder]}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={[styles.summaryValue, mono && styles.summaryValueMono]} numberOfLines={1}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },

    // METHOD
    methodSheet: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, gap: 4 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sheetTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    sheetSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: 18 },
    methodOption: {
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg,
        borderWidth: 1, borderColor: colors.border, marginBottom: 12,
    },
    methodIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    methodIconEmoji: { fontSize: 18 },
    methodTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    methodDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },

    // AMOUNT
    amountRoot: { flex: 1, backgroundColor: colors.canvasAlt },
    amountHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    amountHeaderTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    amountDisplayWrap: { alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingTop: 8 },
    amountCaption: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text, textAlign: 'center' },
    amountBig: { fontFamily: fonts.bodyBold, fontSize: 44, color: colors.text },
    unitLine: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
    unitLineBold: { fontFamily: fonts.bodyBold, color: colors.textFaint },
    quickAmountRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, marginTop: 20 },
    quickAmountBtn: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    quickAmountText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    keypad: { flex: 1, justifyContent: 'center', gap: 6, paddingHorizontal: 30, marginTop: 12 },
    keypadRow: { flexDirection: 'row', alignItems: 'center', gap: 30 },
    keypadKey: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    keypadKeyText: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.text },
    amountFooter: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 12 },
    totalLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
    totalValue: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
    ctaBtn: { backgroundColor: colors.text, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    ctaBtnDisabled: { backgroundColor: colors.borderStrong },
    ctaBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },

    // PAY
    payRoot: { flex: 1, backgroundColor: colors.canvasAlt },
    payHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    payHeaderTitle: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text },
    payScroll: { padding: 16, gap: 4 },
    payTabRow: { flexDirection: 'row', gap: 4, backgroundColor: colors.border, borderRadius: radius.pill, padding: 4 },
    payTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: radius.pill },
    payTabActive: { backgroundColor: colors.surface },
    payTabIcon: { fontSize: 12 },
    payTabText: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    payTabTextActive: { fontFamily: fonts.bodyBold, color: colors.text },
    walletSection: { marginTop: 22 },
    fieldLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginBottom: 8 },
    walletSelector: {
        height: 56, paddingHorizontal: 18, backgroundColor: colors.surface, borderRadius: radius.lg,
        borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    walletSelectorName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
    walletSelectorBalance: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    walletDropdown: {
        marginTop: 4, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    walletDropdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 13 },
    walletDropdownRowActive: { backgroundColor: colors.tabActiveBg },
    walletDropdownName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    walletDropdownNameActive: { color: colors.blue },
    walletDropdownBalance: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted },
    insufficientText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.danger, marginTop: 8 },
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
    cardComingSoon: { marginTop: 22, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center' },
    cardComingSoonTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    cardComingSoonSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 4 },
    payFooter: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, gap: 8 },
    payFooterRow: { flexDirection: 'row', justifyContent: 'space-between' },
    payFooterLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    payFooterSubLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted },

    // ACTIVATING
    activatingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    activatingText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },

    // SUCCESS
    successRoot: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
    successCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
    successTitle: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text, textAlign: 'center' },
    successSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: -8 },
    successSummary: { width: '100%', backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 16, marginTop: 8 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 },
    summaryRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    summaryLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    summaryValue: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text, flexShrink: 1, textAlign: 'right' },
    summaryValueMono: { fontFamily: fonts.body },
    successDoneBtn: { backgroundColor: colors.text, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
    successDoneBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
});
