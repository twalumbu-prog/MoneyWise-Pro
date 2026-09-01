import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileSpreadsheet, AlertTriangle, ArrowRight } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import { parseStatementRows, type ParsedStatementRow } from 'core';

interface ImportStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    walletId: string;
    walletName: string;
}

interface PreviewItem {
    row: ParsedStatementRow;
    status: 'NEW' | 'MATCHED' | 'DUPLICATE';
    matchId?: string;
    matchDescription?: string;
    matchDate?: string;
    reason: string;
}

const ImportStatementModal: React.FC<ImportStatementModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    walletId,
    walletName
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
    const [stage, setStage] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) validateAndSetFile(droppedFile);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) validateAndSetFile(selectedFile);
    };

    const validateAndSetFile = (file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
            setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
            return;
        }
        setFile(file);
        setError(null);
    };

    const handleParseAndPreview = async () => {
        if (!file) return;

        try {
            setLoading(true);
            setError(null);

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheet];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                    if (jsonData.length < 2) {
                        throw new Error('File is empty or missing headers');
                    }

                    // Header detection and row mapping live in `core` so the web
                    // app and the native app cannot disagree about how a statement
                    // maps onto ledger rows. XLSX is still read here, because
                    // SheetJS has no native equivalent; core takes the raw sheet.
                    const parsedRows = parseStatementRows(jsonData);

                    // Call backend preview API
                    const previewResponse = await cashbookService.previewStatementImport(walletId, parsedRows);
                    setPreviewItems(previewResponse.results);
                    setStage('preview');
                } catch (err: any) {
                    setError(err.message || 'Failed to parse file.');
                } finally {
                    setLoading(false);
                }
            };

            reader.readAsArrayBuffer(file);
        } catch (err: any) {
            setError(err.message || 'Failed to process file.');
            setLoading(false);
        }
    };

    const handleConfirmImport = async () => {
        try {
            setLoading(true);
            setStage('importing');
            await cashbookService.importStatement(walletId, previewItems);
            setStage('done');
        } catch (err: any) {
            setError(err.message || 'Import failed.');
            setStage('preview');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="bg-slate-900 px-6 py-5 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/10 rounded-xl">
                            <FileSpreadsheet className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold leading-tight">Import Bank Statement</h2>
                            <p className="text-slate-400 text-[10px]">Upload bank statement for {walletName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                        disabled={stage === 'importing'}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
                    {error && (
                        <div className="p-4 mx-6 mt-4 bg-red-50 text-red-700 text-xs rounded-xl flex items-start space-x-2.5 shrink-0">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {stage === 'upload' && (
                        <div className="flex-1 p-6 flex flex-col justify-center items-center">
                            <div
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full max-w-lg border-2 border-dashed border-gray-200 bg-white rounded-2xl p-10 text-center hover:border-[#006AFF]/40 hover:bg-[#006AFF]/5 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center space-y-4 shadow-sm"
                            >
                                <div className="p-4 bg-[#006AFF]/10 text-[#006AFF] rounded-full">
                                    <Upload className="h-8 w-8" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-800">
                                        {file ? file.name : 'Drag and drop statement file here'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Supports CSV, Excel (.xlsx, .xls) up to 20MB
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="py-2.5 px-6 bg-gray-100 text-gray-800 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all"
                                >
                                    Select File
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </div>

                            <div className="mt-8 p-4 max-w-lg w-full bg-amber-50 text-amber-800 text-xs rounded-xl flex items-start space-x-2.5 border border-amber-200/50">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                                <div>
                                    <p className="font-bold">Required Template Format:</p>
                                    <p className="mt-1 text-amber-700/90 leading-relaxed">
                                        Your statement sheet must have a header row containing these 5 columns: <strong>Date, Details (or Description), Debit, Credit, and Balance.</strong>
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end w-full max-w-lg space-x-3 shrink-0">
                                <button
                                    onClick={onClose}
                                    className="py-3 px-6 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleParseAndPreview}
                                    disabled={!file || loading}
                                    className="py-3 px-6 bg-[#006AFF] hover:bg-[#0052cc] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center space-x-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Continue to Preview</span>
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {stage === 'preview' && (
                        <div className="flex-1 p-6 flex flex-col min-h-0">
                            <div className="mb-4 flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-800">Statement Preview</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Review the transactions below. Overlaps are automatically filtered.
                                    </p>
                                </div>
                                <div className="flex space-x-3 text-[10px] font-bold">
                                    <span className="flex items-center space-x-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
                                        <span>New:</span>
                                        <span>{previewItems.filter(i => i.status === 'NEW').length}</span>
                                    </span>
                                    <span className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                                        <span>Matched:</span>
                                        <span>{previewItems.filter(i => i.status === 'MATCHED').length}</span>
                                    </span>
                                    <span className="flex items-center space-x-1.5 px-2.5 py-1 bg-gray-50 text-gray-500 rounded-full border border-gray-200">
                                        <span>Duplicate:</span>
                                        <span>{previewItems.filter(i => i.status === 'DUPLICATE').length}</span>
                                    </span>
                                </div>
                            </div>

                            {/* Table Container */}
                            <div className="flex-1 min-h-0 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                                <div className="overflow-x-auto overflow-y-auto flex-1">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-5 py-3">Status</th>
                                                <th className="px-5 py-3">Date</th>
                                                <th className="px-5 py-3">Details</th>
                                                <th className="px-5 py-3 text-right">Debit (Out)</th>
                                                <th className="px-5 py-3 text-right">Credit (In)</th>
                                                <th className="px-5 py-3 text-right">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-xs font-semibold text-gray-700">
                                            {previewItems.map((item, idx) => (
                                                <tr
                                                    key={idx}
                                                    className={`hover:bg-gray-50/50 ${
                                                        item.status === 'DUPLICATE' ? 'opacity-50 bg-gray-50/30' : ''
                                                    }`}
                                                >
                                                    <td className="px-5 py-3">
                                                        {item.status === 'DUPLICATE' && (
                                                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[9px] font-bold">
                                                                Duplicate
                                                            </span>
                                                        )}
                                                        {item.status === 'MATCHED' && (
                                                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold" title={item.reason}>
                                                                Matched
                                                            </span>
                                                        )}
                                                        {item.status === 'NEW' && (
                                                            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[9px] font-bold">
                                                                New
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 tabular-nums text-gray-600">{item.row.date}</td>
                                                    <td className="px-5 py-3 max-w-[200px] truncate" title={item.row.details}>
                                                        {item.row.details}
                                                        {item.status === 'MATCHED' && (
                                                            <div className="text-[9px] text-blue-600 font-medium mt-0.5">
                                                                Matched with: "{item.matchDescription}" on {item.matchDate}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-right tabular-nums text-red-600">
                                                        {item.row.debit > 0 ? `K${item.row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                    </td>
                                                    <td className="px-5 py-3 text-right tabular-nums text-green-600">
                                                        {item.row.credit > 0 ? `K${item.row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                    </td>
                                                    <td className="px-5 py-3 text-right tabular-nums font-bold">
                                                        K{item.row.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="mt-4 flex justify-end space-x-3 shrink-0">
                                <button
                                    onClick={() => setStage('upload')}
                                    className="py-3 px-6 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold rounded-xl transition-all"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    disabled={previewItems.every(i => i.status === 'DUPLICATE') || loading}
                                    className="py-3 px-6 bg-[#006AFF] hover:bg-[#0052cc] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center space-x-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Importing...</span>
                                        </>
                                    ) : (
                                        <span>Confirm Import ({previewItems.filter(i => i.status !== 'DUPLICATE').length} rows)</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {stage === 'done' && (
                        <div className="flex-1 p-6 flex flex-col justify-center items-center text-center">
                            <div className="p-4 bg-green-100 text-green-600 rounded-full mb-4">
                                <CheckCircle className="h-10 w-10" />
                            </div>
                            <h3 className="text-base font-bold text-gray-800">Statement Imported successfully</h3>
                            <p className="text-xs text-gray-500 mt-2 max-w-sm">
                                The new transactions have been imported into the database, and manual matches have been reconciled. Running balances have been re-calculated.
                            </p>
                            <button
                                onClick={() => {
                                    onSuccess();
                                    onClose();
                                }}
                                className="mt-6 py-3 px-8 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportStatementModal;
