import { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ChevronDown, Check, Building2, CheckCircle, ArrowRight } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { cashbookService, requisitionService, integrationService, accountService, formatKwacha, formatShortDate } from 'core';
import type { CashbookEntry } from 'core';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { AccountPickerSheet, type AccountOption } from '../../../src/components/wallet/AccountPickerSheet';
import { useAuth } from '../../../src/context/AuthContext';
import { colors, fonts, radius } from '../../../src/theme/tokens';

const AstroidIcon: React.FC<{ size?: number; color?: string }> = ({ size = 13, color = colors.blue }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203" />
    </Svg>
);

export default function EntryDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const { organizationId } = useAuth();

    const [activePickerTarget, setActivePickerTarget] = useState<'PAYMENT' | string | null>(null);
    const [selectedPaymentAccount, setSelectedPaymentAccount] = useState<AccountOption | null>(null);
    const [localClassifications, setLocalClassifications] = useState<Record<string, AccountOption>>({});
    const [isClassifying, setIsClassifying] = useState(false);
    const [isPosting, setIsPosting] = useState(false);

    // Collapsible states
    const [isOverviewExpanded, setIsOverviewExpanded] = useState(true);
    const [isClassificationExpanded, setIsClassificationExpanded] = useState(true);
    const [isPostingExpanded, setIsPostingExpanded] = useState(true);
    const [isLinkedExpanded, setIsLinkedExpanded] = useState(true);

    // 1. Fetch overview entry data
    const { data: overviewData, isLoading: isOverviewLoading } = useQuery({
        queryKey: ['cashbook-entries', 'overview', organizationId],
        queryFn: () => cashbookService.getOverview(),
        enabled: !!organizationId,
    });

    const entry: CashbookEntry | undefined = (overviewData?.entries ?? []).find(
        (e: CashbookEntry) => String(e.id) === String(id),
    );

    const reqId = entry?.requisition_id || entry?.requisitions?.id;

    // 2. Fetch full linked requisition data if available
    const { data: reqData, refetch: refetchReq } = useQuery({
        queryKey: ['requisitions', reqId, organizationId],
        queryFn: () => requisitionService.getById(String(reqId)),
        enabled: !!reqId && !!organizationId,
    });

    // 3. Fetch Chart of Accounts (QuickBooks / GL)
    const { data: qbAccountsRaw } = useQuery({
        queryKey: ['quickbooks-accounts', organizationId],
        queryFn: () => integrationService.getAccounts().catch(() => []),
        enabled: !!organizationId,
    });

    // The organisation's own chart of accounts (what the AI classifies against, and the only chart a
    // personal account has — it has no QuickBooks).
    const { data: chartRaw } = useQuery({
        queryKey: ['chart-of-accounts', organizationId],
        queryFn: () => accountService.getAll(),
        enabled: !!organizationId,
    });
    const chart: (AccountOption & { type: string })[] = useMemo(() => (
        (chartRaw ?? []).map((a) => ({ id: a.id, name: a.name, code: a.code, accountType: a.type, type: a.type }))
    ), [chartRaw]);

    const allAccounts: AccountOption[] = useMemo(() => {
        if (!Array.isArray(qbAccountsRaw)) return [];
        return qbAccountsRaw.map((a: any) => ({
            id: String(a.Id || a.id),
            name: a.Name || a.name || 'Unnamed Account',
            code: a.AcctNum || a.code || '',
            accountType: a.AccountType || a.classification || '',
        }));
    }, [qbAccountsRaw]);

    const expenseAccounts = useMemo(() => {
        if (chart.length > 0) return chart.filter((a) => a.type === 'EXPENSE');
        return allAccounts.filter((a) =>
            ['Expense', 'Other Expense', 'Cost of Goods Sold'].some((t) =>
                a.accountType?.toLowerCase().includes(t.toLowerCase())
            ) || !a.accountType
        );
    }, [allAccounts, chart]);

    const incomeAccounts = useMemo(() => chart.filter((a) => a.type === 'INCOME'), [chart]);

    const paymentAccounts = useMemo(() => {
        return allAccounts.filter((a) =>
            ['Bank', 'Credit Card', 'Asset', 'Cash'].some((t) =>
                a.accountType?.toLowerCase().includes(t.toLowerCase())
            )
        );
    }, [allAccounts]);

    const isInflow = (entry?.debit ?? 0) > 0;
    const amount = isInflow ? entry?.debit : entry?.credit;
    const req = reqData || entry?.requisitions;
    const items = reqData?.items || entry?.requisitions?.line_items || [];

    const isPosted = entry?.status === 'ACCOUNTED' || reqData?.status === 'ACCOUNTED' || entry?.qb_sync_status === 'SUCCESS';

    const handleAutoClassify = async () => {
        if (!reqId && !entry?.id) return;
        setIsClassifying(true);
        try {
            if (reqId) {
                // Uses the exact same AI assistant classification pipeline as the outflow requisitions thread
                await requisitionService.retriggerAI(reqId);
                await refetchReq();
                qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
                Alert.alert('AI Classification Complete', 'AI assistant has re-analyzed line items and mapped them to general ledger accounts.');
            } else if (entry?.id) {
                // A plain deposit / payment: classify just this entry against the org's own chart of accounts.
                const r = await cashbookService.classifyEntry(entry.id);
                if (r.classified && r.account) {
                    setLocalClassifications((prev) => ({ ...prev, SINGLE: { id: r.account!.id, name: r.account!.name, code: r.account!.code ?? '' } }));
                    qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
                    Alert.alert('Classified', `${r.account.name}${r.reasoning ? `\n\n${r.reasoning}` : ''}`);
                } else {
                    Alert.alert('Couldn’t classify', r.message || 'Please choose an account yourself.');
                }
            }
        } catch (e: any) {
            Alert.alert('AI Classification Failed', e?.message ?? 'Please select accounts manually.');
        } finally {
            setIsClassifying(false);
        }
    };

    const handlePostToLedger = async () => {
        setIsPosting(true);
        try {
            if (reqId) {
                await requisitionService.postToQuickBooks(reqId, {
                    payment_account_id: selectedPaymentAccount?.id,
                    payment_account_name: selectedPaymentAccount?.name,
                });
            } else if (entry?.id) {
                await cashbookService.postToQuickBooks(entry.id, selectedPaymentAccount?.id || '');
            }
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            if (reqId) qc.invalidateQueries({ queryKey: ['requisitions', reqId] });
            Alert.alert('Successfully Synchronized', 'Transaction has been posted to the General Ledger.');
        } catch (e: any) {
            Alert.alert('Posting Failed', e?.message ?? 'Please verify account selection and try again.');
        } finally {
            setIsPosting(false);
        }
    };

    const handleSelectAccount = (acc: AccountOption) => {
        if (activePickerTarget === 'PAYMENT') {
            setSelectedPaymentAccount(acc);
        } else if (activePickerTarget) {
            setLocalClassifications((prev) => ({ ...prev, [activePickerTarget]: acc }));
            if (entry?.id && !reqId) {
                cashbookService.updateAccount(entry.id, acc.id)
                    .then(() => qc.invalidateQueries({ queryKey: ['cashbook-entries'] }))
                    .catch((e: any) => {
                        setLocalClassifications((prev) => { const n = { ...prev }; delete n[activePickerTarget]; return n; });
                        Alert.alert('Couldn’t change the account', e?.message ?? 'Please try again.');
                    });
            }
        }
        setActivePickerTarget(null);
    };

    const handleDownload = () => {
        Alert.alert(
            'Download Transaction',
            `Export transaction receipt for ${entry ? formatKwacha(amount ?? 0) : ''}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Download Receipt',
                    onPress: () => {
                        Alert.alert('Receipt Exported', 'Transaction receipt exported successfully.');
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader
                title="Transaction"
                right={
                    <Pressable onPress={handleDownload} hitSlop={10} accessibilityLabel="Download transaction receipt">
                        <Download size={20} color={colors.textMuted} />
                    </Pressable>
                }
            />

            {isOverviewLoading && !entry && (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            )}

            {!isOverviewLoading && !entry && (
                <View style={styles.centre}>
                    <Text style={styles.missing}>This transaction is no longer in the ledger.</Text>
                </View>
            )}

            {entry && (
                <ScrollView contentContainerStyle={styles.scroll}>
                    {/* CARD 1: Amount Banner */}
                    <View style={styles.card}>
                        <View style={styles.bannerHeader}>
                            <View style={[styles.statusPill, isInflow ? styles.statusPillIn : styles.statusPillOut]}>
                                <Text style={[styles.statusPillText, isInflow ? styles.statusPillTextIn : styles.statusPillTextOut]}>
                                    {isInflow ? 'RECEIVED' : 'PAID OUT'}
                                </Text>
                            </View>
                            {isPosted && (
                                <View style={[styles.statusPill, styles.statusPillPosted]}>
                                    <Check size={10} color="#059669" />
                                    <Text style={[styles.statusPillText, { color: '#059669' }]}>ACCOUNTED</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.amount, isInflow && styles.amountIn]}>
                            {formatKwacha(amount ?? 0)}
                        </Text>
                        <Text style={styles.description}>{entry.description}</Text>
                        {entry.balance_after != null && (
                            <Text style={styles.balanceAfter}>
                                Balance after · {formatKwacha(entry.balance_after)}
                            </Text>
                        )}
                    </View>

                    {/* CARD 2: Transaction Overview (Collapsible) */}
                    <View style={styles.card}>
                        <Pressable style={styles.cardHeaderToggle} onPress={() => setIsOverviewExpanded((e) => !e)}>
                            <Text style={styles.sectionTitle}>Transaction Overview</Text>
                            <View style={styles.dropdownBtn}>
                                <ChevronDown size={18} color={colors.textMuted} style={!isOverviewExpanded && styles.chevronRotated} />
                            </View>
                        </Pressable>

                        {isOverviewExpanded && (
                            <View style={styles.collapsibleContent}>
                                <Field label="Date" value={formatShortDate(entry.date)} />
                                <Field label="Type" value={entry.entry_type.replace(/_/g, ' ')} />
                                <Field label="Account Source" value={entry.account_type.replace(/_/g, ' ')} />
                                {!!entry.reference_number && <Field label="Reference" value={entry.reference_number} />}
                                {!!entry.status && <Field label="Status" value={entry.status} />}
                                {!!entry.accounts?.name && (
                                    <Field label="Ledger Account" value={`${entry.accounts.code ? `${entry.accounts.code} · ` : ''}${entry.accounts.name}`} />
                                )}
                                {!!entry.users?.name && <Field label="Recorded By" value={entry.users.name} />}
                                {!!entry.sender_name && <Field label="From" value={entry.sender_name} />}
                                {!!entry.sender_phone && <Field label="Phone" value={entry.sender_phone} />}
                            </View>
                        )}
                    </View>

                    {/* CARD 3: Sub-Items & Line Item Classification (Collapsible) */}
                    <View style={styles.card}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionTitle}>Line Items</Text>

                            <View style={styles.headerRightGroup}>
                                {!isPosted && (
                                    <Pressable
                                        style={styles.aiClassifyBtn}
                                        onPress={handleAutoClassify}
                                        disabled={isClassifying}
                                    >
                                        {isClassifying ? (
                                            <ActivityIndicator size="small" color={colors.blue} />
                                        ) : (
                                            <>
                                                <AstroidIcon size={13} color={colors.blue} />
                                                <Text style={styles.aiClassifyBtnText}>Auto Classify</Text>
                                            </>
                                        )}
                                    </Pressable>
                                )}

                                <Pressable
                                    style={styles.dropdownBtn}
                                    onPress={() => setIsClassificationExpanded((e) => !e)}
                                    hitSlop={8}
                                    accessibilityLabel="Toggle Line Items section"
                                >
                                    <ChevronDown size={18} color={colors.textMuted} style={!isClassificationExpanded && styles.chevronRotated} />
                                </Pressable>
                            </View>
                        </View>

                        {isClassificationExpanded && (
                            <View style={styles.collapsibleContent}>
                                {items.length > 0 ? (
                                    <View style={styles.itemsList}>
                                        {items.map((item: any, idx: number) => {
                                            const assignedAcc =
                                                localClassifications[item.id] ||
                                                (item.qb_account_name
                                                    ? { id: item.qb_account_id || item.id, name: item.qb_account_name }
                                                    : item.accounts
                                                    ? { id: item.accounts.id, name: item.accounts.name, code: item.accounts.code }
                                                    : null);

                                            const itemTotal = item.actual_amount != null
                                                ? Number(item.actual_amount)
                                                : (Number(item.unit_price || 0) * Number(item.quantity || 1));

                                            return (
                                                <View key={item.id ?? idx} style={[styles.itemBlock, idx > 0 && styles.itemBlockBorder]}>
                                                    <View style={styles.itemTopRow}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.itemTitle} numberOfLines={2}>{item.description}</Text>
                                                            <Text style={styles.itemQty}>Qty {item.quantity || 1} · {formatKwacha(item.unit_price || itemTotal)}</Text>
                                                        </View>
                                                        <Text style={styles.itemTotal}>{formatKwacha(itemTotal)}</Text>
                                                    </View>

                                                    {/* Account Selector Chip */}
                                                    <Pressable
                                                        style={styles.accountChip}
                                                        onPress={() => setActivePickerTarget(item.id)}
                                                        disabled={isPosted}
                                                    >
                                                        <Building2 size={13} color={assignedAcc ? colors.blue : colors.textFaint} />
                                                        <Text style={[styles.accountChipText, assignedAcc && styles.accountChipTextActive]} numberOfLines={1}>
                                                            {assignedAcc ? (assignedAcc.code ? `${assignedAcc.code} · ${assignedAcc.name}` : assignedAcc.name) : 'Assign Ledger Account…'}
                                                        </Text>
                                                        {!isPosted && <Text style={styles.accountChipChangeText}>Change</Text>}
                                                    </Pressable>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : (
                                    /* Fallback single-item classification for non-requisition entries */
                                    <View style={styles.singleItemBox}>
                                        <Text style={styles.singleItemDesc}>{entry.description}</Text>
                                        <Pressable
                                            style={styles.accountChip}
                                            onPress={() => setActivePickerTarget('SINGLE')}
                                            disabled={isPosted}
                                        >
                                            <Building2 size={13} color={(localClassifications.SINGLE?.name || entry.accounts?.name) ? colors.blue : colors.textFaint} />
                                            <Text style={[styles.accountChipText, !!(localClassifications.SINGLE?.name || entry.accounts?.name) && styles.accountChipTextActive]} numberOfLines={1}>
                                                {localClassifications.SINGLE?.name || entry.accounts?.name || 'Assign General Ledger Account…'}
                                            </Text>
                                            {!isPosted && <Text style={styles.accountChipChangeText}>Change</Text>}
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>

                    {/* CARD 4: General Ledger Posting (Collapsible) */}
                    <View style={styles.card}>
                        <View style={styles.sectionHeaderRow}>
                            <Pressable style={styles.cardHeaderTitleWrap} onPress={() => setIsPostingExpanded((e) => !e)}>
                                <Text style={styles.sectionTitle}>General Ledger Posting</Text>
                                <View style={styles.dropdownBtn}>
                                    <ChevronDown size={18} color={colors.textMuted} style={!isPostingExpanded && styles.chevronRotated} />
                                </View>
                            </Pressable>
                            {isPosted ? (
                                <View style={[styles.statusPill, styles.statusPillPosted]}>
                                    <CheckCircle size={12} color="#059669" />
                                    <Text style={[styles.statusPillText, { color: '#059669' }]}>POSTED</Text>
                                </View>
                            ) : (
                                <View style={[styles.statusPill, styles.statusPillPending]}>
                                    <Text style={[styles.statusPillText, { color: '#D97706' }]}>UNPOSTED</Text>
                                </View>
                            )}
                        </View>

                        {isPostingExpanded && (
                            <View style={styles.collapsibleContent}>
                                {/* Credit / Payment Source Account */}
                                <Text style={styles.inputFieldLabel}>SOURCE / CREDIT ACCOUNT</Text>
                                <Pressable
                                    style={styles.paymentAccountBtn}
                                    onPress={() => setActivePickerTarget('PAYMENT')}
                                    disabled={isPosted}
                                >
                                    <Building2 size={16} color={selectedPaymentAccount ? colors.blue : colors.textMuted} />
                                    <Text style={[styles.paymentAccountText, selectedPaymentAccount && styles.paymentAccountTextActive]} numberOfLines={1}>
                                        {selectedPaymentAccount ? selectedPaymentAccount.name : 'Select Source Bank/Wallet Account…'}
                                    </Text>
                                </Pressable>

                                {!isPosted && (
                                    <Pressable
                                        style={styles.postBtn}
                                        onPress={handlePostToLedger}
                                        disabled={isPosting}
                                    >
                                        {isPosting ? (
                                            <ActivityIndicator color="#FFFFFF" />
                                        ) : (
                                            <>
                                                <Text style={styles.postBtnText}>Post to General Ledger</Text>
                                                <ArrowRight size={16} color="#FFFFFF" />
                                            </>
                                        )}
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </View>

                    {/* CARD 5: Linked Request (Collapsible) */}
                    {req && (
                        <View style={styles.card}>
                            <Pressable style={styles.cardHeaderToggle} onPress={() => setIsLinkedExpanded((e) => !e)}>
                                <Text style={styles.sectionTitle}>Linked Requisition Request</Text>
                                <View style={styles.dropdownBtn}>
                                    <ChevronDown size={18} color={colors.textMuted} style={!isLinkedExpanded && styles.chevronRotated} />
                                </View>
                            </Pressable>

                            {isLinkedExpanded && (
                                <Pressable
                                    style={({ pressed }) => [styles.linkedBody, pressed && { opacity: 0.7 }]}
                                    onPress={() => router.push(`/requisition/${req.id}`)}
                                >
                                    <Text style={styles.linkedDesc} numberOfLines={2}>{req.description}</Text>
                                    <Text style={styles.linkedMeta}>
                                        {req.reference_number || `REQ-${req.id.slice(0, 8).toUpperCase()}`} · {req.status}
                                        {req.requestor?.name ? ` · ${req.requestor.name}` : ''}
                                    </Text>
                                    <Text style={styles.linkedCta}>View full request thread →</Text>
                                </Pressable>
                            )}
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Account Picker Modal Sheet */}
            <AccountPickerSheet
                visible={!!activePickerTarget}
                accounts={activePickerTarget === 'PAYMENT' ? paymentAccounts : (isInflow && !reqId && incomeAccounts.length > 0 ? incomeAccounts : expenseAccounts)}
                selectedId={
                    activePickerTarget === 'PAYMENT'
                        ? selectedPaymentAccount?.id
                        : activePickerTarget
                        ? localClassifications[activePickerTarget]?.id
                        : undefined
                }
                onClose={() => setActivePickerTarget(null)}
                onSelect={handleSelectAccount}
            />
        </View>
    );
}

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue} numberOfLines={2}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    centre: { paddingVertical: 64, alignItems: 'center', paddingHorizontal: 32 },
    missing: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border, gap: 8,
    },
    cardHeaderToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeaderTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    dropdownBtn: { padding: 2 },
    chevronRotated: { transform: [{ rotate: '-90deg' }] },
    collapsibleContent: { gap: 8, marginTop: 4 },
    bannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
    statusPillIn: { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' },
    statusPillOut: { backgroundColor: colors.canvasAlt, borderColor: colors.border },
    statusPillPosted: { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' },
    statusPillPending: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
    statusPillText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.5 },
    statusPillTextIn: { color: '#059669' },
    statusPillTextOut: { color: colors.textMuted },
    amount: { fontFamily: fonts.display, fontSize: 32, color: colors.navy, marginTop: 4 },
    amountIn: { color: colors.positiveInk },
    description: { fontFamily: fonts.body, fontSize: 15, color: colors.text, marginTop: 4, lineHeight: 21 },
    balanceAfter: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    aiClassifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.tabActiveBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(0,106,255,0.2)' },
    aiClassifyBtnText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue },
    field: {
        flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 7,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    fieldLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    fieldValue: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, textAlign: 'right' },
    itemsList: { gap: 10, marginTop: 4 },
    itemBlock: { gap: 6, paddingVertical: 6 },
    itemBlockBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
    itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    itemTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    itemQty: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    itemTotal: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    accountChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.canvasAlt, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: 4 },
    accountChipText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
    accountChipTextActive: { color: colors.text, fontFamily: fonts.bodyBold },
    accountChipChangeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue },
    singleItemBox: { gap: 8, marginTop: 4 },
    singleItemDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
    inputFieldLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5, marginTop: 4 },
    paymentAccountBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.canvasAlt, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
    paymentAccountText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textFaint },
    paymentAccountTextActive: { fontFamily: fonts.bodyBold, color: colors.text },
    postBtn: { height: 46, borderRadius: radius.pill, backgroundColor: colors.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
    postBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
    linkedBody: { marginTop: 4 },
    linkedDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
    linkedMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4 },
    linkedCta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue, marginTop: 12 },
});
