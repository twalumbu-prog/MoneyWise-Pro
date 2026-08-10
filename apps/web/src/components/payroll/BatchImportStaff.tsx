import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileSpreadsheet, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { payrollService, StaffAllowance, StaffDeduction } from '../../services/payroll.service';
import { useAuth } from '../../context/AuthContext';

export interface ImportRow {
    first_name: string;
    middle_name?: string;
    date_of_birth?: string;
    last_name: string;
    employee_number?: string;
    department?: string;
    position?: string;
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
    'first name': 'first_name',
    'firstname': 'first_name',
    'first_name': 'first_name',
    'other name': 'middle_name',
    'middle name': 'middle_name',
    'middle_name': 'middle_name',
    'last name': 'last_name',
    'lastname': 'last_name',
    'last_name': 'last_name',
    'surname': 'last_name',
    'employee number': 'employee_number',
    'employee_number': 'employee_number',
    'emp no': 'employee_number',
    'department': 'department',
    'dept': 'department',
    'position': 'position',
    'job title': 'position',
    'role': 'position',
    'birthday': 'date_of_birth',
    'dob': 'date_of_birth',
    'date of birth': 'date_of_birth',
    'date_of_birth': 'date_of_birth',
    'email': 'email',
    'phone': 'phone',
    'mobile': 'phone',
    'basic pay': 'basic_pay',
    'basic_pay': 'basic_pay',
    'basic salary': 'basic_pay',
    'salary': 'basic_pay',
    'gross pay': 'basic_pay',
    'id type': 'id_type',
    'id_type': 'id_type',
    'id number': 'id_number',
    'id_number': 'id_number',
    'national id': 'id_number',
    'napsa number': 'napsa_number',
    'napsa_number': 'napsa_number',
    'napsa': 'napsa_number',
    'nhima number': 'nhima_number',
    'nhima_number': 'nhima_number',
    'nhima': 'nhima_number',
    'tpin': 'zra_tpin',
    'zra tpin': 'zra_tpin',
    'zra_tpin': 'zra_tpin',
    'bank name': 'bank_name',
    'bank_name': 'bank_name',
    'bank': 'bank_name',
    'bank account': 'bank_account_number',
    'bank account number': 'bank_account_number',
    'bank_account_number': 'bank_account_number',
    'account number': 'bank_account_number',
    'mobile money provider': 'mobile_money_provider',
    'mobile_money_provider': 'mobile_money_provider',
    'network': 'mobile_money_provider',
    'mobile money number': 'mobile_money_number',
    'mobile_money_number': 'mobile_money_number',
    'mobile money': 'mobile_money_number',
};

function parseRows(data: any[][], config: any): ImportRow[] {
    if (data.length < 2) return [];
    const headers = data[0].map((h: any) => String(h ?? '').toLowerCase().trim());
    const rows: ImportRow[] = [];

    const configuredAllowances = config?.allowance_types || [];
    const configuredDeductions = config?.deduction_types || [];

    for (let i = 1; i < data.length; i++) {
        const raw = data[i];
        if (raw.every((c: any) => c === null || c === undefined || c === '')) continue;

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
                // Check if header matches a configured allowance
                const confAllowance = configuredAllowances.find((a: any) => h === a.name.toLowerCase() || h === `${a.name.toLowerCase()} (allowance)`);
                if (confAllowance) {
                    const amt = parseFloat(String(val ?? '0').replace(/[^0-9.]/g, '')) || 0;
                    if (amt > 0) obj.allowances.push({ name: confAllowance.name, amount: amt });
                }

                // Check if header matches a configured deduction
                const confDeduction = configuredDeductions.find((d: any) => h === d.name.toLowerCase() || h === `${d.name.toLowerCase()} (deduction)`);
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

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

type Stage = 'upload' | 'preview' | 'importing' | 'done';

export const BatchImportStaff: React.FC<Props> = ({ onClose, onSuccess }) => {
    const { organizationId } = useAuth();
    const [stage, setStage] = useState<Stage>('upload');
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [fileName, setFileName] = useState('');
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const { data: config } = useQuery({
        queryKey: ['payroll-config', organizationId],
        queryFn: () => payrollService.getPayrollConfig(),
        enabled: !!organizationId,
    });

    const downloadTemplate = useCallback(() => {
        const allowanceHeaders = config?.allowance_types?.map((a: any) => `${a.name} (Allowance)`) || [];
        const deductionHeaders = config?.deduction_types?.map((d: any) => `${d.name} (Deduction)`) || [];

        const headers = [
            'First Name', 'Other Name', 'Last Name', 'Employee Number', 'Department', 'Position',
            'Date of Birth', 'Email', 'Phone', 'ID Type', 'ID Number',
            'NAPSA Number', 'NHIMA Number', 'ZRA TPIN', 'Basic Pay',
            ...allowanceHeaders, ...deductionHeaders,
            'Bank Name', 'Bank Account Number', 'Mobile Money Number',
        ];
        const sample = [
            'Jane', 'Bwalya', 'Mwale', 'EMP001', 'Finance', 'Accountant',
            '1990-05-20', 'jane@example.com', '0977123456', 'NRC', '123456/10/1',
            'NAP123', 'NHI456', '1234567890', '5000',
            ...allowanceHeaders.map(() => '500'), ...deductionHeaders.map(() => '100'),
            'Zanaco', '0012345678', '0971234567',
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
        ws['!cols'] = headers.map(() => ({ wch: 20 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Staff Import');
        XLSX.writeFile(wb, 'staff_import_template.xlsx');
    }, [config]);

    const handleFile = useCallback((file: File) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target?.result, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
                const parsed = parseRows(data, config);
                setRows(parsed);
                setStage('preview');
            } catch {
                setErrors(['Could not parse the file. Please use .xlsx, .xls, or .csv format.']);
            }
        };
        reader.readAsBinaryString(file);
    }, [config]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const validRows = rows.filter(r => r._errors.length === 0);
    const invalidRows = rows.filter(r => r._errors.length > 0);

    const handleImport = async () => {
        setImporting(true);
        setStage('importing');
        const importErrors: string[] = [];
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
                    deductions: row.deductions as any,
                    status: 'ACTIVE',
                });
            } catch (err: any) {
                importErrors.push(`Row ${row._row} (${row.first_name} ${row.last_name}): ${err?.response?.data?.error || err?.message || 'Unknown error'}`);
            }
            done++;
            setProgress(Math.round((done / validRows.length) * 100));
        }

        setErrors(importErrors);
        setStage('done');
        setImporting(false);
        if (importErrors.length === 0) {
            setTimeout(onSuccess, 800);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900">Import Staff from Spreadsheet</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Supports .xlsx, .xls, and .csv files</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Upload stage */}
                    {stage === 'upload' && (
                        <div className="p-6 flex flex-col gap-5">
                            <div
                                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={onDrop}
                                onClick={() => fileRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                            >
                                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                                    <Upload size={22} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-gray-800">Drop your file here or click to browse</p>
                                    <p className="text-xs text-gray-400 mt-1">Excel (.xlsx, .xls) or CSV files</p>
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                                />
                            </div>

                            <button
                                onClick={downloadTemplate}
                                className="flex items-center gap-2 mx-auto px-4 py-2 text-xs font-semibold text-blue-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <Download size={13} />
                                Download Import Template
                            </button>

                            {errors.length > 0 && (
                                <div className="bg-red-50 rounded-xl p-4">
                                    {errors.map((err, i) => (
                                        <p key={i} className="text-xs text-red-600">{err}</p>
                                    ))}
                                </div>
                            )}

                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-xs font-semibold text-gray-700 mb-2">Expected columns (flexible naming):</p>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                    {[
                                        ['First Name *', 'Last Name *'],
                                        ['Basic Pay *', 'Department'],
                                        ['Position', 'Email'],
                                        ['Phone', 'Employee Number'],
                                        ['Bank Name', 'Bank Account Number'],
                                        ['Mobile Money Number', 'NAPSA Number'],
                                    ].map(([a, b], i) => (
                                        <React.Fragment key={i}>
                                            <p className="text-[11px] text-gray-500">{a}</p>
                                            <p className="text-[11px] text-gray-500">{b}</p>
                                        </React.Fragment>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2">* Required fields</p>
                            </div>
                        </div>
                    )}

                    {/* Preview stage */}
                    {stage === 'preview' && (
                        <div className="p-6 flex flex-col gap-4">
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                                <FileSpreadsheet size={16} className="text-emerald-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{fileName}</p>
                                    <p className="text-[11px] text-gray-400">{rows.length} rows detected · {validRows.length} valid · {invalidRows.length} with errors</p>
                                </div>
                                <button onClick={() => { setStage('upload'); setRows([]); setErrors([]); }} className="text-[11px] text-blue-600 font-semibold hover:underline flex-shrink-0">Change file</button>
                            </div>

                            {invalidRows.length > 0 && (
                                <div className="bg-amber-50 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-amber-800 mb-1.5">
                                        {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} will be skipped (validation errors):
                                    </p>
                                    {invalidRows.slice(0, 5).map((r, i) => (
                                        <p key={i} className="text-[11px] text-amber-700">Row {r._row}: {r._errors.join(', ')}</p>
                                    ))}
                                    {invalidRows.length > 5 && <p className="text-[11px] text-amber-500 mt-1">…and {invalidRows.length - 5} more</p>}
                                </div>
                            )}

                            {validRows.length > 0 ? (
                                <div className="rounded-xl border border-gray-100 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[11px]">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-100">
                                                    {['Name', 'Department', 'Position', 'Basic Pay', 'Payment'].map(h => (
                                                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {validRows.slice(0, 50).map((r, i) => (
                                                    <tr key={i} className="border-b border-gray-50 last:border-0">
                                                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{r.first_name} {r.last_name}</td>
                                                        <td className="px-3 py-2 text-gray-500">{r.department || '—'}</td>
                                                        <td className="px-3 py-2 text-gray-500">{r.position || '—'}</td>
                                                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">K {r.basic_pay.toLocaleString('en-ZM', { minimumFractionDigits: 2 })}</td>
                                                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                                                            {r.bank_account_number ? 'Bank' : r.mobile_money_number ? 'Mobile' : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {validRows.length > 50 && (
                                            <p className="text-[11px] text-gray-400 text-center py-2">Showing first 50 of {validRows.length} valid rows</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-sm text-gray-400">No valid rows to import.</p>
                                    <p className="text-xs text-gray-300 mt-1">Fix the errors above and re-upload.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Importing stage */}
                    {stage === 'importing' && (
                        <div className="p-10 flex flex-col items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 animate-spin">
                                <Loader2 size={22} />
                            </div>
                            <p className="text-sm font-semibold text-gray-800">Importing staff members…</p>
                            <div className="w-full max-w-xs bg-gray-100 rounded-full h-2">
                                <div
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-400">{progress}% complete</p>
                        </div>
                    )}

                    {/* Done stage */}
                    {stage === 'done' && (
                        <div className="p-10 flex flex-col items-center gap-4">
                            {errors.length === 0 ? (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-500">
                                        <CheckCircle size={22} />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800">Import complete!</p>
                                    <p className="text-xs text-gray-400">{validRows.length} staff member{validRows.length !== 1 ? 's' : ''} added successfully.</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                                        <AlertCircle size={22} />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800">Import completed with errors</p>
                                    <p className="text-xs text-gray-500">{validRows.length - errors.length} imported · {errors.length} failed</p>
                                    <div className="w-full max-w-sm bg-red-50 rounded-xl p-3 max-h-40 overflow-y-auto">
                                        {errors.map((e, i) => <p key={i} className="text-[11px] text-red-600 mb-1">{e}</p>)}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 transition-colors">
                        {stage === 'done' ? 'Close' : 'Cancel'}
                    </button>
                    {stage === 'preview' && validRows.length > 0 && (
                        <button
                            onClick={handleImport}
                            disabled={importing}
                            className="px-5 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            Import {validRows.length} Staff Member{validRows.length !== 1 ? 's' : ''}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
