import { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    X, ArrowRight, ArrowLeft, Plus, Minus, Trash2, User, List, AlertCircle,
    CheckCircle, Smartphone, Building2, Mail, Zap, ChevronDown, Search,
} from 'lucide-react-native';
import {
    requisitionService, departmentService, lencoService, cashbookService, userService,
    formatKwacha,
} from 'core';
import type { PaymentInfo } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { AnimatedSegmented, AnimatedTabContent } from '../../src/components/AnimatedTabs';
import { colors, fonts, radius } from '../../src/theme/tokens';

interface LineItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
}

const blankItem = (): LineItem => ({
    id: Math.random().toString(36).slice(2),
    description: '', quantity: 1, unit_price: 0, estimated_amount: 0,
});

type WizardTab = 'basic' | 'buy' | 'order';
const TABS: { value: WizardTab; label: string }[] = [
    { value: 'basic', label: 'Send' },
    { value: 'buy', label: 'Buy' },
    { value: 'order', label: 'Order' },
];

// Stages: 1 = basic details, 2 = expense list, 3 = payment method,
// 4 = review, 5 = manual amount (used instead of 2 when there's no item list).
type Stage = 1 | 2 | 3 | 4 | 5;

/**
 * New Requisition — a native port of the web mobile wizard
 * (apps/web/src/components/requisitions/MobileRequisitionWizard.tsx):
 * same Send/Buy/Order tabs (Buy/Order are still "coming soon" on web too),
 * same staged flow, same destination-account + Lenco name-resolution step.
 */
export default function NewRequisitionScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { userName, userRole, organizationId } = useAuth();

    const [activeTab, setActiveTab] = useState<WizardTab>('basic');
    const [stage, setStage] = useState<Stage>(1);

    // Stage 1
    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const [deptPickerOpen, setDeptPickerOpen] = useState(false);
    const [useMyAccount, setUseMyAccount] = useState(true);
    const [makeExpenseList, setMakeExpenseList] = useState(true);

    // Stage 2
    const [lineItems, setLineItems] = useState<LineItem[]>([blankItem()]);

    // Stage 5
    const [manualAmount, setManualAmount] = useState('');

    // Stage 3
    const [paymentMethod, setPaymentMethod] = useState<'mobile' | 'bank'>('mobile');
    const [bankId, setBankId] = useState('');
    const [bankPickerOpen, setBankPickerOpen] = useState(false);
    const [accountNumber, setAccountNumber] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [momoOperator, setMomoOperator] = useState('');
    const [resolvedName, setResolvedName] = useState('');
    const [confirmingName, setConfirmingName] = useState(false);
    const [autoAuthorize, setAutoAuthorize] = useState(false);
    const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
    const [selectedWalletBalance, setSelectedWalletBalance] = useState<number | null>(null);
    const [walletPickerOpen, setWalletPickerOpen] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeRequisitionId, setActiveRequisitionId] = useState<string | null>(null);

    const { data: deptConfig } = useQuery({ queryKey: ['departments'], queryFn: () => departmentService.list() });
    const useDepartments = deptConfig?.use_departments ?? false;
    const orgDepartments = deptConfig?.departments ?? [];

    const { data: banksRaw } = useQuery({ queryKey: ['lenco-banks'], queryFn: () => lencoService.getBanks() });
    const banks: any[] = Array.isArray(banksRaw) ? banksRaw : (banksRaw?.data || []);

    const { data: profile, isLoading: loadingProfile } = useQuery({
        queryKey: ['my-profile'], queryFn: () => userService.getMyProfile(),
    });
    const paymentInfo: PaymentInfo | null | undefined = profile?.payment_info;

    const { data: walletsRaw } = useQuery({ queryKey: ['wallets'], queryFn: () => cashbookService.getWallets() });
    const wallets: any[] = Array.isArray(walletsRaw) ? walletsRaw : (walletsRaw?.data || []);

    useEffect(() => {
        if (wallets.length > 0 && !selectedWalletId) {
            const main = wallets.find((w: any) => w.is_main) || wallets[0];
            setSelectedWalletId(main.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wallets.length]);

    useEffect(() => {
        if (!autoAuthorize || useMyAccount || !selectedWalletId) { setSelectedWalletBalance(null); return; }
        let cancelled = false;
        cashbookService.getBalance('MONEYWISE_WALLET', undefined, selectedWalletId)
            .then((balance: any) => { if (!cancelled) setSelectedWalletBalance(Number(balance) || 0); })
            .catch(() => { if (!cancelled) setSelectedWalletBalance(null); });
        return () => { cancelled = true; };
    }, [autoAuthorize, useMyAccount, selectedWalletId]);

    const handleResolveName = async () => {
        if (paymentMethod === 'mobile') {
            if (phoneNumber.length < 10 || !momoOperator) return;
            setConfirmingName(true);
            try {
                const res = await lencoService.resolveMobileMoney(phoneNumber, momoOperator, organizationId ?? undefined);
                setResolvedName(res.accountName || res.account_name || res.name || '');
            } catch {
                setResolvedName('Name not confirmed');
            } finally {
                setConfirmingName(false);
            }
        } else {
            if (accountNumber.length < 5 || !bankId) return;
            setConfirmingName(true);
            try {
                const res = await lencoService.resolveBankAccount(accountNumber, bankId, organizationId ?? undefined);
                setResolvedName(res.accountName || res.account_name || res.name || '');
            } catch {
                setResolvedName('Name not confirmed');
            } finally {
                setConfirmingName(false);
            }
        }
    };

    useEffect(() => {
        if (paymentMethod === 'mobile' && phoneNumber.length >= 10) handleResolveName();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phoneNumber, momoOperator]);

    useEffect(() => {
        if (paymentMethod === 'bank' && accountNumber.length >= 5 && bankId) handleResolveName();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountNumber, bankId]);

    useEffect(() => {
        setResolvedName('');
        setConfirmingName(false);
        if (paymentMethod === 'bank') setPhoneNumber('');
        else { setAccountNumber(''); setBankId(''); }
    }, [paymentMethod]);

    const onPhoneChange = (val: string) => {
        setPhoneNumber(val);
        const clean = val.replace(/[^0-9]/g, '');
        const normalized = clean.startsWith('260') ? '0' + clean.substring(3) : clean;
        let operator = '';
        if (normalized.startsWith('097') || normalized.startsWith('077')) operator = 'AIRTEL';
        else if (normalized.startsWith('096') || normalized.startsWith('076')) operator = 'MTN';
        else if (normalized.startsWith('095') || normalized.startsWith('075')) operator = 'ZAMTEL';
        setMomoOperator(operator);
    };

    const getTotal = () => makeExpenseList
        ? lineItems.reduce((s, i) => s + Number(i.estimated_amount), 0)
        : (Number(manualAmount) || 0);

    const isWalletBalanceInsufficient = autoAuthorize && !useMyAccount &&
        !!selectedWalletId && selectedWalletBalance !== null && getTotal() > selectedWalletBalance;

    const updateLineItem = (id: string, patch: Partial<LineItem>) => {
        setLineItems((prev) => prev.map((item) => {
            if (item.id !== id) return item;
            const updated = { ...item, ...patch };
            if ('quantity' in patch || 'unit_price' in patch) {
                updated.estimated_amount = Number(updated.quantity) * Number(updated.unit_price);
            }
            return updated;
        }));
    };

    const addLineItem = () => setLineItems((prev) => [...prev, blankItem()]);
    const removeLineItem = (id: string) => {
        if (lineItems.length === 1) { setLineItems([blankItem()]); return; }
        setLineItems((prev) => prev.filter((i) => i.id !== id));
    };

    // Ordered stage sequence for the current toggle choices — 2 or 5 for the
    // amount step, 3 only when not sending to the requester's own account.
    const getStageSequence = (): Stage[] => {
        const seq: Stage[] = [1];
        seq.push(makeExpenseList ? 2 : 5);
        if (!useMyAccount) seq.push(3);
        seq.push(4);
        return seq;
    };

    const handleProceed = () => {
        setError(null);
        if (stage === 1) {
            if (!description.trim()) { setError('Please describe the purpose.'); return; }
            if (useDepartments && !department) { setError('Please select a department.'); return; }
        } else if (stage === 5) {
            if (!manualAmount || Number(manualAmount) <= 0) { setError('Please enter an amount greater than zero.'); return; }
        } else if (stage === 3) {
            if (!resolvedName || resolvedName === 'Name not confirmed') { setError('Please verify the recipient details.'); return; }
        }
        const seq = getStageSequence();
        const idx = seq.indexOf(stage);
        if (idx !== -1 && idx < seq.length - 1) setStage(seq[idx + 1]);
    };

    const handleBack = () => {
        setError(null);
        const seq = getStageSequence();
        const idx = seq.indexOf(stage);
        if (idx > 0) setStage(seq[idx - 1]);
        else router.back();
    };

    const handleSubmit = async () => {
        if (isWalletBalanceInsufficient) {
            setError(`This wallet only has ${formatKwacha(selectedWalletBalance || 0)} available, but ${formatKwacha(getTotal())} is needed. Choose another wallet or top it up first.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        setActiveRequisitionId(null);
        try {
            const data: any = {
                description,
                department,
                estimated_total: getTotal(),
                items: makeExpenseList ? lineItems.map(({ description, quantity, unit_price, estimated_amount }) => ({
                    description, quantity: Number(quantity), unit_price: Number(unit_price), estimated_amount: Number(estimated_amount),
                })) : undefined,
                payment_method: useMyAccount
                    ? (paymentInfo?.mobile_money_number ? paymentInfo.mobile_money_provider : (paymentInfo?.bank_account_number ? 'BANK' : undefined))
                    : (paymentMethod === 'mobile' ? momoOperator : 'BANK'),
                recipient_account: useMyAccount
                    ? (paymentInfo?.mobile_money_number || paymentInfo?.bank_account_number)
                    : (paymentMethod === 'mobile' ? phoneNumber : accountNumber),
                recipient_bank_code: useMyAccount
                    ? (paymentInfo?.mobile_money_number ? paymentInfo.mobile_money_provider : (paymentInfo?.bank_name || undefined))
                    : (paymentMethod === 'bank' ? bankId : (paymentMethod === 'mobile' ? momoOperator : undefined)),
                recipient_name: useMyAccount
                    ? (paymentInfo?.mobile_money_name || paymentInfo?.bank_account_name || userName)
                    : resolvedName,
            };
            const created = await requisitionService.create(data);

            if (autoAuthorize && userRole === 'ADMIN' && !useMyAccount) {
                try {
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    const normalizedPhone = cleanPhone.startsWith('260') ? '0' + cleanPhone.substring(3) : cleanPhone;
                    const recipientAccount = paymentMethod === 'mobile' ? normalizedPhone : accountNumber;
                    const recipientBankCode = (paymentMethod === 'mobile' ? momoOperator : bankId).toLowerCase();

                    const result = await requisitionService.autoDisburse(created.id, {
                        payment_method: 'MONEYWISE_WALLET',
                        total_prepared: getTotal(),
                        recipient_account: recipientAccount,
                        recipient_bank_code: recipientBankCode,
                        recipient_account_name: resolvedName || undefined,
                        wallet_id: selectedWalletId || undefined,
                    });

                    if (result.lencoStatus === 'pending') {
                        for (let attempt = 0; attempt < 8; attempt++) {
                            await new Promise((r) => setTimeout(r, 4000));
                            const poll = await requisitionService.verifyDisbursement(created.id);
                            if (poll.status === 'successful') break;
                            if (poll.status === 'failed') {
                                throw new Error(poll.error || poll.details?.reasonForFailure || 'The transfer was rejected by Lenco.');
                            }
                        }
                    }
                } catch (disbErr: any) {
                    setActiveRequisitionId(created.id);
                    setError(`${disbErr.message || 'Disbursement failed.'} The requisition was created — open it to disburse manually.`);
                    setSubmitting(false);
                    return;
                }
            }

            qc.invalidateQueries({ queryKey: ['requisitions'] });
            router.back();
        } catch (e: any) {
            setError(e?.message ?? 'Submission failed. Please try again.');
            if (e?.activeRequisitionId) setActiveRequisitionId(e.activeRequisitionId);
        } finally {
            setSubmitting(false);
        }
    };

    const total = getTotal();

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.brandBar, { paddingTop: insets.top }]}>
                <Text style={styles.brandText}>MoneyWise<Text style={styles.brandAccent}>Pro</Text></Text>
            </View>

            <View style={styles.header}>
                <Text style={styles.headerTitle}>New Requisition</Text>
                <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close">
                    <X size={16} color={colors.navy} strokeWidth={3} />
                </Pressable>
            </View>

            <AnimatedSegmented
                value={activeTab}
                onChange={(v) => setActiveTab(v as WizardTab)}
                trackStyle={styles.tabTrack}
                indicatorStyle={styles.tabIndicator}
                itemStyle={styles.tab}
                items={TABS.map((t) => ({
                    value: t.value,
                    content: <Text style={[styles.tabText, activeTab === t.value && styles.tabTextActive]}>{t.label}</Text>,
                }))}
            />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <AnimatedTabContent tabKey={activeTab} index={TABS.findIndex((t) => t.value === activeTab)}>
                {activeTab !== 'basic' ? (
                    <View style={styles.comingSoon}>
                        <View style={styles.comingSoonIcon}><AlertCircle size={28} color={colors.borderStrong} /></View>
                        <Text style={styles.comingSoonTitle}>{activeTab === 'buy' ? 'Buy' : 'Order'} Feature Loading</Text>
                        <Text style={styles.comingSoonSub}>This feature is coming soon. Stay tuned!</Text>
                    </View>
                ) : (
                    <>
                        {error && (
                            <View style={styles.errorCard}>
                                <AlertCircle size={16} color={colors.danger} />
                                <Text style={styles.errorText}>{error}</Text>
                                {activeRequisitionId && (
                                    <Pressable
                                        style={styles.errorCta}
                                        onPress={() => router.replace(`/requisition/${activeRequisitionId}`)}
                                    >
                                        <Text style={styles.errorCtaText}>Finish Transaction</Text>
                                        <ArrowRight size={14} color="#FFFFFF" />
                                    </Pressable>
                                )}
                            </View>
                        )}

                        {stage === 1 && (
                            <View style={styles.stageGap}>
                                <Text style={styles.stageTitle}>Request Details</Text>

                                <View style={styles.field}>
                                    <Text style={styles.label}>Purpose of funds</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={description}
                                        onChangeText={setDescription}
                                        placeholder="What is this request for?"
                                        placeholderTextColor={colors.textFaint}
                                    />
                                </View>

                                {useDepartments && (
                                    <View style={styles.field}>
                                        <Text style={styles.label}>Department</Text>
                                        <Pressable style={styles.selectInput} onPress={() => setDeptPickerOpen(true)}>
                                            <Text style={[styles.selectInputText, !department && styles.selectInputPlaceholder]}>
                                                {department || 'Select Department'}
                                            </Text>
                                            <ChevronDown size={16} color={colors.textFaint} />
                                        </Pressable>
                                    </View>
                                )}

                                <ToggleRow
                                    icon={<User size={20} color={useMyAccount ? colors.blue : colors.textFaint} />}
                                    title="Send to my account"
                                    subtitle="Use details from your profile"
                                    value={useMyAccount}
                                    onToggle={() => setUseMyAccount((v) => !v)}
                                />

                                {useMyAccount && (
                                    loadingProfile ? (
                                        <View style={styles.profileLoading}>
                                            <ActivityIndicator size="small" color={colors.textFaint} />
                                            <Text style={styles.profileLoadingText}>Checking your account details...</Text>
                                        </View>
                                    ) : paymentInfo && (paymentInfo.bank_account_number || paymentInfo.mobile_money_number) ? (
                                        <View style={styles.profileFoundCard}>
                                            <View style={styles.profileFoundHeader}>
                                                <CheckCircle size={14} color={colors.positiveInk} />
                                                <Text style={styles.profileFoundLabel}>Profile Details Found</Text>
                                            </View>
                                            {!!paymentInfo.bank_account_number && (
                                                <View style={styles.profileRow}>
                                                    <Building2 size={14} color={colors.textFaint} />
                                                    <Text style={styles.profileRowText}>{paymentInfo.bank_name} · {paymentInfo.bank_account_number}</Text>
                                                </View>
                                            )}
                                            {!!paymentInfo.mobile_money_number && (
                                                <View style={styles.profileRow}>
                                                    <Smartphone size={14} color={colors.textFaint} />
                                                    <Text style={styles.profileRowText}>{paymentInfo.mobile_money_provider} · {paymentInfo.mobile_money_number}</Text>
                                                </View>
                                            )}
                                        </View>
                                    ) : (
                                        <View style={styles.warnCard}>
                                            <AlertCircle size={16} color={colors.warn} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.warnTitle}>No account details found</Text>
                                                <Text style={styles.warnSub}>Please add your bank or mobile money details in Settings → My Profile to use this option.</Text>
                                            </View>
                                        </View>
                                    )
                                )}

                                <ToggleRow
                                    icon={<List size={20} color={makeExpenseList ? colors.blue : colors.textFaint} />}
                                    title="Create item list"
                                    subtitle="Add specific items and prices"
                                    value={makeExpenseList}
                                    onToggle={() => setMakeExpenseList((v) => !v)}
                                />
                            </View>
                        )}

                        {stage === 2 && (
                            <View style={styles.stageGap}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.stageTitle}>Expense List</Text>
                                    <Text style={styles.stageTotalHeader}>{formatKwacha(total)}</Text>
                                </View>
                                {lineItems.map((item, idx) => (
                                    <View key={item.id} style={styles.itemBlock}>
                                        <View style={styles.itemTopRow}>
                                            <View style={styles.itemIndexBadge}><Text style={styles.itemIndexText}>{idx + 1}</Text></View>
                                            <TextInput
                                                style={styles.itemDescInput}
                                                value={item.description}
                                                onChangeText={(v) => updateLineItem(item.id, { description: v })}
                                                placeholder="Item Description"
                                                placeholderTextColor={colors.textFaint}
                                            />
                                            <Text style={styles.itemAmount}>{item.estimated_amount > 0 ? formatKwacha(item.estimated_amount) : '-'}</Text>
                                            <Pressable onPress={() => removeLineItem(item.id)} hitSlop={8}>
                                                <Trash2 size={18} color={colors.textFaint} />
                                            </Pressable>
                                        </View>
                                        <View style={styles.itemBottomRow}>
                                            <View style={styles.itemPriceWrap}>
                                                <Text style={styles.itemPricePrefix}>K</Text>
                                                <TextInput
                                                    style={styles.itemPriceInput}
                                                    value={item.unit_price ? String(item.unit_price) : ''}
                                                    onChangeText={(v) => updateLineItem(item.id, { unit_price: Number(v.replace(/[^0-9.]/g, '')) || 0 })}
                                                    keyboardType="decimal-pad"
                                                    placeholder="0.00"
                                                    placeholderTextColor={colors.textFaint}
                                                />
                                            </View>
                                            <View style={styles.qtyStepper}>
                                                <Pressable style={styles.qtyBtn} onPress={() => updateLineItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}>
                                                    <Minus size={14} color={colors.textMuted} />
                                                </Pressable>
                                                <Text style={styles.qtyValue}>{item.quantity}</Text>
                                                <Pressable style={styles.qtyBtn} onPress={() => updateLineItem(item.id, { quantity: item.quantity + 1 })}>
                                                    <Plus size={14} color={colors.textMuted} />
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                                <Pressable style={styles.addItemBtn} onPress={addLineItem}>
                                    <Plus size={18} color={colors.textFaint} />
                                    <Text style={styles.addItemText}>Add Another Item</Text>
                                </Pressable>
                            </View>
                        )}

                        {stage === 5 && (
                            <View style={styles.stageGap}>
                                <View>
                                    <Text style={styles.stageTitle}>Amount Requested</Text>
                                    <Text style={styles.stageSub}>Enter the total amount you are requesting.</Text>
                                </View>
                                <View style={styles.field}>
                                    <Text style={styles.label}>Amount (ZMW)</Text>
                                    <View style={styles.amountWrap}>
                                        <Text style={styles.amountPrefix}>K</Text>
                                        <TextInput
                                            style={styles.amountInput}
                                            value={manualAmount}
                                            onChangeText={(v) => setManualAmount(v.replace(/[^0-9.]/g, ''))}
                                            keyboardType="decimal-pad"
                                            placeholder="0.00"
                                            placeholderTextColor={colors.textFaint}
                                            autoFocus
                                        />
                                    </View>
                                </View>
                            </View>
                        )}

                        {stage === 3 && (
                            <View style={styles.stageGap}>
                                <Text style={styles.stageTitle}>Payment Method</Text>

                                <AnimatedSegmented
                                    value={paymentMethod}
                                    onChange={(v) => setPaymentMethod(v as 'mobile' | 'bank')}
                                    trackStyle={styles.methodTrack}
                                    indicatorStyle={styles.methodIndicator}
                                    itemStyle={styles.methodBtn}
                                    items={[
                                        {
                                            value: 'mobile',
                                            content: <Text style={[styles.methodBtnText, paymentMethod === 'mobile' && styles.methodBtnTextActive]}>Mobile Money</Text>,
                                        },
                                        {
                                            value: 'bank',
                                            content: <Text style={[styles.methodBtnText, paymentMethod === 'bank' && styles.methodBtnTextActive]}>Bank Account</Text>,
                                        },
                                    ]}
                                />

                                <AnimatedTabContent tabKey={paymentMethod} index={paymentMethod === 'bank' ? 1 : 0} style={{ gap: 18 }}>
                                {paymentMethod === 'mobile' ? (
                                    <View style={styles.field}>
                                        <Text style={styles.label}>Phone Number</Text>
                                        <View style={styles.phoneWrap}>
                                            <TextInput
                                                style={styles.phoneInput}
                                                value={phoneNumber}
                                                onChangeText={onPhoneChange}
                                                placeholder="Enter phone number"
                                                placeholderTextColor={colors.textFaint}
                                                keyboardType="phone-pad"
                                            />
                                            {!!momoOperator && (
                                                <View style={styles.operatorBadge}>
                                                    <Text style={[
                                                        styles.operatorBadgeText,
                                                        momoOperator === 'AIRTEL' && { color: '#EF4444' },
                                                        momoOperator === 'MTN' && { color: '#D97706' },
                                                        momoOperator === 'ZAMTEL' && { color: '#059669' },
                                                    ]}>{momoOperator}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                ) : (
                                    <>
                                        <View style={styles.field}>
                                            <Text style={styles.label}>Bank</Text>
                                            <Pressable style={styles.selectInput} onPress={() => setBankPickerOpen(true)}>
                                                <Text style={[styles.selectInputText, !bankId && styles.selectInputPlaceholder]}>
                                                    {banks.find((b) => String(b.code ?? b.id) === bankId)?.name || 'Select Bank'}
                                                </Text>
                                                <ChevronDown size={16} color={colors.textFaint} />
                                            </Pressable>
                                        </View>
                                        <View style={styles.field}>
                                            <Text style={styles.label}>Account Number</Text>
                                            <TextInput
                                                style={styles.input}
                                                value={accountNumber}
                                                onChangeText={setAccountNumber}
                                                placeholder="Enter account number"
                                                placeholderTextColor={colors.textFaint}
                                                keyboardType="number-pad"
                                            />
                                        </View>
                                    </>
                                )}
                                </AnimatedTabContent>

                                {(phoneNumber.length >= 10 || accountNumber.length >= 5) && (
                                    <View style={styles.holderCard}>
                                        {confirmingName
                                            ? <ActivityIndicator size="small" color={colors.blue} />
                                            : resolvedName
                                                ? <CheckCircle size={16} color={colors.positiveInk} />
                                                : <AlertCircle size={16} color={colors.warn} />}
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.holderLabel}>Account Holder</Text>
                                            <Text style={styles.holderName}>{confirmingName ? 'Verifying account...' : (resolvedName || 'Waiting for valid details...')}</Text>
                                        </View>
                                    </View>
                                )}

                                {userRole === 'ADMIN' && (
                                    <View>
                                        <ToggleRow
                                            icon={<Zap size={20} color={autoAuthorize ? colors.blue : colors.textFaint} />}
                                            title="Auto-authorize & send"
                                            subtitle="Approve and disburse instantly on submit"
                                            value={autoAuthorize}
                                            onToggle={() => setAutoAuthorize((v) => !v)}
                                        />
                                        {autoAuthorize && (
                                            <View style={styles.autoAuthWarn}>
                                                <AlertCircle size={13} color={colors.warn} />
                                                <Text style={styles.autoAuthWarnText}>Funds will be sent immediately via Lenco when you tap Send. This cannot be undone.</Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        )}

                        {stage === 4 && (
                            <View style={styles.stageGap}>
                                <Text style={styles.reviewHeader}>Requisition Summary</Text>

                                <View style={styles.heroWrap}>
                                    <View style={styles.heroLabelRow}>
                                        <Mail size={16} color={colors.textMuted} />
                                        <Text style={styles.heroLabel}>Requisition Total</Text>
                                    </View>
                                    <Text style={styles.heroAmount}>{formatKwacha(total)}</Text>
                                </View>

                                <View style={styles.reviewCard}>
                                    <View style={styles.reviewRow}>
                                        <Text style={styles.reviewLabel}>Payment Method</Text>
                                        <Text style={styles.reviewValue}>{paymentMethod === 'mobile' ? 'Mobile Money' : 'Bank Transfer'}</Text>
                                    </View>
                                    <View style={styles.reviewRow}>
                                        <Text style={styles.reviewLabel}>Account Number</Text>
                                        <Text style={styles.reviewValue}>{paymentMethod === 'mobile' ? phoneNumber : accountNumber}</Text>
                                    </View>
                                    <View style={styles.reviewRow}>
                                        <Text style={styles.reviewLabel}>Account Name</Text>
                                        <Text style={styles.reviewValue}>{useMyAccount ? (paymentInfo?.mobile_money_name || paymentInfo?.bank_account_name || 'My Account') : (resolvedName || '—')}</Text>
                                    </View>
                                </View>

                                {autoAuthorize && !useMyAccount && wallets.length > 1 && (
                                    <View style={styles.reviewCard}>
                                        <Text style={styles.label}>Send From Wallet</Text>
                                        <Pressable style={[styles.selectInput, { marginTop: 8 }]} onPress={() => setWalletPickerOpen(true)}>
                                            <Text style={styles.selectInputText}>{wallets.find((w) => w.id === selectedWalletId)?.name || 'Select Wallet'}</Text>
                                            <ChevronDown size={16} color={colors.textFaint} />
                                        </Pressable>
                                        {isWalletBalanceInsufficient && (
                                            <Text style={styles.insufficientText}>
                                                This wallet only has {formatKwacha(selectedWalletBalance || 0)} available — this request needs {formatKwacha(total)}. Choose another wallet or top it up first.
                                            </Text>
                                        )}
                                    </View>
                                )}

                                {makeExpenseList && (
                                    <View style={styles.reviewCard}>
                                        {lineItems.filter((i) => i.description).map((item) => (
                                            <View key={item.id} style={styles.reviewRow}>
                                                <Text style={styles.reviewItemDesc}>{item.description}</Text>
                                                <Text style={styles.reviewValue}>{formatKwacha(item.estimated_amount)}</Text>
                                            </View>
                                        ))}
                                        <View style={styles.reviewTotalRow}>
                                            <Text style={styles.reviewTotalLabel}>Requisition Total</Text>
                                            <Text style={styles.reviewTotalLabel}>{formatKwacha(total)}</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </>
                )}
                </AnimatedTabContent>
            </ScrollView>

            {activeTab === 'basic' && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                    {stage !== 4 ? (
                        <View style={styles.footerRowEnd}>
                            <Pressable style={styles.proceedBtn} onPress={handleProceed}>
                                <ArrowRight size={22} color="#FFFFFF" />
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.footerRow}>
                            <Pressable style={styles.backBtn} onPress={handleBack}>
                                <ArrowLeft size={22} color={colors.blue} />
                            </Pressable>
                            <Pressable
                                style={[styles.submitBtn, (submitting || isWalletBalanceInsufficient) && styles.submitBtnDisabled]}
                                onPress={handleSubmit}
                                disabled={submitting || isWalletBalanceInsufficient}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Text style={styles.submitBtnText}>{autoAuthorize && !useMyAccount ? 'Send' : 'Submit Request'}</Text>
                                        <ArrowRight size={18} color="#FFFFFF" />
                                    </>
                                )}
                            </Pressable>
                        </View>
                    )}
                </View>
            )}

            <PickerSheet
                visible={deptPickerOpen}
                onClose={() => setDeptPickerOpen(false)}
                title="Select Department"
                items={orgDepartments.map((d) => ({ id: d.id, label: d.name }))}
                onSelect={(item) => { setDepartment(item.label); setDeptPickerOpen(false); }}
            />

            <PickerSheet
                visible={bankPickerOpen}
                onClose={() => setBankPickerOpen(false)}
                title="Select Bank"
                items={banks.map((b) => ({ id: String(b.code ?? b.id), label: b.name }))}
                searchable
                onSelect={(item) => { setBankId(item.id); setBankPickerOpen(false); }}
            />

            <PickerSheet
                visible={walletPickerOpen}
                onClose={() => setWalletPickerOpen(false)}
                title="Select Wallet"
                items={wallets.map((w) => ({ id: w.id, label: w.name }))}
                onSelect={(item) => { setSelectedWalletId(item.id); setWalletPickerOpen(false); }}
            />
        </KeyboardAvoidingView>
    );
}

const ToggleRow: React.FC<{
    icon: React.ReactNode; title: string; subtitle: string; value: boolean; onToggle: () => void;
}> = ({ icon, title, subtitle, value, onToggle }) => (
    <Pressable style={styles.toggleRow} onPress={onToggle}>
        <View style={styles.toggleLeft}>
            <View style={[styles.toggleIconWrap, value ? styles.toggleIconActive : styles.toggleIconInactive]}>{icon}</View>
            <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>{title}</Text>
                <Text style={styles.toggleSub}>{subtitle}</Text>
            </View>
        </View>
        <View style={[styles.switchTrack, value ? styles.switchTrackActive : styles.switchTrackInactive]}>
            <View style={[styles.switchDot, value ? styles.switchDotActive : styles.switchDotInactive]} />
        </View>
    </Pressable>
);

const PickerSheet: React.FC<{
    visible: boolean; onClose: () => void; title: string;
    items: { id: string; label: string }[]; searchable?: boolean;
    onSelect: (item: { id: string; label: string }) => void;
}> = ({ visible, onClose, title, items, searchable, onSelect }) => {
    const [query, setQuery] = useState('');
    const filtered = query ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())) : items;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.pickerBackdrop} onPress={onClose}>
                <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
                    <Text style={styles.pickerTitle}>{title}</Text>
                    {searchable && (
                        <View style={styles.pickerSearchWrap}>
                            <Search size={15} color={colors.textFaint} />
                            <TextInput
                                style={styles.pickerSearchInput}
                                value={query}
                                onChangeText={setQuery}
                                placeholder="Search"
                                placeholderTextColor={colors.textFaint}
                            />
                        </View>
                    )}
                    <FlatList
                        data={filtered}
                        keyExtractor={(item) => item.id}
                        style={styles.pickerList}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <Pressable style={styles.pickerRow} onPress={() => onSelect(item)}>
                                <Text style={styles.pickerRowText}>{item.label}</Text>
                            </Pressable>
                        )}
                    />
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    brandBar: { borderBottomWidth: 1, borderBottomColor: colors.canvasAlt, paddingHorizontal: 24, paddingBottom: 16 },
    brandText: { fontFamily: fonts.bodyMedium, fontSize: 19, color: colors.navy, marginTop: 12 },
    brandAccent: { fontFamily: fonts.bodyBold, color: colors.blue },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    tabTrack: {
        flexDirection: 'row', gap: 4, marginHorizontal: 24, marginTop: 8, padding: 4,
        backgroundColor: colors.chipActiveBg, borderRadius: radius.pill,
    },
    tab: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    tabIndicator: {
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    tabText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    tabTextActive: { color: colors.text },
    scroll: { padding: 24, paddingBottom: 40 },
    comingSoon: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
    comingSoonIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    comingSoonTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.textFaint, marginBottom: 4 },
    comingSoonSub: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.borderStrong, textAlign: 'center' },
    errorCard: { backgroundColor: '#FEF2F2', borderRadius: radius.lg, padding: 14, gap: 10, marginBottom: 20 },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, lineHeight: 18 },
    errorCta: { backgroundColor: colors.danger, borderRadius: radius.md, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    errorCtaText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    stageGap: { gap: 18 },
    stageTitle: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy },
    stageSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginTop: 4 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stageTotalHeader: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    field: { gap: 6 },
    label: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text, backgroundColor: colors.canvasAlt,
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 18, height: 52,
    },
    selectInput: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.canvasAlt,
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 18, height: 52,
    },
    selectInputText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    selectInputPlaceholder: { color: colors.textFaint, fontFamily: fonts.body },
    toggleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14,
        borderRadius: radius.lg, backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border,
    },
    toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    toggleIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    toggleIconActive: { backgroundColor: 'rgba(0,106,255,0.1)' },
    toggleIconInactive: { backgroundColor: '#E5E7EB' },
    toggleTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    toggleSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
    switchTrack: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
    switchTrackActive: { backgroundColor: colors.blue },
    switchTrackInactive: { backgroundColor: '#D1D5DB' },
    switchDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
    switchDotActive: { alignSelf: 'flex-end' },
    switchDotInactive: { alignSelf: 'flex-start' },
    profileLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
    profileLoadingText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    profileFoundCard: { backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: 'rgba(0,106,255,0.1)', borderRadius: radius.lg, padding: 14, gap: 8 },
    profileFoundHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    profileFoundLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue, textTransform: 'uppercase', letterSpacing: 0.5 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    profileRowText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.navy },
    warnCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: radius.lg, padding: 14 },
    warnTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#92400E' },
    warnSub: { fontFamily: fonts.body, fontSize: 11, color: '#B45309', marginTop: 2, lineHeight: 15 },
    itemBlock: { gap: 10, paddingBottom: 18, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    itemIndexBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
    itemIndexText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    itemDescInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy, padding: 0 },
    itemAmount: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy },
    itemBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 38 },
    itemPriceWrap: { flex: 1.4, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 16, height: 42 },
    itemPricePrefix: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textFaint, marginRight: 4 },
    itemPriceInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, textAlign: 'right', padding: 0 },
    qtyStepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvasAlt, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 4, minWidth: 100 },
    qtyBtn: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
    qtyValue: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy },
    addItemBtn: {
        height: 56, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.xl,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    addItemText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textFaint },
    amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 18, height: 64 },
    amountPrefix: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.textMuted, marginRight: 6 },
    amountInput: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.navy, padding: 0 },
    methodTrack: { flexDirection: 'row', padding: 4, backgroundColor: colors.canvasAlt, borderRadius: radius.lg },
    methodBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
    methodIndicator: { borderRadius: radius.md, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    methodBtnText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
    methodBtnTextActive: { color: colors.blue },
    phoneWrap: { position: 'relative', justifyContent: 'center' },
    phoneInput: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text, backgroundColor: colors.canvasAlt,
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 18, paddingRight: 80, height: 52,
    },
    operatorBadge: { position: 'absolute', right: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    operatorBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.5 },
    holderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: 'rgba(0,106,255,0.1)', borderRadius: radius.lg, padding: 14 },
    holderLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue, textTransform: 'uppercase', letterSpacing: 0.5 },
    holderName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginTop: 2 },
    autoAuthWarn: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingHorizontal: 4 },
    autoAuthWarnText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.warn, lineHeight: 15 },
    reviewHeader: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
    heroWrap: { alignItems: 'center', gap: 8, paddingVertical: 8 },
    heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    heroAmount: { fontFamily: fonts.display, fontSize: 48, color: colors.text, letterSpacing: -1 },
    reviewCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 20, gap: 14 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    reviewLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    reviewValue: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    reviewItemDesc: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, flex: 1, marginRight: 12 },
    reviewTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
    reviewTotalLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    insufficientText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: '#92400E', backgroundColor: '#FFFBEB', borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
    footer: { paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
    footerRowEnd: { flexDirection: 'row', justifyContent: 'flex-end' },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    proceedBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    backBtn: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    submitBtn: { flex: 1, height: 56, borderRadius: 28, backgroundColor: colors.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
    pickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 4, maxHeight: '70%' },
    pickerTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, paddingHorizontal: 20, marginBottom: 10 },
    pickerSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, backgroundColor: colors.canvasAlt, borderRadius: radius.pill, paddingHorizontal: 14, height: 40, marginBottom: 8 },
    pickerSearchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    pickerList: { paddingBottom: 32 },
    pickerRow: { paddingHorizontal: 24, paddingVertical: 14 },
    pickerRowText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
});
