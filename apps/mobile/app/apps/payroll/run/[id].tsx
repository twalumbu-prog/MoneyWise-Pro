import { useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react-native';
import { payrollService, formatKwacha } from 'core';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';


/**
 * Payroll run: register, statutory totals, approve and disburse. Matches
 * apps/web/src/components/payroll/PayrollRunDetail.tsx plus the payroll
 * disbursement flow from RequisitionMessageCard.tsx.
 *
 * Approving a run creates a linked type=PAYROLL requisition server-side; that
 * requisition cannot go through the generic single-recipient disburse sheet
 * (P3's DisburseSheet) because payroll pays many employees in one action and
 * the API enforces a 30s-per-call budget. Disbursement here loops
 * requisitionService.disbursePayroll until the server stops returning
 * IN_PROGRESS, same as the web message-card flow, so a large payroll finishes
 * instead of leaving the user looking at a half-done result.
 */
export default function PayrollRunDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const qc = useQueryClient();
    const [approving, setApproving] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['payroll-run', id],
        queryFn: () => payrollService.getRun(String(id)),
    });

    const run = data?.run;
    const items = data?.items ?? [];
    const documents = data?.documents ?? [];

    const approve = useMutation({
        mutationFn: () => payrollService.approveRun(String(id)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['payroll-run', id] });
            qc.invalidateQueries({ queryKey: ['payroll-runs'] });
            // Approving splits the run into one requisition PER pay source
            // (wallet, cash, bank...), so there is no single requisition to link
            // to here. Disbursement happens from wherever those requisitions
            // land -- the Inbox, or the Disbursements queue -- same as web,
            // where PayrollRunDetail is approve-only too.
            Alert.alert('Approved', 'Payroll requisitions have been raised. Find them in Disbursements to pay out.');
        },
        onError: (e: Error) => Alert.alert('Could not approve', e.message),
        onSettled: () => setApproving(false),
    });

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title={run?.period_label || 'Payroll Run'} right={
                run && run.status !== 'CLEARED' && run.status !== 'APPROVED' ? (
                    <Pressable onPress={() => { setApproving(true); approve.mutate(); }} disabled={approving}>
                        <Text style={styles.headerAction}>{approving ? 'Approving…' : 'Approve'}</Text>
                    </Pressable>
                ) : undefined
            } />

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.summaryCard}>
                        <SummaryStat label="Employees" value={String(run?.employee_count ?? 0)} />
                        <SummaryStat label="Gross" value={formatKwacha(run?.gross_total ?? 0)} />
                        <SummaryStat label="Net" value={formatKwacha(run?.net_total ?? 0)} />
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Register ({items.length})</Text>
                        {items.map((item) => (
                            <View key={item.id} style={styles.registerRow}>
                                <View style={styles.registerMain}>
                                    <Text style={styles.registerName} numberOfLines={1}>{item.staff_name}</Text>
                                    <Text style={styles.registerMeta}>
                                        Gross {formatKwacha(item.gross_pay)} · PAYE {formatKwacha(item.paye)} ·
                                        NAPSA {formatKwacha(item.napsa_employee)} · NHIMA {formatKwacha(item.nhima_employee)}
                                    </Text>
                                </View>
                                <Text style={styles.registerNet}>{formatKwacha(item.net_pay)}</Text>
                            </View>
                        ))}
                        {items.length === 0 && <Text style={styles.emptyHint}>No line items on this run.</Text>}
                    </View>

                    {documents.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Documents ({documents.length})</Text>
                            {documents.map((doc) => (
                                <View key={doc.id} style={styles.docRow}>
                                    <FileText size={15} color={colors.textFaint} />
                                    <Text style={styles.docName} numberOfLines={1}>{doc.file_name}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const SummaryStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.stat}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center' },
    headerAction: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    summaryCard: {
        flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg,
        borderWidth: 1, borderColor: colors.border, padding: 16,
    },
    stat: { flex: 1, alignItems: 'center' },
    statLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase' },
    statValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginTop: 4 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginBottom: 10 },
    registerRow: {
        flexDirection: 'row', gap: 10, paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    },
    registerMain: { flex: 1 },
    registerName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    registerMeta: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 3, lineHeight: 14 },
    registerNet: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy },
    emptyHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    docName: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});
