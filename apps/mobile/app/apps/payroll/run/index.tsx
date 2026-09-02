import { useEffect, useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Search, Check } from 'lucide-react-native';
import {
    payrollService, cashbookService, calcGross, calcNet, sumValues, formatKwacha,
} from 'core';
import type { AllowanceConfig, DeductionConfig } from 'core';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type StepKind = 'PERIOD' | 'OVERTIME' | 'ALLOWANCE' | 'ALLOWANCE_GENERIC' | 'LOANS' | 'DEDUCTION' | 'DEDUCTION_GENERIC' | 'REVIEW';

interface StepDef {
    key: string;
    kind: StepKind;
    label: string;
    name?: string;
    taxable?: boolean;
}

interface RunItem {
    staff_id: string;
    staff_name: string;
    basic_pay: number;
    overtime: number;
    taxable_allowances: number;
    non_taxable_allowances: number;
    loans: number;
    other_deductions: number;
    destination_method: 'BANK' | 'MOBILE_MONEY';
    pay_source: string;
    custom_allowances: Record<string, number>;
    custom_deductions: Record<string, number>;
    bank_name?: string;
    bank_account_number?: string;
    mobile_money_number?: string;
}

/**
 * Run Payroll. Same dynamic step structure as apps/web/src/pages/RunPayrollPage.tsx:
 * one step per configured allowance type, one per configured deduction type,
 * generic fallbacks when none are configured. Review is a card list rather
 * than web's per-configured-type table -- the table reads fine on a desktop
 * monitor and does not read at all on a phone, so this shows the same figures
 * (gross, net, statutory) per employee instead of one column per type.
 */
export default function RunPayrollScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const now = new Date();

    const [stepIdx, setStepIdx] = useState(0);
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<RunItem[]>([]);
    const [stepMembers, setStepMembers] = useState<Record<string, Set<string>>>({});
    const [stepSearch, setStepSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const { data: allStaff } = useQuery({ queryKey: ['payroll-staff-all'], queryFn: () => payrollService.listStaff() });
    const { data: wallets } = useQuery({ queryKey: ['wallets'], queryFn: () => cashbookService.getWallets() });
    const { data: config } = useQuery({ queryKey: ['payroll-config'], queryFn: () => payrollService.getPayrollConfig() });
    const { data: suggestedDeductions } = useQuery({
        queryKey: ['suggested-deductions', month, year],
        queryFn: () => payrollService.getSuggestedDeductions(month, year),
    });

    const allowanceTypes: AllowanceConfig[] = config?.allowance_types ?? [];
    const deductionTypes: DeductionConfig[] = config?.deduction_types ?? [];
    const defaultPaySource = wallets && wallets.length > 0 ? `wallet:${wallets[0].id}` : 'CASH';

    const steps: StepDef[] = useMemo(() => {
        const out: StepDef[] = [
            { key: 'PERIOD', kind: 'PERIOD', label: 'Select Period' },
            { key: 'OVERTIME', kind: 'OVERTIME', label: 'Staff & Overtime' },
        ];
        if (allowanceTypes.length > 0) {
            allowanceTypes.forEach((a) => out.push({ key: `ALLOWANCE:${a.name}`, kind: 'ALLOWANCE', label: a.name, name: a.name, taxable: a.subject_to_statutory !== false }));
        } else {
            out.push({ key: 'ALLOWANCE_GENERIC', kind: 'ALLOWANCE_GENERIC', label: 'Allowances & Bonuses' });
        }
        out.push({ key: 'LOANS', kind: 'LOANS', label: 'Loans & Advances' });
        if (deductionTypes.length > 0) {
            deductionTypes.forEach((d) => out.push({ key: `DEDUCTION:${d.name}`, kind: 'DEDUCTION', label: d.name, name: d.name }));
        } else {
            out.push({ key: 'DEDUCTION_GENERIC', kind: 'DEDUCTION_GENERIC', label: 'Other Deductions' });
        }
        out.push({ key: 'REVIEW', kind: 'REVIEW', label: 'Review & Payment' });
        return out;
    }, [allowanceTypes, deductionTypes]);

    const step = steps[Math.min(stepIdx, steps.length - 1)];
    const isLastStep = stepIdx >= steps.length - 1;

    // Auto-populate active staff once staff/config/suggestions have all loaded.
    useEffect(() => {
        if (!allStaff || allStaff.length === 0 || !config || suggestedDeductions === undefined || items.length > 0) return;

        const initial: RunItem[] = allStaff
            .filter((s) => !s.status || s.status === 'ACTIVE')
            .map((s) => {
                const hasBank = !!s.bank_account_number?.trim();
                const dest: 'BANK' | 'MOBILE_MONEY' =
                    s.payment_method === 'MOBILE_MONEY' ? 'MOBILE_MONEY'
                        : s.payment_method === 'BANK' ? 'BANK'
                        : hasBank ? 'BANK' : 'MOBILE_MONEY';

                const sd = (suggestedDeductions as any)?.[s.id];
                const autoLoans = sd ? (sd.loans || 0) + (sd.advances || 0) : 0;
                const standingLoans = s.deductions?.filter((d) => d.type === 'LOAN' || d.type === 'ADVANCE')
                    .reduce((sum, d) => sum + d.amount, 0) ?? 0;

                const customAllowances: Record<string, number> = {};
                allowanceTypes.forEach((a) => { customAllowances[a.name] = s.allowances?.find((x) => x.name === a.name)?.amount ?? 0; });
                const customDeductions: Record<string, number> = {};
                deductionTypes.forEach((d) => { customDeductions[d.name] = s.deductions?.find((x) => x.name === d.name)?.amount ?? 0; });

                let baseTaxable = 0;
                s.allowances?.forEach((a) => { if (!allowanceTypes.find((ca) => ca.name === a.name)) baseTaxable += a.amount; });
                const orphanFixed = s.deductions?.filter((d) => d.type === 'FIXED' && !deductionTypes.find((dt) => dt.name === d.name))
                    .reduce((sum, d) => sum + d.amount, 0) ?? 0;

                return {
                    staff_id: s.id,
                    staff_name: `${s.first_name} ${s.last_name}`,
                    basic_pay: s.basic_pay,
                    overtime: 0,
                    taxable_allowances: baseTaxable,
                    non_taxable_allowances: 0,
                    loans: standingLoans + autoLoans,
                    other_deductions: orphanFixed,
                    bank_name: s.bank_name ?? undefined,
                    bank_account_number: s.bank_account_number ?? undefined,
                    mobile_money_number: s.mobile_money_number ?? undefined,
                    destination_method: dest,
                    pay_source: defaultPaySource,
                    custom_allowances: customAllowances,
                    custom_deductions: customDeductions,
                };
            });
        setItems(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allStaff, config, suggestedDeductions, defaultPaySource]);

    // Entering a step auto-adds anyone who already has a non-zero amount for it.
    useEffect(() => {
        if (!step || items.length === 0 || step.kind === 'PERIOD' || step.kind === 'REVIEW') return;
        setStepMembers((prev) => {
            const existing = prev[step.key] ?? new Set<string>();
            const next = new Set(existing);
            items.forEach((item) => { if (valueForStep(item, step) > 0) next.add(item.staff_id); });
            if (next.size === existing.size) return prev;
            return { ...prev, [step.key]: next };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIdx, items.length]);

    function valueForStep(item: RunItem, s: StepDef): number {
        switch (s.kind) {
            case 'OVERTIME': return item.overtime;
            case 'ALLOWANCE': return item.custom_allowances?.[s.name!] ?? 0;
            case 'ALLOWANCE_GENERIC': return item.taxable_allowances + item.non_taxable_allowances;
            case 'LOANS': return item.loans;
            case 'DEDUCTION': return item.custom_deductions?.[s.name!] ?? 0;
            case 'DEDUCTION_GENERIC': return item.other_deductions;
            default: return 0;
        }
    }

    const updateItem = (idx: number, patch: Partial<RunItem>) =>
        setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

    const setValueForStep = (idx: number, s: StepDef, val: number) => {
        const item = items[idx];
        switch (s.kind) {
            case 'OVERTIME': return updateItem(idx, { overtime: val });
            case 'ALLOWANCE': return updateItem(idx, { custom_allowances: { ...item.custom_allowances, [s.name!]: val } });
            case 'LOANS': return updateItem(idx, { loans: val });
            case 'DEDUCTION': return updateItem(idx, { custom_deductions: { ...item.custom_deductions, [s.name!]: val } });
            case 'DEDUCTION_GENERIC': return updateItem(idx, { other_deductions: val });
        }
    };

    const membersOf = (key: string) => stepMembers[key] ?? new Set<string>();
    const addMember = (key: string, id: string) => setStepMembers((p) => ({ ...p, [key]: new Set([...(p[key] ?? []), id]) }));
    const removeMember = (key: string, id: string) => setStepMembers((p) => {
        const next = new Set(p[key] ?? []); next.delete(id); return { ...p, [key]: next };
    });

    const totals = items.reduce((acc, item) => ({
        gross: acc.gross + calcGross(item),
        net: acc.net + calcNet(item, allowanceTypes),
    }), { gross: 0, net: 0 });

    const availableForStep = items.filter((item) =>
        !membersOf(step?.key ?? '').has(item.staff_id) &&
        (stepSearch ? item.staff_name.toLowerCase().includes(stepSearch.toLowerCase()) : true));
    const panelItems = items.filter((item) => membersOf(step?.key ?? '').has(item.staff_id));

    const submit = useMutation({
        mutationFn: () => {
            const walletSource = items.find((i) => i.pay_source.startsWith('wallet:'))?.pay_source;
            const pay_from_wallet_id = walletSource ? walletSource.replace('wallet:', '') : undefined;
            return payrollService.createRun({
                period_month: month,
                period_year: year,
                notes: notes.trim() || undefined,
                pay_from_wallet_id,
                items: items.map((item) => {
                    const taxableCustom = Object.entries(item.custom_allowances).reduce((sum, [name, val]) =>
                        allowanceTypes.find((a) => a.name === name)?.subject_to_statutory !== false ? sum + val : sum, 0);
                    const nonTaxableCustom = Object.entries(item.custom_allowances).reduce((sum, [name, val]) =>
                        allowanceTypes.find((a) => a.name === name)?.subject_to_statutory === false ? sum + val : sum, 0);
                    return {
                        staff_id: item.staff_id,
                        staff_name: item.staff_name,
                        basic_pay: item.basic_pay,
                        overtime: item.overtime,
                        taxable_allowances: item.taxable_allowances + taxableCustom,
                        non_taxable_allowances: item.non_taxable_allowances + nonTaxableCustom,
                        loans: item.loans,
                        other_deductions: item.other_deductions + sumValues(item.custom_deductions),
                        payment_method: item.destination_method,
                        bank_name: item.destination_method === 'BANK' ? item.bank_name : undefined,
                        bank_account_number: item.destination_method === 'BANK' ? item.bank_account_number : undefined,
                        mobile_money_number: item.destination_method === 'MOBILE_MONEY' ? item.mobile_money_number : undefined,
                    };
                }),
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['payroll-runs'] });
            router.replace('/apps/payroll');
        },
        onError: (e: Error) => Alert.alert('Could not run payroll', e.message),
        onSettled: () => setSaving(false),
    });

    const goNext = () => {
        if (step.kind === 'PERIOD' && items.length === 0) {
            Alert.alert('No employees found', 'There are no active employees to run payroll for.');
            return;
        }
        setStepSearch('');
        if (!isLastStep) setStepIdx((i) => i + 1);
        else { setSaving(true); submit.mutate(); }
    };
    const goBack = () => {
        if (stepIdx === 0) router.back();
        else setStepIdx((i) => i - 1);
    };

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Run Payroll" />

            <View style={styles.stepIndicator}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepDots}>
                    {steps.map((s, i) => (
                        <View key={s.key} style={styles.stepDotWrap}>
                            <Pressable
                                onPress={() => i < stepIdx && setStepIdx(i)}
                                style={[styles.stepDot, i <= stepIdx && styles.stepDotActive]}
                                disabled={i >= stepIdx}
                            >
                                {i < stepIdx
                                    ? <Check size={11} color="#FFFFFF" />
                                    : <Text style={[styles.stepDotText, i <= stepIdx && styles.stepDotTextActive]}>{i + 1}</Text>}
                            </Pressable>
                            {i < steps.length - 1 && <View style={[styles.stepLine, i < stepIdx && styles.stepLineActive]} />}
                        </View>
                    ))}
                </ScrollView>
                <Text style={styles.stepCount}>Step {stepIdx + 1} of {steps.length}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.stepTitle}>{step?.label}</Text>

                {step?.kind === 'PERIOD' && (
                    <View style={styles.card}>
                        <View style={styles.row2}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Month</Text>
                                <View style={styles.chips}>
                                    {[now.getMonth() - 1, now.getMonth(), now.getMonth() + 1].map((mi) => {
                                        const m = ((mi % 12) + 12) % 12 + 1;
                                        return (
                                            <Pressable key={m} onPress={() => setMonth(m)} style={[styles.chip, month === m && styles.chipActive]}>
                                                <Text style={[styles.chipText, month === m && styles.chipTextActive]}>{MONTHS[m]}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                        <Text style={[styles.label, styles.spaced]}>Year</Text>
                        <View style={styles.chips}>
                            {[year - 1, year, year + 1].map((y) => (
                                <Pressable key={y} onPress={() => setYear(y)} style={[styles.chip, year === y && styles.chipActive]}>
                                    <Text style={[styles.chipText, year === y && styles.chipTextActive]}>{y}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <Text style={[styles.label, styles.spaced]}>Notes (optional)</Text>
                        <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} multiline placeholder="Any notes for this run…" placeholderTextColor={colors.textFaint} />
                        <Text style={styles.hint}>
                            This run has {steps.length - 2} adjustment {steps.length - 2 === 1 ? 'step' : 'steps'} configured
                            {allowanceTypes.length + deductionTypes.length > 0 ? ' from your payroll settings.' : '.'}
                        </Text>
                    </View>
                )}

                {step?.kind === 'ALLOWANCE_GENERIC' && (
                    <>
                        <StepAddPanel
                            search={stepSearch} onSearch={setStepSearch}
                            available={availableForStep}
                            onAdd={(id) => { addMember(step.key, id); setStepSearch(''); }}
                        />
                        {panelItems.length === 0 ? <EmptyPanel /> : panelItems.map((item) => {
                            const idx = items.findIndex((i) => i.staff_id === item.staff_id);
                            return (
                                <View key={item.staff_id} style={styles.memberCard}>
                                    <View style={styles.memberHeader}>
                                        <Text style={styles.memberName}>{item.staff_name}</Text>
                                        <Pressable onPress={() => removeMember(step.key, item.staff_id)} hitSlop={8}><Trash2 size={14} color={colors.textFaint} /></Pressable>
                                    </View>
                                    <View style={styles.row2}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Taxable (K)</Text>
                                            <TextInput style={styles.input} value={String(item.taxable_allowances || '')} onChangeText={(v) => updateItem(idx, { taxable_allowances: Number(v.replace(/[^0-9.]/g, '')) || 0 })} keyboardType="decimal-pad" placeholderTextColor={colors.textFaint} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Non-taxable (K)</Text>
                                            <TextInput style={styles.input} value={String(item.non_taxable_allowances || '')} onChangeText={(v) => updateItem(idx, { non_taxable_allowances: Number(v.replace(/[^0-9.]/g, '')) || 0 })} keyboardType="decimal-pad" placeholderTextColor={colors.textFaint} />
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}

                {step && ['OVERTIME', 'ALLOWANCE', 'LOANS', 'DEDUCTION', 'DEDUCTION_GENERIC'].includes(step.kind) && (
                    <>
                        {step.kind === 'ALLOWANCE' && (
                            <View style={[styles.taxPill, { backgroundColor: step.taxable ? '#FDF2DF' : '#E4FAF1' }]}>
                                <Text style={[styles.taxPillText, { color: step.taxable ? colors.warn : colors.positiveInk }]}>
                                    {step.taxable ? 'Taxable' : 'Non-taxable'}
                                </Text>
                            </View>
                        )}
                        <StepAddPanel
                            search={stepSearch} onSearch={setStepSearch}
                            available={availableForStep}
                            onAdd={(id) => { addMember(step.key, id); setStepSearch(''); }}
                        />
                        {panelItems.length === 0 ? <EmptyPanel /> : panelItems.map((item) => {
                            const idx = items.findIndex((i) => i.staff_id === item.staff_id);
                            const val = valueForStep(item, step);
                            return (
                                <View key={item.staff_id} style={styles.memberCard}>
                                    <View style={styles.memberHeader}>
                                        <Text style={styles.memberName}>{item.staff_name}</Text>
                                        <Pressable onPress={() => removeMember(step.key, item.staff_id)} hitSlop={8}><Trash2 size={14} color={colors.textFaint} /></Pressable>
                                    </View>
                                    <TextInput
                                        style={styles.input}
                                        value={String(val || '')}
                                        onChangeText={(v) => setValueForStep(idx, step, Number(v.replace(/[^0-9.]/g, '')) || 0)}
                                        keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint}
                                    />
                                </View>
                            );
                        })}
                    </>
                )}

                {step?.kind === 'REVIEW' && (
                    <>
                        <View style={styles.reviewSummary}>
                            <ReviewStat label="Employees" value={String(items.length)} />
                            <ReviewStat label="Gross" value={formatKwacha(totals.gross)} />
                            <ReviewStat label="Est. Net" value={formatKwacha(totals.net)} />
                        </View>
                        {items.map((item) => (
                            <View key={item.staff_id} style={styles.reviewCard}>
                                <View style={styles.reviewCardTop}>
                                    <Text style={styles.memberName}>{item.staff_name}</Text>
                                    <Text style={styles.reviewNet}>{formatKwacha(calcNet(item, allowanceTypes))}</Text>
                                </View>
                                <Text style={styles.reviewMeta}>
                                    Gross {formatKwacha(calcGross(item))} · via {item.destination_method === 'BANK' ? (item.bank_name || 'Bank') : 'Mobile Money'}
                                </Text>
                            </View>
                        ))}
                    </>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable style={styles.backBtn} onPress={goBack}><Text style={styles.backBtnText}>Back</Text></Pressable>
                <Pressable style={[styles.nextBtn, saving && styles.nextBtnDisabled]} onPress={goNext} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.nextBtnText}>{isLastStep ? 'Run Payroll' : 'Next'}</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const StepAddPanel: React.FC<{
    search: string; onSearch: (v: string) => void; available: RunItem[]; onAdd: (id: string) => void;
}> = ({ search, onSearch, available, onAdd }) => (
    <View style={styles.addPanel}>
        <View style={styles.searchWrap}>
            <Search size={14} color={colors.textFaint} />
            <TextInput style={styles.searchInput} value={search} onChangeText={onSearch} placeholder="Search staff to add…" placeholderTextColor={colors.textFaint} />
        </View>
        {search.length > 0 && (
            <View style={styles.searchResults}>
                {available.slice(0, 6).map((item) => (
                    <Pressable key={item.staff_id} style={styles.searchResultRow} onPress={() => onAdd(item.staff_id)}>
                        <Text style={styles.searchResultText}>{item.staff_name}</Text>
                    </Pressable>
                ))}
                {available.length === 0 && <Text style={styles.searchNoResult}>No matching staff.</Text>}
            </View>
        )}
    </View>
);

const EmptyPanel: React.FC = () => (
    <View style={styles.emptyPanel}><Text style={styles.emptyPanelText}>Search above to add someone to this step.</Text></View>
);

const ReviewStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.reviewStatLabel}>{label}</Text>
        <Text style={styles.reviewStatValue}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    stepIndicator: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
    stepDots: { alignItems: 'center', gap: 6, paddingRight: 12 },
    stepDotWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvasAlt },
    stepDotActive: { backgroundColor: colors.blue },
    stepDotText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint },
    stepDotTextActive: { color: '#FFFFFF' },
    stepLine: { width: 16, height: 1, backgroundColor: colors.border },
    stepLineActive: { backgroundColor: colors.blue },
    stepCount: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, textAlign: 'center' },
    scroll: { padding: 20, gap: 12, paddingBottom: 32 },
    stepTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border },
    row2: { flexDirection: 'row', gap: 10 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted, marginBottom: 6 },
    spaced: { marginTop: 14 },
    hint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 12, lineHeight: 15 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    taxPill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    taxPillText: { fontFamily: fonts.bodyBold, fontSize: 10 },
    addPanel: { gap: 4 },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    searchResults: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    searchResultRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    searchResultText: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
    searchNoResult: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, padding: 12 },
    emptyPanel: { paddingVertical: 24, alignItems: 'center' },
    emptyPanelText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    memberCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 },
    memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    memberName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    reviewSummary: {
        flexDirection: 'row', backgroundColor: colors.tabActiveBg, borderRadius: radius.lg, padding: 14,
        borderWidth: 1, borderColor: 'rgba(0,106,255,0.15)',
    },
    reviewStatLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.blue, textTransform: 'uppercase' },
    reviewStatValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy, marginTop: 3 },
    reviewCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
    reviewCardTop: { flexDirection: 'row', justifyContent: 'space-between' },
    reviewNet: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy },
    reviewMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 3 },
    footer: {
        flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 12,
        backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    },
    backBtn: { paddingHorizontal: 20, paddingVertical: 15, borderRadius: radius.md, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted },
    nextBtn: { flex: 1, backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    nextBtnDisabled: { opacity: 0.5 },
    nextBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
