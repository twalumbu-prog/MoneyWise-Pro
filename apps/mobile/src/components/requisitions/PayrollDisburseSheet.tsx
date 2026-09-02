import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { requisitionService, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * Batch payroll disbursement — one requisition, many employees.
 *
 * The generic DisburseSheet asks for a single payment method and recipient
 * account, which is meaningless here: each employee's destination was already
 * resolved per-employee when the run was approved. The API also enforces a
 * ~30s budget per call and pays as many employees as it can before returning
 * `IN_PROGRESS` (see docs/mobile-app -- batch-payroll-ledger), so this loops
 * requisitionService.disbursePayroll until the server reports it's actually
 * done, exactly like the web message-card flow it mirrors.
 */
export const PayrollDisburseSheet: React.FC<{
    requisitionId: string;
    amount: number;
    employeeCount: number;
    onDone: () => void;
}> = ({ requisitionId, amount, employeeCount, onDone }) => {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);

    const run = async () => {
        setBusy(true);
        setProgress(null);
        try {
            let paid = 0;
            let result: any = null;
            for (let pass = 0; pass < 20; pass++) {
                result = await requisitionService.disbursePayroll(requisitionId);
                paid += Number(result.successfulCount || 0);
                if (result.status !== 'IN_PROGRESS') break;
                setProgress(`Paid ${paid} of ${paid + Number(result.pendingCount || 0)} employees — continuing…`);
                await new Promise((r) => setTimeout(r, 1500));
            }
            if (result?.failedCount > 0) {
                const names = (result.failedItems ?? []).map((f: any) => f.name).join(', ');
                Alert.alert('Some payouts failed', `${result.failedCount} could not be paid: ${names}`);
            } else {
                Alert.alert('Payroll disbursed', `Paid ${paid} employee${paid === 1 ? '' : 's'}.`);
            }
            onDone();
        } catch (e: any) {
            Alert.alert('Disbursement failed', e?.message ?? 'Please try again.');
        } finally {
            setBusy(false);
            setProgress(null);
        }
    };

    return (
        <View style={styles.root}>
            <Text style={styles.title}>Disburse payroll</Text>
            <Text style={styles.sub}>
                {employeeCount} employee{employeeCount === 1 ? '' : 's'} · {formatKwacha(amount)} total
            </Text>

            {progress && (
                <View style={styles.progressCard}><Text style={styles.progressText}>{progress}</Text></View>
            )}

            <Pressable
                style={[styles.btn, busy && styles.btnDisabled]}
                onPress={() => Alert.alert(
                    'Disburse payroll?',
                    `Pay ${employeeCount} employee${employeeCount === 1 ? '' : 's'} now — ${formatKwacha(amount)} total.`,
                    [{ text: 'Cancel', style: 'cancel' }, { text: 'Disburse', onPress: run }],
                )}
                disabled={busy}
            >
                {busy
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.btnText}>Disburse payroll</Text>}
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { gap: 10 },
    title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    progressCard: { backgroundColor: colors.tabActiveBg, borderRadius: radius.md, padding: 10 },
    progressText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.blue },
    btn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15,
        alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 6,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
