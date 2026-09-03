import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import {
    ChevronDown, Check, X, User, FileText, Building2, RefreshCw, Coins,
} from 'lucide-react-native';
import { formatKwacha, requisitionService, isPrivilegedRole } from 'core';
import type { RequisitionMessage } from 'core';
import { useAuth } from '../../context/AuthContext';
import { DisburseSheet } from './DisburseSheet';
import { PayrollDisburseSheet } from './PayrollDisburseSheet';
import { ReceiptCapture } from './ReceiptCapture';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * Native port of apps/web/src/components/requisitions/RequisitionMessageCard.tsx,
 * covering every stage a requisition passes through: creation (requestor +
 * line items + Approve/Reject), disbursal (embeds the existing DisburseSheet/
 * PayrollDisburseSheet), AI categorization review (Approve Categorizations —
 * without web's inline per-line account-override editor, a search-and-pick
 * dropdown that doesn't have a mobile equivalent yet), QuickBooks posting
 * (read-only ledger summary — posting itself needs the credit-account search
 * picker web has and this doesn't), the fund-confirmation/expense-summary
 * step (Return Cash — web's Lenco-SDK deposit-to-wallet and excess-disbursement
 * paths aren't ported), expense-tracking (embeds ReceiptCapture), plain chat
 * bubbles, and a generic pill for anything else so nothing silently vanishes.
 */
export const RequisitionMessageCard: React.FC<{
    message: RequisitionMessage;
    isOwn: boolean;
    canAction: boolean;
    requisitionData: any;
    isInitial?: boolean;
    onApprove: () => void;
    onReject: () => void;
    actingOn: 'APPROVE' | 'REJECT' | null;
    onDisbursed: () => void;
    onReceiptUploaded: () => void;
}> = ({ message, isOwn, canAction, requisitionData, isInitial, onApprove, onReject, actingOn, onDisbursed, onReceiptUploaded }) => {
    const { userRole, user } = useAuth();
    const [expanded, setExpanded] = useState(!!isInitial);
    const [isApprovingAI, setIsApprovingAI] = useState(false);
    const [isReloadingAI, setIsReloadingAI] = useState(false);
    const [isSubmittingChange, setIsSubmittingChange] = useState(false);

    const isSystem = message.message_type === 'SYSTEM';
    const status = requisitionData?.status;
    const isRejected = status === 'REJECTED';
    const isPastApproval = !['DRAFT', 'PENDING_APPROVAL'].includes(status);
    const isPrivileged = isPrivilegedRole(userRole);

    if (isSystem) {
        const stage = message.metadata?.stage;
        const content = message.content?.trim();
        const isCreation = stage === 'APPROVAL' || content === 'Requisition created' || content === 'Requisition submitted for approval';
        const isDisbursal = stage === 'DISBURSAL' || content === 'How would you like to disburse these funds?';
        const isExpenseTracking = stage === 'EXPENSE_TRACKING' || (content?.includes('needs to be expensed') && !stage);
        const isAIReview = stage === 'AI_REVIEW';
        const isQBPosting = stage === 'QUICKBOOKS_POSTING';
        const isExpenseSummary = stage === 'EXPENSE_SUMMARY';

        if (!isPrivileged && (isAIReview || isQBPosting)) return null;

        if (isCreation) {
            const showActions = canAction && (status === 'DRAFT' || status === 'PENDING_APPROVAL');
            const items = requisitionData?.items ?? [];
            return (
                <View style={styles.cardWrap}>
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={styles.avatar}><User size={13} color="#E56B6B" /></View>
                            <Text style={styles.requestorName} numberOfLines={1}>{requisitionData?.requestor_name || 'System User'}</Text>
                            {isPastApproval && (
                                <View style={[styles.badgePill, isRejected ? styles.badgePillRejected : styles.badgePillApproved]}>
                                    {isRejected ? <X size={9} color={colors.danger} /> : <Check size={9} color="#059669" />}
                                    <Text style={[styles.badgePillText, { color: isRejected ? colors.danger : '#059669' }]}>
                                        {isRejected ? 'Rejected' : 'Approved'}
                                    </Text>
                                </View>
                            )}
                        </View>

                        <Pressable style={styles.cardTitleRow} onPress={() => setExpanded((e) => !e)}>
                            <Text style={styles.cardTitle} numberOfLines={2}>{requisitionData?.description || 'Purchase Requisition'}</Text>
                            <View style={styles.cardTitleRight}>
                                <Text style={styles.cardTotal}>{formatKwacha(requisitionData?.estimated_total)}</Text>
                                <ChevronDown size={16} color={colors.textFaint} style={expanded ? styles.chevronUp : undefined} />
                            </View>
                        </Pressable>

                        {expanded && (
                            <View style={styles.cardBody}>
                                {items.length > 0 ? (
                                    <View style={styles.itemsTable}>
                                        {items.map((item: any, idx: number) => (
                                            <View key={item.id ?? idx} style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                                                    <Text style={styles.itemQty}>Qty {item.quantity}</Text>
                                                </View>
                                                <Text style={styles.itemAmount}>{formatKwacha(item.unit_price)}</Text>
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={styles.noItems}>No items listed</Text>
                                )}

                                {requisitionData?.type === 'LOAN' && (
                                    <View style={styles.loanNote}>
                                        <FileText size={13} color={colors.blue} />
                                        <Text style={styles.loanNoteText}>Loan application details are in the Attachments view.</Text>
                                    </View>
                                )}

                                {isPastApproval ? (
                                    <View style={[styles.resultBanner, isRejected ? styles.resultBannerRejected : styles.resultBannerApproved]}>
                                        <View style={[styles.resultIcon, { backgroundColor: isRejected ? '#FEF2F2' : '#ECFDF5' }]}>
                                            {isRejected ? <X size={13} color={colors.danger} /> : <Check size={13} color="#059669" />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.resultTitle}>{isRejected ? 'Requisition Rejected' : 'Requisition Approved'}</Text>
                                            <Text style={styles.resultSub}>{isRejected ? 'This request was declined' : 'This request was authorized'}</Text>
                                        </View>
                                    </View>
                                ) : showActions && (
                                    <View style={styles.actionsRow}>
                                        <Pressable style={styles.declineBtn} onPress={onReject} disabled={!!actingOn}>
                                            {actingOn === 'REJECT' ? <ActivityIndicator color={colors.textMuted} /> : <Text style={styles.declineBtnText}>Decline</Text>}
                                        </Pressable>
                                        <Pressable style={styles.acceptBtn} onPress={onApprove} disabled={!!actingOn}>
                                            {actingOn === 'APPROVE' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptBtnText}>Accept</Text>}
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                    <Text style={styles.timestamp}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            );
        }

        if (isDisbursal) {
            const isPayroll = requisitionData?.type === 'PAYROLL';
            return (
                <View style={styles.cardWrap}>
                    <View style={styles.card}>
                        <View style={styles.cardBody}>
                            <Text style={styles.disbursalTitle}>How would you like to disburse these funds?</Text>
                            {canAction && (
                                isPayroll ? (
                                    <PayrollDisburseSheet
                                        requisitionId={requisitionData.id}
                                        amount={requisitionData.actual_total ?? requisitionData.estimated_total}
                                        employeeCount={requisitionData.items?.length ?? 0}
                                        onDone={onDisbursed}
                                    />
                                ) : (
                                    <DisburseSheet
                                        requisitionId={requisitionData.id}
                                        amount={requisitionData.actual_total ?? requisitionData.estimated_total}
                                        recipientName={requisitionData.recipient_name}
                                        recipientAccount={requisitionData.recipient_account}
                                        onDone={onDisbursed}
                                    />
                                )
                            )}
                        </View>
                    </View>
                    <Text style={styles.timestamp}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            );
        }

        if (isExpenseTracking) {
            return (
                <View style={styles.cardWrap}>
                    <View style={styles.card}>
                        <View style={styles.cardBody}>
                            <Text style={styles.disbursalTitle}>{content || 'This request needs to be expensed.'}</Text>
                            {canAction && <ReceiptCapture requisitionId={requisitionData.id} onUploaded={onReceiptUploaded} />}
                        </View>
                    </View>
                    <Text style={styles.timestamp}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            );
        }

        if (isAIReview) {
            const isCompleted = requisitionData?.status === 'CATEGORIZED' || requisitionData?.status === 'ACCOUNTED';
            const isFullyCompleted = requisitionData?.status === 'ACCOUNTED';
            const items = message.metadata?.items ?? [];
            const isThinking = !!message.metadata?.isThinking;
            const hasError = !!message.metadata?.hasError;

            const reload = async () => {
                setIsReloadingAI(true);
                try {
                    await requisitionService.retriggerAI(requisitionData?.id || message.requisition_id);
                    onDisbursed();
                } catch (e: any) {
                    Alert.alert('Could not reload AI analysis', e?.message ?? 'Please try again.');
                } finally {
                    setIsReloadingAI(false);
                }
            };

            const approve = async () => {
                setIsApprovingAI(true);
                try {
                    await requisitionService.approveCategorization(requisitionData?.id || message.requisition_id, []);
                    onDisbursed();
                } catch (e: any) {
                    Alert.alert('Could not approve categorization', e?.message ?? 'Please try again.');
                } finally {
                    setIsApprovingAI(false);
                }
            };

            return (
                <View style={styles.cardWrap}>
                    <View style={styles.card}>
                        <View style={styles.cardBody}>
                            <View style={styles.stageHeader}>
                                <View style={styles.stageIcon}><Building2 size={13} color={colors.blue} /></View>
                                <Text style={styles.stageTitle}>AI Categorization Assistant</Text>
                                {!isCompleted && (
                                    <Pressable onPress={reload} disabled={isReloadingAI} hitSlop={8}>
                                        <RefreshCw size={14} color={colors.textFaint} />
                                    </Pressable>
                                )}
                                {isCompleted && (
                                    <View style={[styles.badgePill, styles.badgePillApproved]}>
                                        <Check size={9} color="#059669" />
                                        <Text style={[styles.badgePillText, { color: '#059669' }]}>{isFullyCompleted ? 'Posted' : 'Categorized'}</Text>
                                    </View>
                                )}
                            </View>

                            {isThinking ? (
                                <Text style={styles.stageMuted}>AI Categorization Assistant is thinking…</Text>
                            ) : hasError ? (
                                <Text style={styles.stageMuted}>AI categorization encountered an error. Tap reload to try again.</Text>
                            ) : (
                                <>
                                    <Text style={styles.stageBody}>The AI suggested the following account mapping.</Text>
                                    <View style={styles.itemsTable}>
                                        {items.map((item: any, idx: number) => (
                                            <View key={idx} style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                                                    <Text style={styles.itemQty}>
                                                        {item.category_code} — {item.category_name}
                                                        {item.confidence ? ` · ${Math.round(item.confidence * 100)}% confidence` : ''}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                    {!isCompleted && (
                                        <Pressable style={styles.acceptBtn} onPress={approve} disabled={isApprovingAI}>
                                            {isApprovingAI ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptBtnText}>Approve Categorizations</Text>}
                                        </Pressable>
                                    )}
                                </>
                            )}
                        </View>
                    </View>
                    <Text style={styles.timestamp}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            );
        }

        if (isQBPosting) {
            const isCompleted = requisitionData?.status === 'ACCOUNTED';
            const lineItems = requisitionData?.items ?? [];
            const method = requisitionData?.payment_method || requisitionData?.disbursements?.[0]?.method;
            const isWallet = method === 'WALLET' || method === 'MONEYWISE_WALLET';

            return (
                <View style={styles.cardWrap}>
                    <View style={styles.card}>
                        <View style={styles.cardBody}>
                            <View style={styles.stageHeader}>
                                <View style={styles.stageIcon}><Building2 size={13} color={colors.blue} /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.stageTitle}>QuickBooks Sync</Text>
                                    <Text style={styles.stageSubtitle}>General Ledger Posting</Text>
                                </View>
                                {isCompleted && (
                                    <View style={[styles.badgePill, styles.badgePillApproved]}>
                                        <Check size={9} color="#059669" />
                                        <Text style={[styles.badgePillText, { color: '#059669' }]}>Posted</Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.ledgerCard}>
                                <Text style={styles.ledgerLabel}>DEBIT SUMMARY</Text>
                                {lineItems.map((item: any, idx: number) => (
                                    <View key={idx} style={styles.ledgerRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.ledgerAccount} numberOfLines={1}>{item.qb_account_name || 'Uncategorized Expense'}</Text>
                                            <Text style={styles.ledgerDesc} numberOfLines={1}>{item.description}</Text>
                                        </View>
                                        <Text style={styles.ledgerAmount}>{formatKwacha(item.actual_amount ?? item.estimated_amount)}</Text>
                                    </View>
                                ))}
                                <View style={styles.ledgerCreditRow}>
                                    <Text style={styles.ledgerCreditLabel}>CREDIT (SOURCE)</Text>
                                    <Text style={styles.ledgerCreditValue}>{isWallet ? 'MoneyWise Wallet' : 'Selected Account'}</Text>
                                </View>
                            </View>

                            {!isCompleted && (
                                <Text style={styles.stageMuted}>Posting to QuickBooks needs a source account selected on the web app.</Text>
                            )}
                        </View>
                    </View>
                    <Text style={styles.timestamp}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            );
        }

        if (isExpenseSummary) {
            const totalActual = requisitionData?.items?.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0) || requisitionData?.actual_total || 0;
            const totalDisbursed = requisitionData?.disbursements?.[0]?.total_prepared || requisitionData?.estimated_total || 0;
            const changeAmount = Math.max(0, totalDisbursed - totalActual);
            const hasChange = changeAmount > 0.01;
            const isRequestor = user?.id === requisitionData?.requestor_id;
            const showChangeActions = hasChange && isRequestor && requisitionData?.status === 'EXPENSED';

            const returnCash = () => {
                Alert.alert('Return Cash', `Submit ${formatKwacha(changeAmount)} cash return?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Submit', onPress: async () => {
                            setIsSubmittingChange(true);
                            try {
                                await requisitionService.submitChange(requisitionData.id, [], changeAmount);
                                onDisbursed();
                            } catch (e: any) {
                                Alert.alert('Could not submit change', e?.message ?? 'Please try again.');
                            } finally {
                                setIsSubmittingChange(false);
                            }
                        },
                    },
                ]);
            };

            return (
                <View style={styles.cardWrap}>
                    <View style={styles.card}>
                        <View style={styles.cardBody}>
                            <View style={styles.stageHeader}>
                                <View style={[styles.stageIcon, { backgroundColor: '#ECFDF5' }]}><Check size={13} color="#059669" /></View>
                                <Text style={styles.stageTitle}>Finance System</Text>
                            </View>
                            <Text style={styles.stageBody}>{message.content}</Text>
                            {showChangeActions && (
                                <Pressable style={styles.returnCashBtn} onPress={returnCash} disabled={isSubmittingChange}>
                                    {isSubmittingChange
                                        ? <ActivityIndicator color={colors.text} />
                                        : <><Coins size={14} color="#B45309" /><Text style={styles.returnCashBtnText}>Return Cash ({formatKwacha(changeAmount)})</Text></>}
                                </Pressable>
                            )}
                        </View>
                    </View>
                    <Text style={styles.timestamp}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
            );
        }

        return (
            <View style={styles.pillWrap}>
                <View style={styles.pill}><Text style={styles.pillText}>{message.content}</Text></View>
            </View>
        );
    }

    return (
        <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
            <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{message.content}</Text>
            </View>
            <Text style={styles.bubbleTime}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    cardWrap: { marginBottom: 16, maxWidth: '92%' },
    card: {
        backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 4,
        borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFE3E3', alignItems: 'center', justifyContent: 'center' },
    requestorName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.text },
    badgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
    badgePillApproved: { borderColor: '#D1FAE5' },
    badgePillRejected: { borderColor: '#FEE2E2' },
    badgePillText: { fontFamily: fonts.bodyBold, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
    cardTitle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, lineHeight: 19 },
    cardTitleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTotal: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    chevronUp: { transform: [{ rotate: '180deg' }] },
    cardBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
    itemsTable: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
    itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    itemDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
    itemQty: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 1 },
    itemAmount: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    noItems: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
    loanNote: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.tabActiveBg, borderRadius: radius.md, padding: 10 },
    loanNoteText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.blue },
    resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 12, borderWidth: 1 },
    resultBannerApproved: { backgroundColor: 'rgba(236,253,245,0.4)', borderColor: '#ECFDF5' },
    resultBannerRejected: { backgroundColor: 'rgba(254,242,242,0.4)', borderColor: '#FEF2F2' },
    resultIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    resultTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    resultSub: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textMuted, marginTop: 1 },
    actionsRow: { flexDirection: 'row', gap: 10 },
    declineBtn: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    declineBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    acceptBtn: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    acceptBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    disbursalTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, paddingTop: 14 },
    stageHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14 },
    stageIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    stageTitle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    stageSubtitle: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },
    stageMuted: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
    stageBody: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, lineHeight: 18 },
    ledgerCard: { backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 14, gap: 8 },
    ledgerLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5 },
    ledgerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    ledgerAccount: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    ledgerDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 1 },
    ledgerAmount: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    ledgerCreditRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    ledgerCreditLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5 },
    ledgerCreditValue: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue },
    returnCashBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFFBEB', borderRadius: radius.pill, paddingVertical: 12 },
    returnCashBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#B45309' },
    timestamp: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginLeft: 4 },
    pillWrap: { alignItems: 'center', marginVertical: 8 },
    pill: { backgroundColor: 'rgba(0,106,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,106,255,0.12)', borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 6 },
    pillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.blue, textTransform: 'uppercase', letterSpacing: 1 },
    bubbleWrap: { marginBottom: 14, maxWidth: '78%' },
    bubbleWrapOwn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    bubbleWrapOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
    bubbleOwn: { backgroundColor: colors.blue, borderTopRightRadius: 4 },
    bubbleOther: { backgroundColor: colors.surface, borderTopLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    bubbleText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, lineHeight: 18 },
    bubbleTextOwn: { color: '#FFFFFF' },
    bubbleTime: { fontFamily: fonts.bodyMedium, fontSize: 9, color: colors.textFaint, marginTop: 4, marginHorizontal: 6, textTransform: 'uppercase' },
});
