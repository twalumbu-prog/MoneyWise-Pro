import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { CashbookEntry } from '../../services/cashbook.service';
import { CashDepositProof } from './CashDepositProof';

interface DepositProofPreviewProps {
    entry: CashbookEntry;
    onClose: () => void;
}

const DepositProofPreview: React.FC<DepositProofPreviewProps> = ({ entry, onClose }) => {
    const handlePrint = () => window.print();

    const modalContent = (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 md:p-6 lg:p-10 print:block print:relative print:inset-auto print:p-0">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Preview Container */}
            <div className="relative bg-[#F5F5F7] w-full sm:max-w-2xl h-[96vh] sm:h-full sm:max-h-[95vh] rounded-t-3xl sm:rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-400 border border-white/20 print:h-auto print:max-h-none print:overflow-visible print:border-none print:shadow-none print:bg-white print:rounded-none print:block">

                {/* ── Floating Header ──────────────────────────────────── */}
                <div className="absolute top-3 sm:top-6 left-3 right-3 sm:left-6 sm:right-6 z-20 flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-white/85 backdrop-blur-md rounded-xl sm:rounded-2xl border border-white shadow-lg shadow-black/5 print:hidden">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#006AFF] flex items-center justify-center text-white shadow-lg shadow-blue-200 flex-shrink-0">
                           <Printer size={16} className="sm:hidden" />
                           <Printer size={20} className="hidden sm:block" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xs sm:text-sm font-black text-gray-900 leading-none truncate">Proof of Deposit</h2>
                            <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 hidden xs:block">Document Preview</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={handlePrint}
                            className="h-8 sm:h-10 px-3 sm:px-5 bg-[#006AFF] text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-1.5 sm:gap-2"
                        >
                            <Printer size={13} className="sm:hidden" />
                            <Printer size={15} className="hidden sm:block" />
                            <span className="hidden sm:inline">Print / Save PDF</span>
                            <span className="sm:hidden">Print</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 sm:w-10 sm:h-10 bg-white text-gray-400 hover:text-gray-900 rounded-lg sm:rounded-xl transition-all flex items-center justify-center border border-gray-100 flex-shrink-0"
                        >
                            <X size={16} className="sm:hidden" />
                            <X size={20} className="hidden sm:block" />
                        </button>
                    </div>
                </div>

                {/* ── Main Scrollable Content ───────────────────────────── */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-8 md:px-12 pt-20 sm:pt-28 md:pt-32 pb-6 sm:pb-12 md:pb-20 no-scrollbar print:overflow-visible print:h-auto print:flex-none print:p-0 print:block">
                    <div className="mx-auto max-w-[850px] shadow-xl md:shadow-2xl shadow-black/8 md:shadow-black/10 rounded-sm bg-white overflow-hidden ring-1 ring-gray-900/5 print:shadow-none print:w-full print:ring-0">
                        <div className="print-page">
                            <CashDepositProof entry={entry} />
                        </div>
                    </div>
                </div>

                <div className="hidden sm:flex absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-400 bg-white/40 backdrop-blur px-4 py-2 rounded-full border border-white/40 print:hidden">
                    MoneyWise-Pro Document Management System
                </div>
            </div>

            {/* Print styles */}
            <style>{`
                @media print {
                    @page { size: auto; margin: 0.5cm; }
                    body, html { height: max-content !important; overflow: visible !important; background: white !important; }
                    #root { display: none !important; }
                    body * { visibility: hidden; }
                    .fixed.inset-0.z-\\[70\\] {
                        position: absolute !important; left: 0 !important; top: 0 !important;
                        padding: 0 !important; margin: 0 !important; height: auto !important;
                        width: 100% !important; background: none !important;
                        backdrop-filter: none !important; display: block !important; overflow: visible !important;
                    }
                    .fixed.inset-0.z-\\[70\\] *, .print-override * { visibility: visible !important; }
                    .print-page { page-break-after: always; }
                    .print-page:last-child { page-break-after: auto; }
                    .printable-document { box-shadow: none !important; border: none !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 1cm !important; }
                    .absolute { display: none !important; }
                    .shadow-2xl, .shadow-xl { box-shadow: none !important; }
                }
            `}</style>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default DepositProofPreview;
