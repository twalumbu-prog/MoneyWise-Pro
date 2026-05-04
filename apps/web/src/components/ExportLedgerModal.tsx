import React, { useState } from 'react';
import { Download, FileText, FileSpreadsheet, File } from 'lucide-react';
import { Modal } from './Modal';

interface ExportLedgerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (format: 'csv' | 'xlsx' | 'pdf', startDate: string, endDate: string) => void;
    defaultStartDate?: string;
    defaultEndDate?: string;
}

const ExportLedgerModal: React.FC<ExportLedgerModalProps> = ({
    isOpen,
    onClose,
    onExport,
    defaultStartDate,
    defaultEndDate
}) => {
    // Default to last 30 days if no defaults provided
    const [startDate, setStartDate] = useState(
        defaultStartDate || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        defaultEndDate || new Date().toISOString().split('T')[0]
    );
    const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('xlsx');

    const handleExport = () => {
        onExport(format, startDate, endDate);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Cash Ledger">
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-widest">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-brand-navy focus:border-transparent transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-widest">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-brand-navy focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-widest">Export Format</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                            onClick={() => setFormat('csv')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                format === 'csv'
                                    ? 'border-[#006AFF] bg-blue-50/50 text-[#006AFF]'
                                    : 'border-gray-100 hover:border-gray-200 text-gray-500'
                            }`}
                        >
                            <FileText size={24} className="mb-2" strokeWidth={2} />
                            <span className="text-xs font-bold uppercase tracking-widest">CSV</span>
                        </button>
                        <button
                            onClick={() => setFormat('xlsx')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                format === 'xlsx'
                                    ? 'border-[#006AFF] bg-blue-50/50 text-[#006AFF]'
                                    : 'border-gray-100 hover:border-gray-200 text-gray-500'
                            }`}
                        >
                            <FileSpreadsheet size={24} className="mb-2" strokeWidth={2} />
                            <span className="text-xs font-bold uppercase tracking-widest">Excel</span>
                        </button>
                        <button
                            onClick={() => setFormat('pdf')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                format === 'pdf'
                                    ? 'border-[#006AFF] bg-blue-50/50 text-[#006AFF]'
                                    : 'border-gray-100 hover:border-gray-200 text-gray-500'
                            }`}
                        >
                            <File size={24} className="mb-2" strokeWidth={2} />
                            <span className="text-xs font-bold uppercase tracking-widest">PDF</span>
                        </button>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all uppercase tracking-widest"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex-[2] flex items-center justify-center px-4 py-3 bg-brand-navy hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-[0.98] uppercase tracking-widest"
                    >
                        <Download size={16} className="mr-2" strokeWidth={2.5} />
                        Export Ledger
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ExportLedgerModal;
