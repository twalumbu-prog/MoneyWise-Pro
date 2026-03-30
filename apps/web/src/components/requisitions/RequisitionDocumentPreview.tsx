import React from 'react';
import { X, Printer } from 'lucide-react';
import { Requisition } from '../../services/requisition.service';
import { 
    PurchaseRequisitionForm, 
    CashDisbursalProof, 
    ExpenseVarianceForm, 
    AccountingTreatmentForm, 
    QuickBooksSyncLog 
} from './RequisitionDocumentTemplates';

interface RequisitionDocumentPreviewProps {
    type: string;
    title: string;
    requisition: Requisition;
    onClose: () => void;
}

const RequisitionDocumentPreview: React.FC<RequisitionDocumentPreviewProps> = ({ 
    type, 
    title, 
    requisition, 
    onClose 
}) => {
    
    const renderDocument = () => {
        switch (type) {
            case 'pr_form':
                return <PurchaseRequisitionForm requisition={requisition} />;
            case 'pop_proof':
                return <CashDisbursalProof requisition={requisition} />;
            case 'expense_summary':
                return <ExpenseVarianceForm requisition={requisition} />;
            case 'accounting_treatment':
                return <AccountingTreatmentForm requisition={requisition} />;
            case 'qb_sync':
                return <QuickBooksSyncLog requisition={requisition} />;
            default:
                return <div className="p-20 text-center font-bold text-gray-400">Preview not available for this document type.</div>;
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 md:p-10">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Preview Container */}
            <div className="relative bg-[#F5F5F7] w-full max-w-5xl h-full max-h-[95vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-400 border border-white/20">
                
                {/* Modern Floating Header */}
                <div className="absolute top-6 left-6 right-6 z-20 flex items-center justify-between px-6 py-3 bg-white/80 backdrop-blur-md rounded-2xl border border-white shadow-lg shadow-black/5">
                    <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-xl bg-[#006AFF] flex items-center justify-center text-white shadow-xl shadow-blue-100">
                           <Printer size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-gray-900 leading-none">{title}</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Document Preview</p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3">
                        <button 
                            onClick={handlePrint}
                            className="h-10 px-5 bg-[#006AFF] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center space-x-2"
                        >
                            <Printer size={16} />
                            <span>Print / Save PDF</span>
                        </button>
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 bg-white text-gray-400 hover:text-gray-900 rounded-xl transition-all flex items-center justify-center border border-gray-100"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Scrollable Area for Paper */}
                <div className="flex-1 overflow-y-auto p-12 pt-32 pb-20 no-scrollbar">
                    {/* Centered Paper Layout */}
                    <div className="mx-auto max-w-[850px] shadow-2xl shadow-black/10 rounded-[4px] bg-white overflow-hidden ring-1 ring-gray-900/5 print:shadow-none print:w-full print:ring-0">
                        {renderDocument()}
                    </div>
                </div>

                {/* Mobile Bottom Bar (Implicit Print Action) */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-400 bg-white/40 backdrop-blur px-4 py-2 rounded-full border border-white/40">
                    MoneyWise-Pro Document Management System
                </div>
            </div>

            {/* Print Injected Styles */}
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .fixed.inset-0.z-\\[60\\] {
                        position: absolute;
                        left: 0;
                        top: 0;
                        padding: 0;
                        margin: 0;
                        height: auto;
                        width: 100%;
                        background: none !important;
                        backdrop-filter: none !important;
                    }
                    .fixed.inset-0.z-\\[60\\] * {
                        visibility: visible;
                    }
                    .printable-document {
                        box-shadow: none !important;
                        border: none !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 1cm !important;
                    }
                    .absolute {
                        display: none !important;
                    }
                    .shadow-2xl {
                        box-shadow: none !important;
                    }
                    .rounded-\\[4px\\] {
                        border-radius: 0 !important;
                    }
                    @page {
                        size: A4;
                        margin: 0;
                    }
                }
            `}</style>
        </div>
    );
};

export default RequisitionDocumentPreview;
