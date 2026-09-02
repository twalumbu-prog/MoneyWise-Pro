import { useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Paperclip } from 'lucide-react-native';
import {
    requisitionService, getStatusConfig, formatKwacha, formatShortDate,
    canAuthoriseRequisition, canDisburse,
} from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { StatusIcon } from '../../src/components/StatusIcon';
import { ReceiptCapture } from '../../src/components/requisitions/ReceiptCapture';
import { RequisitionThread } from '../../src/components/requisitions/RequisitionThread';
import { DisburseSheet } from '../../src/components/requisitions/DisburseSheet';
import { PayrollDisburseSheet } from '../../src/components/requisitions/PayrollDisburseSheet';
import { colors, fonts, radius } from '../../src/theme/tokens';

export default function RequisitionDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const [acting, setActing] = useState<string | null>(null);

    const { data: req, isLoading, isError, error } = useQuery({
        queryKey: ['requisitions', id],
        queryFn: () => requisitionService.getById(String(id)),
        enabled: !!id,
    });

    const mutate = useMutation({
        mutationFn: (status: string) => requisitionService.updateStatus(String(id), status),
        onSuccess: () => {
            // Invalidate the list as well as this row: a status change moves the
            // requisition between inbox tabs and shifts the badge counts.
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            router.back();
        },
        onError: (e: Error) => Alert.alert('Could not update', e.message),
        onSettled: () => setActing(null),
    });

    const act = (status: string, verb: string) => {
        Alert.alert(`${verb} this request?`, req?.description ?? '', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: verb,
                style: status === 'REJECTED' ? 'destructive' : 'default',
                onPress: () => { setActing(status); mutate.mutate(status); },
            },
        ]);
    };

    // Gate comes from core, which mirrors updateRequisitionStatus in the API:
    // ACCOUNTANT, ADMIN or MANAGER. An earlier version of this screen checked
    // AUTHORISER || ADMIN, which was wrong both ways — AUTHORISER would have hit
    // a 403, and ACCOUNTANT/MANAGER never saw the buttons they were entitled to.
    const canApprove =
        req?.status === 'PENDING_APPROVAL' && canAuthoriseRequisition(userRole);

    // Payout is the next step after authorisation, and a separate permission:
    // ACCOUNTANT, CASHIER or ADMIN (see core/reference/roles).
    const canPayOut = req?.status === 'AUTHORISED' && canDisburse(userRole);

    // Receipts belong to the spending phase: once funds are out and before the
    // request is closed off. Matches when the web app offers receipt scanning.
    const canAttach =
        !!req && ['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'UNACCOUNTED'].includes(req.status);

    const status = req ? getStatusConfig(req.status) : null;
    const items = req?.items ?? [];

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back">
                    <ChevronLeft size={24} color={colors.textMuted} />
                </Pressable>
                <Text style={styles.headerTitle}>Request</Text>
                <View style={{ width: 24 }} />
            </View>

            {isLoading && <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>}

            {isError && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Couldn’t load this request</Text>
                    <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                </View>
            )}

            {req && status && (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.description}>{req.description}</Text>
                        <Text style={styles.amount}>
                            {formatKwacha(req.actual_total ?? req.estimated_total)}
                        </Text>
                        {req.actual_total != null && req.actual_total !== req.estimated_total && (
                            <Text style={styles.estimateNote}>
                                Estimated {formatKwacha(req.estimated_total)}
                            </Text>
                        )}
                        <View style={styles.statusLine}>
                            <StatusIcon status={req.status} size={16} />
                            <Text style={styles.statusLabel}>{status.label}</Text>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Details</Text>
                        <Field label="Requested by" value={req.requestor_name || 'System User'} />
                        <Field label="Raised" value={formatShortDate(req.created_at)} />
                        {!!req.department && <Field label="Department" value={req.department} />}
                        {!!req.type && <Field label="Type" value={req.type} />}
                        {!!req.payment_method && <Field label="Payment method" value={req.payment_method} />}
                        {!!req.recipient_name && <Field label="Recipient" value={req.recipient_name} />}
                    </View>

                    {items.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Line items ({items.length})</Text>
                            {items.map((it: any, i: number) => (
                                <View key={it.id ?? i} style={styles.item}>
                                    <View style={styles.itemMain}>
                                        <Text style={styles.itemDesc} numberOfLines={2}>{it.description}</Text>
                                        {!!it.quantity && (
                                            <Text style={styles.itemQty}>
                                                {it.quantity} × {formatKwacha(it.unit_price)}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={styles.itemRight}>
                                        <Text style={styles.itemAmount}>
                                            {formatKwacha(it.actual_amount ?? it.estimated_amount)}
                                        </Text>
                                        {!!it.receipt_url && (
                                            <View style={styles.receiptTag}>
                                                <Paperclip size={11} color={colors.textFaint} />
                                                <Text style={styles.receiptTagText}>Receipt</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {canPayOut && req && (
                        <View style={styles.card}>
                            {req.type === 'PAYROLL' ? (
                                <PayrollDisburseSheet
                                    requisitionId={String(id)}
                                    amount={req.actual_total ?? req.estimated_total}
                                    employeeCount={req.items?.length ?? 0}
                                    onDone={() => router.back()}
                                />
                            ) : (
                                <DisburseSheet
                                    requisitionId={String(id)}
                                    amount={req.actual_total ?? req.estimated_total}
                                    recipientName={req.recipient_name}
                                    recipientAccount={req.recipient_account}
                                    onDone={() => router.back()}
                                />
                            )}
                        </View>
                    )}

                    {canAttach && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Receipts</Text>
                            <Text style={styles.hint}>
                                Photograph a receipt and it goes straight into the same OCR
                                pipeline the web app uses.
                            </Text>
                            <ReceiptCapture
                                requisitionId={String(id)}
                                onUploaded={() => {
                                    qc.invalidateQueries({ queryKey: ['requisitions', id] });
                                    qc.invalidateQueries({ queryKey: ['requisitions', id, 'messages'] });
                                }}
                            />
                        </View>
                    )}

                    <View style={styles.card}>
                        <RequisitionThread requisitionId={String(id)} />
                    </View>

                    {canApprove && (
                        <View style={styles.actions}>
                            <Pressable
                                style={({ pressed }) => [styles.btn, styles.btnReject, pressed && styles.pressed]}
                                onPress={() => act('REJECTED', 'Reject')}
                                disabled={mutate.isPending}
                            >
                                {acting === 'REJECTED'
                                    ? <ActivityIndicator color={colors.danger} />
                                    : <Text style={styles.btnRejectText}>Reject</Text>}
                            </Pressable>
                            <Pressable
                                style={({ pressed }) => [styles.btn, styles.btnApprove, pressed && styles.pressed]}
                                onPress={() => act('AUTHORISED', 'Approve')}
                                disabled={mutate.isPending}
                            >
                                {acting === 'AUTHORISED'
                                    ? <ActivityIndicator color="#FFFFFF" />
                                    : <Text style={styles.btnApproveText}>Approve</Text>}
                            </Pressable>
                        </View>
                    )}
                </ScrollView>
            )}
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
    root: { flex: 1, backgroundColor: colors.canvas },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 12,
    },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    centre: { paddingVertical: 64, alignItems: 'center' },
    errorCard: {
        marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: radius.md,
        padding: 16, borderWidth: 1, borderColor: colors.danger,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border, gap: 4,
    },
    description: { fontFamily: fonts.body, fontSize: 18, color: colors.text, lineHeight: 25 },
    amount: { fontFamily: fonts.display, fontSize: 30, color: colors.navy, marginTop: 8 },
    estimateNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    statusLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginBottom: 8 },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17, marginBottom: 4 },
    field: {
        flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 7,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    fieldLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    fieldValue: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, textAlign: 'right' },
    item: {
        flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    itemMain: { flex: 1, gap: 2 },
    itemDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 19 },
    itemQty: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    itemRight: { alignItems: 'flex-end', gap: 4 },
    itemAmount: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    receiptTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    receiptTagText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
    btn: { flex: 1, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    btnReject: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
    btnRejectText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.danger },
    btnApprove: { backgroundColor: colors.blue },
    btnApproveText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    pressed: { opacity: 0.85 },
});
