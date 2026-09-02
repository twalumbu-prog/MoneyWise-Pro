import { useState } from 'react';
import {
    View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { payrollService, requireCapability, parseCsv, formatKwacha } from 'core';
import type { StaffAllowance, StaffDeduction } from 'core';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';

interface ImportRow {
    first_name: string;
    middle_name?: string;
    last_name: string;
    employee_number?: string;
    department?: string;
    position?: string;
    date_of_birth?: string;
    email?: string;
    phone?: string;
    basic_pay: number;
    id_type?: string;
    id_number?: string;
    napsa_number?: string;
    nhima_number?: string;
    zra_tpin?: string;
    bank_name?: string;
    bank_account_number?: string;
    mobile_money_provider?: string;
    mobile_money_number?: string;
    allowances: StaffAllowance[];
    deductions: StaffDeduction[];
    _row: number;
    _errors: string[];
}

const FIELD_ALIASES: Record<string, keyof ImportRow> = {
    'first name': 'first_name', 'firstname': 'first_name', 'first_name': 'first_name',
    'other name': 'middle_name', 'middle name': 'middle_name', 'middle_name': 'middle_name',
    'last name': 'last_name', 'lastname': 'last_name', 'last_name': 'last_name', 'surname': 'last_name',
    'employee number': 'employee_number', 'employee_number': 'employee_number', 'emp no': 'employee_number',
    'department': 'department', 'dept': 'department',
    'position': 'position', 'job title': 'position', 'role': 'position',
    'birthday': 'date_of_birth', 'dob': 'date_of_birth', 'date of birth': 'date_of_birth', 'date_of_birth': 'date_of_birth',
    'email': 'email', 'phone': 'phone', 'mobile': 'phone',
    'basic pay': 'basic_pay', 'basic_pay': 'basic_pay', 'basic salary': 'basic_pay', 'salary': 'basic_pay', 'gross pay': 'basic_pay',
    'id type': 'id_type', 'id_type': 'id_type',
    'id number': 'id_number', 'id_number': 'id_number', 'national id': 'id_number',
    'napsa number': 'napsa_number', 'napsa_number': 'napsa_number', 'napsa': 'napsa_number',
    'nhima number': 'nhima_number', 'nhima_number': 'nhima_number', 'nhima': 'nhima_number',
    'tpin': 'zra_tpin', 'zra tpin': 'zra_tpin', 'zra_tpin': 'zra_tpin',
    'bank name': 'bank_name', 'bank_name': 'bank_name', 'bank': 'bank_name',
    'bank account': 'bank_account_number', 'bank account number': 'bank_account_number',
    'bank_account_number': 'bank_account_number', 'account number': 'bank_account_number',
    'mobile money provider': 'mobile_money_provider', 'mobile_money_provider': 'mobile_money_provider', 'network': 'mobile_money_provider',
    'mobile money number': 'mobile_money_number', 'mobile_money_number': 'mobile_money_number', 'mobile money': 'mobile_money_number',
};

function parseRows(data: string[][], allowanceTypes: { name: string }[], deductionTypes: { name: string }[]): ImportRow[] {
    if (data.length < 2) return [];
    const headers = data[0].map((h) => String(h ?? '').toLowerCase().trim());
    const rows: ImportRow[] = [];

    for (let i = 1; i < data.length; i++) {
        const raw = data[i];
        if (raw.every((c) => c === null || c === undefined || c === '')) continue;

        const obj: any = { _row: i + 1, _errors: [], allowances: [], deductions: [] };
        headers.forEach((h, idx) => {
            const field = FIELD_ALIASES[h];
            const val = raw[idx];
            if (field) {
                if (field === 'basic_pay') {
                    obj[field] = parseFloat(String(val ?? '0').replace(/[^0-9.]/g, '')) || 0;
                } else {
                    obj[field] = val !== null && val !== undefined ? String(val).trim() : '';
                }
            } else {
                const confAllowance = allowanceTypes.find((a) => h === a.name.toLowerCase() || h === `${a.name.toLowerCase()} (allowance)`);
                if (confAllowance) {
                    const amt = parseFloat(String(val ?? '0').replace(/[^0-9.]/g, '')) || 0;
                    if (amt > 0) obj.allowances.push({ name: confAllowance.name, amount: amt });
                }
                const confDeduction = deductionTypes.find((d) => h === d.name.toLowerCase() || h === `${d.name.toLowerCase()} (deduction)`);
                if (confDeduction) {
                    const amt = parseFloat(String(val ?? '0').replace(/[^0-9.]/g, '')) || 0;
                    if (amt > 0) obj.deductions.push({ name: confDeduction.name, amount: amt, type: 'FIXED' });
                }
            }
        });

        if (!obj.first_name) obj._errors.push('Missing first name');
        if (!obj.last_name) obj._errors.push('Missing last name');
        if (!obj.basic_pay || obj.basic_pay <= 0) obj._errors.push('Basic pay must be > 0');

        rows.push(obj as ImportRow);
    }
    return rows;
}

type Stage = 'pick' | 'preview' | 'importing' | 'done';

/**
 * Bulk staff import. Same flexible-header CSV logic as
 * apps/web/src/components/payroll/BatchImportStaff.tsx, minus .xlsx support --
 * web parses Excel with SheetJS, which the native bundle cannot use. Every
 * spreadsheet tool can export CSV, so the mobile screen asks for that
 * (matching the same CSV-only convention as wallet/import.tsx).
 */
export default function ImportStaffScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const [stage, setStage] = useState<Stage>('pick');
    const [busy, setBusy] = useState(false);
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [importErrors, setImportErrors] = useState<string[]>([]);

    const { data: config } = useQuery({ queryKey: ['payroll-config'], queryFn: () => payrollService.getPayrollConfig() });
    const allowanceTypes = config?.allowance_types ?? [];
    const deductionTypes = config?.deduction_types ?? [];

    const validRows = rows.filter((r) => r._errors.length === 0);
    const invalidRows = rows.filter((r) => r._errors.length > 0);

    const pickAndPreview = async () => {
        setBusy(true);
        setError(null);
        try {
            const [file] = await requireCapability('files').pick({
                kind: 'document',
                accept: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text'],
            });
            if (!file) return;

            const text = await new File(file.uri).text();
            const parsed = parseRows(parseCsv(text), allowanceTypes, deductionTypes);
            if (parsed.length === 0) throw new Error('That file has no rows to import.');

            setFileName(file.name ?? 'staff_import.csv');
            setRows(parsed);
            setStage('preview');
        } catch (e: any) {
            setError(e?.message ?? 'Could not read that file.');
        } finally {
            setBusy(false);
        }
    };

    const confirmImport = async () => {
        setStage('importing');
        setProgress(0);
        const failures: string[] = [];
        let done = 0;

        for (const row of validRows) {
            try {
                await payrollService.createStaffMember({
                    first_name: row.first_name,
                    middle_name: row.middle_name || undefined,
                    last_name: row.last_name,
                    employee_number: row.employee_number || undefined,
                    department: row.department || undefined,
                    position: row.position || undefined,
                    date_of_birth: row.date_of_birth || undefined,
                    email: row.email || undefined,
                    phone: row.phone || undefined,
                    basic_pay: row.basic_pay,
                    id_type: row.id_type || undefined,
                    id_number: row.id_number || undefined,
                    napsa_number: row.napsa_number || undefined,
                    nhima_number: row.nhima_number || undefined,
                    zra_tpin: row.zra_tpin || undefined,
                    bank_name: row.bank_name || undefined,
                    bank_account_number: row.bank_account_number || undefined,
                    mobile_money_provider: row.mobile_money_provider || undefined,
                    mobile_money_number: row.mobile_money_number || undefined,
                    payment_method: row.bank_account_number ? 'BANK' : row.mobile_money_number ? 'MOBILE_MONEY' : 'WALLET',
                    allowances: row.allowances,
                    deductions: row.deductions,
                    status: 'ACTIVE',
                });
            } catch (e: any) {
                failures.push(`Row ${row._row} (${row.first_name} ${row.last_name}): ${e?.message ?? 'Unknown error'}`);
            }
            done++;
            setProgress(Math.round((done / validRows.length) * 100));
        }

        setImportErrors(failures);
        setStage('done');
        qc.invalidateQueries({ queryKey: ['payroll-staff'] });
        qc.invalidateQueries({ queryKey: ['payroll-staff-all'] });
    };

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Import Staff" />

            <ScrollView contentContainerStyle={styles.scroll}>
                {stage === 'pick' && (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.heading}>Bulk-add employees</Text>
                            <Text style={styles.blurb}>
                                Export your staff roster as CSV, then choose the file here. Column names
                                are flexible — "Basic Pay", "Salary" and "Gross Pay" all work, for example.
                            </Text>
                            <Text style={styles.note}>
                                Required columns: First Name, Last Name, Basic Pay. A column named after a
                                configured allowance or deduction (e.g. "Housing (Allowance)") is picked up
                                automatically. Excel (.xlsx) isn’t supported on mobile yet — use the web app for that.
                            </Text>
                        </View>

                        {error && (
                            <View style={styles.errorCard}>
                                <AlertTriangle size={16} color={colors.danger} />
                                <Text style={styles.errorBody}>{error}</Text>
                            </View>
                        )}

                        <Pressable style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.85 }]} onPress={pickAndPreview} disabled={busy}>
                            {busy
                                ? <ActivityIndicator color={colors.blue} />
                                : <><FileSpreadsheet size={18} color={colors.blue} /><Text style={styles.pickText}>Choose CSV file</Text></>}
                        </Pressable>
                    </>
                )}

                {(stage === 'preview' || stage === 'importing') && (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.heading}>{fileName}</Text>
                            <Text style={styles.blurb}>
                                {rows.length} rows detected · {validRows.length} valid
                                {invalidRows.length > 0 ? ` · ${invalidRows.length} with errors` : ''}
                            </Text>
                        </View>

                        {invalidRows.length > 0 && (
                            <View style={styles.warnCard}>
                                <Text style={styles.warnTitle}>{invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} will be skipped:</Text>
                                {invalidRows.slice(0, 5).map((r) => (
                                    <Text key={r._row} style={styles.warnBody}>Row {r._row}: {r._errors.join(', ')}</Text>
                                ))}
                                {invalidRows.length > 5 && <Text style={styles.warnMore}>…and {invalidRows.length - 5} more</Text>}
                            </View>
                        )}

                        {validRows.slice(0, 50).map((r) => (
                            <View key={r._row} style={styles.row}>
                                <View style={styles.rowMain}>
                                    <Text style={styles.rowName}>{r.first_name} {r.last_name}</Text>
                                    <Text style={styles.rowSub}>{[r.department, r.position].filter(Boolean).join(' · ') || '—'}</Text>
                                </View>
                                <View style={styles.rowRight}>
                                    <Text style={styles.rowAmount}>{formatKwacha(r.basic_pay)}</Text>
                                    <Text style={styles.rowMethod}>{r.bank_account_number ? 'Bank' : r.mobile_money_number ? 'Mobile' : '—'}</Text>
                                </View>
                            </View>
                        ))}
                        {validRows.length > 50 && <Text style={styles.more}>Showing first 50 of {validRows.length} valid rows</Text>}

                        {stage === 'importing' && (
                            <View style={styles.progressCard}>
                                <ActivityIndicator color={colors.blue} />
                                <Text style={styles.progressText}>Importing… {progress}%</Text>
                            </View>
                        )}
                    </>
                )}

                {stage === 'done' && (
                    <View style={styles.doneCard}>
                        {importErrors.length === 0 ? (
                            <>
                                <CheckCircle2 size={40} color={colors.positive} />
                                <Text style={styles.doneTitle}>Import complete</Text>
                                <Text style={styles.blurb}>{validRows.length} staff member{validRows.length !== 1 ? 's' : ''} added successfully.</Text>
                            </>
                        ) : (
                            <>
                                <AlertTriangle size={40} color={colors.warn} />
                                <Text style={styles.doneTitle}>Import completed with errors</Text>
                                <Text style={styles.blurb}>{validRows.length - importErrors.length} imported · {importErrors.length} failed</Text>
                                <View style={styles.warnCard}>
                                    {importErrors.map((e, i) => <Text key={i} style={styles.warnBody}>{e}</Text>)}
                                </View>
                            </>
                        )}
                    </View>
                )}
            </ScrollView>

            {stage === 'preview' && validRows.length > 0 && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                    <Pressable style={styles.submit} onPress={confirmImport}>
                        <Text style={styles.submitText}>Import {validRows.length} Staff Member{validRows.length !== 1 ? 's' : ''}</Text>
                    </Pressable>
                </View>
            )}

            {stage === 'done' && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                    <Pressable style={styles.submit} onPress={() => router.replace('/apps/payroll')}>
                        <Text style={styles.submitText}>Done</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 12, paddingBottom: 32 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 8 },
    heading: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    blurb: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    note: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
    pickBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 16, borderRadius: radius.md, minHeight: 52,
        backgroundColor: colors.tabActiveBg, borderWidth: 1, borderColor: 'rgba(0,106,255,0.25)',
    },
    pickText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    errorCard: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.surface,
        borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.danger,
    },
    errorBody: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
    warnCard: { backgroundColor: '#FDF2DF', borderRadius: radius.md, padding: 12, gap: 3 },
    warnTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.warn },
    warnBody: { fontFamily: fonts.body, fontSize: 11, color: colors.warn, lineHeight: 15 },
    warnMore: { fontFamily: fonts.body, fontSize: 11, color: colors.warn, marginTop: 2 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    rowMain: { flex: 1, gap: 2 },
    rowName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    rowSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    rowRight: { alignItems: 'flex-end', gap: 2 },
    rowAmount: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    rowMethod: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    more: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 8 },
    progressCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.border,
    },
    progressText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    doneCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 28,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 10,
    },
    doneTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    submit: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    submitText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
