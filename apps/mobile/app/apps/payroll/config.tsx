import { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, Switch,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { payrollService } from 'core';
import type { AllowanceConfig, DeductionConfig } from 'core';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../src/theme/tokens';

const genId = () => Math.random().toString(36).slice(2, 9);

/** Organisation-wide allowance and deduction types. Matches PayrollConfigModal.tsx. */
export default function PayrollConfigScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const { data: config, isLoading } = useQuery({
        queryKey: ['payroll-config'],
        queryFn: () => payrollService.getPayrollConfig(),
    });

    const [allowances, setAllowances] = useState<AllowanceConfig[]>([]);
    const [deductions, setDeductions] = useState<DeductionConfig[]>([]);

    useEffect(() => {
        if (config) {
            setAllowances(config.allowance_types || []);
            setDeductions(config.deduction_types || []);
        }
    }, [config]);

    const save = useMutation({
        mutationFn: () => payrollService.upsertPayrollConfig({
            basic_pay_configured: true,
            allowance_types: allowances.filter((a) => a.name.trim()),
            deduction_types: deductions.filter((d) => d.name.trim()),
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['payroll-config'] });
            router.back();
        },
        onError: (e: Error) => Alert.alert('Could not save', e.message),
    });

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Payroll Configuration" />

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Base Income</Text>
                        <View style={styles.systemRow}>
                            <View style={styles.systemMain}>
                                <Text style={styles.systemLabel}>Basic Pay</Text>
                                <Text style={styles.systemSub}>Always present. Configurable per staff member.</Text>
                            </View>
                            <View style={styles.requiredPill}><Text style={styles.requiredPillText}>Required</Text></View>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Allowance Types</Text>
                            <Pressable
                                onPress={() => setAllowances((p) => [...p, { id: genId(), name: '', separate_step: false, subject_to_statutory: true }])}
                                hitSlop={8}
                            >
                                <Plus size={18} color={colors.blue} />
                            </Pressable>
                        </View>
                        {allowances.map((a, i) => (
                            <View key={a.id} style={styles.typeRow}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    value={a.name}
                                    onChangeText={(v) => setAllowances((p) => p.map((x, j) => j === i ? { ...x, name: v } : x))}
                                    placeholder="e.g. Transport"
                                    placeholderTextColor={colors.textFaint}
                                />
                                <View style={styles.taxToggle}>
                                    <Text style={styles.taxToggleLabel}>Taxable</Text>
                                    <Switch
                                        value={a.subject_to_statutory}
                                        onValueChange={(v) => setAllowances((p) => p.map((x, j) => j === i ? { ...x, subject_to_statutory: v } : x))}
                                        trackColor={{ true: colors.blue, false: colors.borderStrong }}
                                    />
                                </View>
                                <Pressable onPress={() => setAllowances((p) => p.filter((_, j) => j !== i))} hitSlop={8}>
                                    <Trash2 size={16} color={colors.danger} />
                                </Pressable>
                            </View>
                        ))}
                        {allowances.length === 0 && <Text style={styles.emptyHint}>No allowance types configured — a generic "Allowances" step will be used instead.</Text>}
                    </View>

                    <View style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Deduction Types</Text>
                            <Pressable onPress={() => setDeductions((p) => [...p, { id: genId(), name: '' }])} hitSlop={8}>
                                <Plus size={18} color={colors.blue} />
                            </Pressable>
                        </View>
                        {deductions.map((d, i) => (
                            <View key={d.id} style={styles.typeRow}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    value={d.name}
                                    onChangeText={(v) => setDeductions((p) => p.map((x, j) => j === i ? { ...x, name: v } : x))}
                                    placeholder="e.g. Uniform"
                                    placeholderTextColor={colors.textFaint}
                                />
                                <Pressable onPress={() => setDeductions((p) => p.filter((_, j) => j !== i))} hitSlop={8}>
                                    <Trash2 size={16} color={colors.danger} />
                                </Pressable>
                            </View>
                        ))}
                        {deductions.length === 0 && <Text style={styles.emptyHint}>No deduction types configured — a generic "Other Deductions" step will be used instead.</Text>}
                    </View>

                    <Pressable style={styles.saveBtn} onPress={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save configuration</Text>}
                    </Pressable>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center' },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
    systemRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.canvasAlt, borderRadius: radius.md, padding: 12, marginTop: 8,
    },
    systemMain: { flex: 1 },
    systemLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    systemSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    requiredPill: { backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    requiredPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textMuted },
    typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    input: {
        fontFamily: fonts.body, fontSize: 13, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    taxToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    taxToggleLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    emptyHint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 16 },
    saveBtn: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
