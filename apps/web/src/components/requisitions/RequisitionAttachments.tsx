import React, { useState } from 'react';
import { Requisition, requisitionService } from '../../services/requisition.service';
import { Lock, FileDown } from 'lucide-react';
import RequisitionDocumentPreview from './RequisitionDocumentPreview';

interface RequisitionAttachmentsProps {
    requisition: Requisition;
}

const RequisitionAttachments: React.FC<RequisitionAttachmentsProps> = ({ requisition }) => {
    const [previewDoc, setPreviewDoc] = useState<{ type: string; title: string } | null>(null);

    const status = requisition.status || 'DRAFT';

    const docs = [
        {
            id: 'pr_form',
            title: 'Purchase Requisition Signed and Authorized',
            isAvailable: !['DRAFT', 'PENDING_APPROVAL'].includes(status),
            isCompleted: !['DRAFT', 'PENDING_APPROVAL'].includes(status),
        },
        {
            id: 'pop_proof',
            title: `Cash Officially disbursed${requisition.disbursements?.length ? ' by ' + (requisition.disbursements[0].processed_by_name || 'Finance') : ''}`,
            isAvailable: !['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED'].includes(status),
            isCompleted: !['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED'].includes(status),
        },
        {
            id: 'expense_summary',
            title: 'Transactions Have been expensed with receipts',
            isAvailable: !['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'DISBURSED', 'EXPENSED'].includes(status),
            isCompleted: !['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'DISBURSED', 'EXPENSED'].includes(status),
        },
        {
            id: 'accounting_treatment',
            title: 'Transactions Classified according to IFRSs',
            isAvailable: !['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'DISBURSED', 'EXPENSED', 'RECEIVED', 'CATEGORIZING'].includes(status),
            isCompleted: ['CATEGORIZED', 'ACCOUNTED', 'COMPLETED'].includes(status),
        },
        {
            id: 'qb_sync',
            title: 'Successfully logged in QuickBooks Accounting',
            isAvailable: status === 'ACCOUNTED' || status === 'COMPLETED',
            isCompleted: status === 'ACCOUNTED' || status === 'COMPLETED',
        }
    ];

    // Icon column width is fixed at 28px on mobile, 32px on desktop.
    // The connector line is centred in this column.
    const ICON_SIZE_MD = 32; // desktop
    const ICON_SIZE_SM = 28; // mobile
    const ICON_HALF_SM = ICON_SIZE_SM / 2;
    const ICON_HALF_MD = ICON_SIZE_MD / 2;

    return (
        <div className="flex-1 overflow-y-auto bg-[#E6F2FE] p-4 sm:p-6 md:p-8">
            <div className="max-w-3xl mx-auto">

                {/* ── Section header ─────────────────────────────────────── */}
                <div className="flex items-start justify-between mb-5 md:mb-6 animate-in fade-in duration-300 gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base md:text-xl font-black text-gray-900 tracking-tight">Audit Trail</h3>
                        <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                            System Generated Documents
                        </p>
                    </div>
                    {docs.some(d => d.isAvailable) && (
                        <button
                            onClick={() => setPreviewDoc({ type: 'all', title: 'Complete Audit Trail' })}
                            className="flex-shrink-0 h-9 md:h-11 px-4 md:px-6 bg-[#006AFF] hover:bg-[#0052cc] text-white rounded-full text-xs md:text-sm font-bold shadow-xl shadow-blue-500/20 transition-all flex items-center gap-1.5"
                        >
                            <FileDown size={14} className="md:w-[18px] md:h-[18px]" />
                            <span className="whitespace-nowrap">Combine to PDF</span>
                        </button>
                    )}
                </div>

                {/* ── Timeline card ───────────────────────────────────────── */}
                <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-gray-100 px-4 py-5 sm:px-6 sm:py-6 md:px-10 md:py-10">
                    {docs.map((doc, index) => {
                        const isLast = index === docs.length - 1;

                        return (
                            <div key={doc.id} className="relative flex items-start">

                                {/* ── Left column: icon + vertical connector ── */}
                                <div
                                    className="relative flex flex-col items-center self-stretch flex-shrink-0 mr-3 md:mr-8"
                                    style={{ width: ICON_SIZE_SM }}
                                >
                                    {/* Icon — smaller on mobile */}
                                    <div
                                        className="relative z-10 flex-shrink-0"
                                        style={{ width: ICON_SIZE_SM, height: ICON_SIZE_SM }}
                                    >
                                        {doc.isCompleted ? (
                                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-blue-100 border border-[#006AFF] flex items-center justify-center">
                                                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="#006AFF" strokeWidth={3} viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        ) : !doc.isAvailable ? (
                                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-gray-200" />
                                            </div>
                                        ) : (
                                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-white border-2 border-[#006AFF] flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[#006AFF]" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Vertical connector — gap of 6px top & bottom */}
                                    {!isLast && (
                                        <div
                                            className="absolute bg-gray-200"
                                            style={{
                                                width: 2,
                                                top: ICON_SIZE_SM + 6,
                                                bottom: -6,
                                                left: ICON_HALF_SM - 1,
                                            }}
                                        />
                                    )}
                                </div>

                                {/* ── Right column: title + actions ─────────── */}
                                <div
                                    className={`flex flex-1 flex-col sm:flex-row sm:items-center sm:justify-between min-w-0 transition-opacity duration-300 ${
                                        !doc.isAvailable ? 'opacity-40' : 'opacity-100'
                                    } ${isLast ? 'pb-1' : 'pb-9 md:pb-14'} pt-1`}
                                >
                                    <h4 className={`text-[12px] sm:text-[13px] md:text-[15px] font-semibold tracking-tight leading-snug ${
                                        doc.isAvailable ? 'text-gray-900' : 'text-gray-400'
                                    }`}>
                                        {doc.title}
                                    </h4>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-2 sm:mt-0 sm:ml-4">
                                        {doc.isAvailable ? (
                                            <>
                                                <button
                                                    onClick={() => setPreviewDoc({ type: doc.id, title: doc.title })}
                                                    className="h-7 px-3 rounded-full bg-[#F2F2F5] text-gray-800 text-[11px] md:text-[13px] font-semibold hover:bg-gray-200 transition-all md:h-9 md:px-5"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    onClick={() => setPreviewDoc({ type: doc.id, title: doc.title })}
                                                    className="h-7 px-3 rounded-full bg-[#F2F2F5] text-gray-800 text-[11px] md:text-[13px] font-semibold hover:bg-gray-200 transition-all md:h-9 md:px-5"
                                                >
                                                    Download
                                                </button>
                                            </>
                                        ) : (
                                            <div className="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center text-gray-300">
                                                <Lock size={12} className="md:w-[15px] md:h-[15px]" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Document Preview Portal ─────────────────────────────────── */}
            {previewDoc && (
                <RequisitionDocumentPreview
                    type={previewDoc.type}
                    title={previewDoc.title}
                    requisition={requisition}
                    onClose={() => setPreviewDoc(null)}
                />
            )}

            {/* ── Expense Receipts ────────────────────────────────────────── */}
            {requisition.receipts && requisition.receipts.length > 0 && (
                <div className="max-w-3xl mx-auto mt-8 md:mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-5 md:mb-6">
                        <div>
                            <h3 className="text-base md:text-xl font-black text-gray-900 tracking-tight">Expense Receipts</h3>
                            <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                Uploaded during expensing
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-6">
                        {requisition.receipts.map((receipt: any, idx: number) => {
                            const publicUrl = requisitionService.getFileUrl(receipt.file_url);
                            return (
                                <div
                                    key={receipt.id}
                                    className="group relative bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
                                >
                                    <div className="aspect-[3/4] overflow-hidden bg-gray-50">
                                        <img
                                            src={publicUrl || ''}
                                            alt={`Receipt ${idx + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                            <a
                                                href={publicUrl || ''}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white hover:text-gray-900 transition-all"
                                            >
                                                <FileDown size={16} />
                                            </a>
                                        </div>
                                    </div>
                                    <div className="p-3 md:p-4 bg-white">
                                        <p className="text-[11px] md:text-[12px] font-bold text-gray-900 truncate">Receipt #{idx + 1}</p>
                                        <p className="text-[9px] md:text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">
                                            {new Date(receipt.uploaded_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RequisitionAttachments;
