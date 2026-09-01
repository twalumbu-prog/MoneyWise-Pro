import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Check, X, ShieldCheck, ChevronDown, AlertTriangle } from 'lucide-react-native';
import type { Proposal } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

const ACTION_LABELS: Record<string, string> = {
    create_requisition: 'Create requisition',
    update_requisition: 'Update requisition',
    create_scheduled_item: 'Add scheduled expense',
    update_scheduled_item: 'Update scheduled expense',
    categorize_transaction: 'Classify transaction',
    categorize_requisition_expense: 'Classify expense line item',
    update_org_settings: 'Change settings',
};

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
                        onPress={() => onDecide(true)}
                        disabled={busy}
                    >
                        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.btnApproveText}>Approve</Text>}
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
    collapsed: {
        flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 9, marginVertical: 8, borderWidth: 1,
    },
    collapsedApproved: { backgroundColor: '#F0FBF6', borderColor: '#D1F2E4' },
    collapsedDeclined: { backgroundColor: colors.canvasAlt, borderColor: colors.border },
    collapsedText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
});
