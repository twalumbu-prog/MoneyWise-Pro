import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X, ShieldCheck, ChevronDown, AlertTriangle, Lock, ScanFace, Fingerprint } from 'lucide-react-native';
import type { Proposal } from 'core';
import { useAuth } from '../../context/AuthContext';
import { useAppLock } from '../../context/AppLockContext';
import { verifyPin, promptBiometric, biometricLabel } from '../../lib/appLock';
import { PinEntry } from '../security/PinEntry';
import { colors, fonts, radius } from '../../theme/tokens';

const ACTION_LABELS: Record<string, string> = {
    create_requisition: 'Create requisition',
    update_requisition: 'Update requisition',
    create_scheduled_item: 'Add scheduled expense',
    update_scheduled_item: 'Update scheduled expense',
    create_automation: 'Create automation',
    update_automation: 'Update automation',
    categorize_transaction: 'Classify transaction',
    categorize_requisition_expense: 'Classify expense line item',
    update_org_settings: 'Change settings',
    record_manual_transactions: 'Record transactions',
    create_wallet: 'Create wallet',
    create_external_account: 'Add external account',
    set_budgets: 'Set budgets',
    update_my_preferences: 'Update preferences',
    create_savings_pot: 'Create savings pot',
    transfer_between_wallets: 'Move money between wallets',
    add_to_savings: 'Add to savings',
    withdraw_from_savings: 'Withdraw from savings',
    send_money: 'Send money',
    invest: 'Invest',
    request_loan: 'Apply for a loan',
    request_salary_advance: 'Request salary advance',
    add_group_member: 'Add to group savings',
    join_group_savings: 'Join group savings',
    leave_group_savings: 'Leave group savings',
};

/**
 * Cards that move money out of the account (`strongAuth`) need the person themselves, not just a tap: Face ID when they
 * turned it on, otherwise their app PIN, and a plain "are you sure" when they have no PIN at all.
 */
function useStrongConfirm() {
    const { user } = useAuth();
    const { config, biometric } = useAppLock();
    const [pinFor, setPinFor] = useState<((ok: boolean) => void) | null>(null);
    const [pinWhat, setPinWhat] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState(0);
    const insets = useSafeAreaInsets();
    const canBio = config.biometric && biometric.available;
    const label = biometricLabel(biometric.kind, Platform.OS === 'ios');

    const confirm = (what: string) => new Promise<boolean>((resolve) => {
        if (!user?.id || !config.enabled) {
            Alert.alert('Please confirm', `${what}\n\nThis can't be reversed.`, [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Confirm', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) });
            return;
        }
        const askPin = () => { setError(null); setPinWhat(what); setPinFor(() => resolve); };
        if (canBio) promptBiometric(what).then((ok) => (ok ? resolve(true) : askPin()));
        else askPin();
    });

    const close = (ok: boolean) => { pinFor?.(ok); setPinFor(null); };
    const submit = async (pin: string) => {
        if (!user?.id) return close(false);
        const r = await verifyPin(user.id, pin);
        if (r.ok) return close(true);
        setError(r.lockedForSeconds ? `Too many tries. Wait ${r.lockedForSeconds}s.` : 'Wrong PIN');
        setErrorKey((k) => k + 1);
        if (r.lockedForSeconds) setTimeout(() => close(false), 1200);
    };

    const sheet = (
        <Modal visible={!!pinFor} animationType="slide" onRequestClose={() => close(false)}>
            <View style={[styles.pinSheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
                <Pressable onPress={() => close(false)} hitSlop={10} style={styles.pinClose} accessibilityLabel="Cancel">
                    <X size={22} color={colors.textMuted} />
                </Pressable>
                <PinEntry
                    title="Enter your PIN" subtitle={pinWhat} error={error} errorKey={errorKey} onComplete={submit}
                    leftSlot={canBio ? (
                        <Pressable onPress={() => promptBiometric(pinWhat || 'Confirm').then((ok) => ok && close(true))} hitSlop={8} accessibilityLabel={`Use ${label}`}>
                            {biometric.kind === 'face' ? <ScanFace size={30} color={colors.blue} /> : <Fingerprint size={30} color={colors.blue} />}
                        </Pressable>
                    ) : undefined}
                />
            </View>
        </Modal>
    );
    return { confirm, sheet };
}

/**
 * The gate between the agent and your data. Shows exactly what will be
 * written before anything happens. Mirrors the web card: collapses to a
 * one-line record once decided, re-expandable on tap.
 */
export const ApprovalCard: React.FC<{
    toolName: string;
    proposal: Proposal;
    status: 'pending' | 'approving' | 'approved' | 'declined';
    onDecide: (approved: boolean) => void;
}> = ({ toolName, proposal, status, onDecide }) => {
    const decided = status === 'approved' || status === 'declined';
    const busy = status === 'approving';
    const [expanded, setExpanded] = useState(false);
    const actionLabel = ACTION_LABELS[toolName] ?? 'Confirm change';
    const strong = useStrongConfirm();
    const approve = async () => {
        if (proposal.strongAuth && !(await strong.confirm(proposal.summary))) return;
        onDecide(true);
    };

    if (decided && !expanded) {
        const approved = status === 'approved';
        return (
            <Pressable
                onPress={() => setExpanded(true)}
                style={[styles.collapsed, approved ? styles.collapsedApproved : styles.collapsedDeclined]}
            >
                {approved
                    ? <Check size={15} color={colors.positiveInk} />
                    : <X size={15} color={colors.textMuted} />}
                <Text style={styles.collapsedText}>
                    {actionLabel} · {approved ? 'Approved' : 'Declined'}
                </Text>
            </Pressable>
        );
    }

    return (
        <View style={styles.card}>
            {strong.sheet}
            <View style={styles.header}>
                <ShieldCheck size={16} color={colors.blue} />
                <Text style={styles.headerText}>{actionLabel}</Text>
                {decided && (
                    <Pressable onPress={() => setExpanded(false)} hitSlop={8}>
                        <ChevronDown size={16} color={colors.textFaint} style={{ transform: [{ rotate: '180deg' }] }} />
                    </Pressable>
                )}
            </View>

            <Text style={styles.summary}>{proposal.summary}</Text>

            {proposal.preview.map((f, i) => (
                <View key={i} style={styles.field}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <Text style={styles.fieldValue} numberOfLines={2}>{f.value}</Text>
                </View>
            ))}

            {!!proposal.warning && (
                <View style={styles.warning}>
                    <AlertTriangle size={13} color={colors.warn} />
                    <Text style={styles.warningText}>{proposal.warning}</Text>
                </View>
            )}

            {!decided && (
                <View style={styles.actions}>
                    <Pressable
                        style={[styles.btn, styles.btnDecline]}
                        onPress={() => onDecide(false)}
                        disabled={busy}
                    >
                        {busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.btnDeclineText}>Decline</Text>}
                    </Pressable>
                    <Pressable
                        style={[styles.btn, styles.btnApprove]}
                        onPress={approve}
                        disabled={busy}
                    >
                        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                            <View style={styles.approveInner}>
                                {proposal.strongAuth && <Lock size={13} color="#FFFFFF" />}
                                <Text style={styles.btnApproveText}>{proposal.strongAuth ? 'Confirm' : 'Approve'}</Text>
                            </View>
                        )}
                    </Pressable>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
        borderWidth: 1, borderColor: colors.border, marginVertical: 10, maxWidth: 320,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    headerText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    summary: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 10 },
    field: {
        flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    },
    fieldLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    fieldValue: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.text, textAlign: 'right' },
    warning: {
        flexDirection: 'row', gap: 6, backgroundColor: '#FDF2DF', borderRadius: radius.sm,
        padding: 9, marginTop: 10,
    },
    warningText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.warn, lineHeight: 15 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    btn: { flex: 1, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
    btnDecline: { backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border },
    btnDeclineText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    btnApprove: { backgroundColor: colors.blue },
    btnApproveText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    approveInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pinSheet: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24 },
    pinClose: { alignSelf: 'flex-end', padding: 4 },
    collapsed: {
        flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 9, marginVertical: 8, borderWidth: 1,
    },
    collapsedApproved: { backgroundColor: '#F0FBF6', borderColor: '#D1F2E4' },
    collapsedDeclined: { backgroundColor: colors.canvasAlt, borderColor: colors.border },
    collapsedText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
});
