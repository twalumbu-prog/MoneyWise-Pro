import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Modal,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { X, AlertCircle, ChevronDown, ArrowRight } from 'lucide-react-native';
import { requisitionService, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../src/theme/tokens';

const DEPARTMENTS = ['Finance', 'Admin', 'HR', 'IT', 'Education', 'Transportation', 'Stocks', 'Maintenance', 'Catering'];
const ACCENT = '#10B981';
type Stage = 1 | 2;

/** Native port of apps/web/src/components/requisitions/MobileSalaryAdvanceWizard.tsx. */
export default function NewSalaryAdvanceScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const insets = useSafeAreaInsets();

    const [stage, setStage] = useState<Stage>(1);
    const [staffName, setStaffName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [department, setDepartment] = useState('');
    const [deptPickerOpen, setDeptPickerOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const numericAmount = Number(amount) || 0;

    const proceed = () => {
        if (!staffName.trim()) { setError("Please enter the staff member's name."); return; }
        if (!employeeId.trim()) { setError('Please enter the employee ID.'); return; }
        if (numericAmount <= 0) { setError('Please enter a valid advance amount.'); return; }
        if (!department) { setError('Please select a department.'); return; }
        setError(null);
        setStage(2);
    };

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await requisitionService.create({
                description: `ADVANCE: ${staffName} - ${reason || 'Salary Advance'}`,
                department,
                type: 'ADVANCE',
                estimated_total: numericAmount,
                staff_name: staffName,
                employee_id: employeeId,
                loan_amount: numericAmount,
            } as any);
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            router.back();
        } catch (e: any) {
            setError(e?.message ?? 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.brandBar, { paddingTop: insets.top }]}>
                <Text style={styles.brandText}>MoneyWise<Text style={styles.brandAccent}>Pro</Text></Text>
            </View>

            <View style={styles.header}>
                <Text style={styles.headerTitle}>New Salary Advance</Text>
                <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
                    <X size={16} color={colors.navy} strokeWidth={3} />
                </Pressable>
            </View>

            <View style={styles.progressRow}>
                {([1, 2] as Stage[]).map((s) => (
                    <View key={s} style={[styles.progressBar, stage >= s && styles.progressBarActive]} />
                ))}
            </View>
            <Text style={styles.progressLabel}>Step {stage} of 2 — {stage === 1 ? 'Advance Details' : 'Summary'}</Text>

            <ScrollView contentContainerStyle={styles.scroll}>
                {error && (
                    <View style={styles.errorCard}><AlertCircle size={15} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
                )}

                {stage === 1 && (
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Text style={styles.stepTitle}>Advance Details</Text>
                        <Text style={styles.stepSub}>Fill in the details for the salary advance</Text>

                        <Text style={styles.label}>Staff Member Name</Text>
                        <TextInput style={styles.input} value={staffName} onChangeText={setStaffName} placeholder="Enter full name" placeholderTextColor={colors.textFaint} />

                        <Text style={[styles.label, styles.spaced]}>Employee ID</Text>
                        <TextInput style={styles.input} value={employeeId} onChangeText={setEmployeeId} placeholder="e.g. EMP-001" placeholderTextColor={colors.textFaint} />

                        <Text style={[styles.label, styles.spaced]}>Department</Text>
                        <Pressable style={styles.selectInput} onPress={() => setDeptPickerOpen(true)}>
                            <Text style={[styles.selectInputText, !department && styles.selectInputPlaceholder]}>{department || 'Select Department'}</Text>
                            <ChevronDown size={16} color={colors.textFaint} />
                        </Pressable>

                        <Text style={[styles.label, styles.spaced]}>Advance Amount (K)</Text>
                        <TextInput style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />

                        <Text style={[styles.label, styles.spaced]}>Reason for Advance (optional)</Text>
                        <TextInput style={[styles.input, styles.multiline]} value={reason} onChangeText={setReason} multiline placeholder="Briefly explain why this advance is needed…" placeholderTextColor={colors.textFaint} />

                        {numericAmount > 0 && (
                            <View style={styles.previewCard}>
                                <Text style={styles.previewLabel}>ADVANCE AMOUNT</Text>
                                <Text style={styles.previewAmount}>{formatKwacha(numericAmount)}</Text>
                                <Text style={styles.previewNote}>To be deducted from next payroll</Text>
                            </View>
                        )}
                    </KeyboardAvoidingView>
                )}

                {stage === 2 && (
                    <>
                        <Text style={styles.stepTitle}>Advance Summary</Text>
                        <Text style={styles.stepSub}>Review and confirm the advance request</Text>

                        <View style={styles.summaryCard}>
                            <SummaryRow label="Staff Member" value={staffName} />
                            <SummaryRow label="Employee ID" value={employeeId} />
                            <SummaryRow label="Department" value={department} />
                            <SummaryRow label="Advance Amount" value={formatKwacha(numericAmount)} />
                            {reason && <Text style={styles.summaryReason}>Reason: {reason}</Text>}
                        </View>

                        <View style={styles.noteCard}>
                            <Text style={styles.noteText}>This salary advance will be deducted from the employee's next payroll cycle.</Text>
                        </View>

                        <Pressable style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={submit} disabled={submitting}>
                            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Submit Advance Request</Text>}
                        </Pressable>
                    </>
                )}
            </ScrollView>

            {stage === 1 && (
                <View style={styles.footer}>
                    <Pressable style={styles.nextBtn} onPress={proceed}>
                        <ArrowRight size={24} color="#FFFFFF" />
                    </Pressable>
                </View>
            )}

            <Modal visible={deptPickerOpen} transparent animationType="fade" onRequestClose={() => setDeptPickerOpen(false)}>
                <Pressable style={styles.pickerBackdrop} onPress={() => setDeptPickerOpen(false)}>
                    <View style={styles.pickerSheet}>
                        {DEPARTMENTS.map((d) => (
                            <Pressable key={d} style={styles.pickerRow} onPress={() => { setDepartment(d); setDeptPickerOpen(false); }}>
                                <Text style={styles.pickerRowText}>{d}</Text>
                            </Pressable>
                        ))}
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    brandBar: { minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt, paddingHorizontal: 24, paddingBottom: 12, justifyContent: 'flex-end' },
    brandText: { fontFamily: fonts.bodyMedium, fontSize: 19, color: colors.navy },
    brandAccent: { fontFamily: fonts.bodyBold, color: colors.blue },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16 },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    progressRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24 },
    progressBar: { height: 4, flex: 1, borderRadius: 2, backgroundColor: colors.canvasAlt },
    progressBarActive: { backgroundColor: ACCENT },
    progressLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, paddingHorizontal: 24 },
    scroll: { padding: 24, gap: 4, paddingBottom: 40 },
    errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FEF2F2', borderRadius: radius.lg, padding: 14, marginBottom: 12 },
    errorText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, lineHeight: 17 },
    stepTitle: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.navy },
    stepSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginTop: 4, marginBottom: 18 },
    label: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    spaced: { marginTop: 16 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg,
        paddingHorizontal: 16, paddingVertical: 13,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    selectInput: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg,
        paddingHorizontal: 16, paddingVertical: 13,
    },
    selectInputText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    selectInputPlaceholder: { color: colors.textFaint, fontFamily: fonts.body },
    previewCard: { backgroundColor: ACCENT, borderRadius: radius.lg, padding: 20, marginTop: 20 },
    previewLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
    previewAmount: { fontFamily: fonts.bodyBold, fontSize: 28, color: '#FFFFFF', marginTop: 6 },
    previewNote: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
    summaryCard: { backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    summaryValue: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    summaryReason: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
    noteCard: { backgroundColor: '#ECFDF5', borderRadius: radius.lg, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#D1FAE5' },
    noteText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#047857', lineHeight: 17 },
    submitBtn: { backgroundColor: ACCENT, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52, marginTop: 20 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    footer: { paddingHorizontal: 24, paddingVertical: 20, alignItems: 'flex-end' },
    nextBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
    pickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingVertical: 12, paddingBottom: 32 },
    pickerRow: { paddingHorizontal: 24, paddingVertical: 14 },
    pickerRowText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
});
