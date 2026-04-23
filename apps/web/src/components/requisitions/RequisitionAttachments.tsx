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

    // Icon size constant - 32px circle
    const ICON_SIZE = 32;
    const ICON_HALF = ICON_SIZE / 2;

    return (
        <div className="flex-1 overflow-y-auto bg-[#E6F2FE] p-8">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between xl:-mr-12 mb-6 animate-in fade-in duration-300">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Audit Trail</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">System Generated Documents</p>
                    </div>
                    {docs.some(d => d.isAvailable) && (
                        <button
                            onClick={() => setPreviewDoc({ type: 'all', title: 'Complete Audit Trail' })}
                            className="h-11 px-6 bg-[#006AFF] hover:bg-[#0052cc] text-white rounded-full text-sm font-bold shadow-xl shadow-blue-500/20 transition-all flex items-center space-x-2"
                        >
                            <FileDown size={18} />
                            <span>Combine to PDF</span>
                        </button>
                    )}
                </div>

                <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-gray-100 px-10 py-10">
                    {docs.map((doc, index) => (
                        <div key={doc.id} className="relative flex items-center">
                            {/* Left column: icon + vertical line */}
                            <div className="relative flex flex-col items-center self-stretch mr-8" style={{ width: ICON_SIZE }}>
                                {/* Icon */}
                                <div className="relative z-10" style={{ width: ICON_SIZE, height: ICON_SIZE, flexShrink: 0 }}>
                                    {doc.isCompleted ? (
                                        <div className="w-8 h-8 rounded-full bg-blue-100 border border-[#006AFF] flex items-center justify-center">
                                            <svg className="w-4 h-4" fill="none" stroke="#006AFF" strokeWidth={3} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    ) : !doc.isAvailable ? (
                                        <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-gray-200" />
                                        </div>
                                    ) : (
                                        /* Active/Current stage */
                                        <div className="w-8 h-8 rounded-full bg-white border-2 border-[#006AFF] flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-[#006AFF]" />
                                        </div>
                                    )}
                                </div>

                                {/* Vertical connector line (skip 8px gap top and bottom) */}
                                {index < docs.length - 1 && (
                                    <div
                                        className="absolute bg-gray-200"
                                        style={{
                                            width: 2,
                                            top: ICON_SIZE + 8,
                                            bottom: -8,
                                            left: ICON_HALF - 1,
                                        }}
                                    />
                                )}
                            </div>

                            {/* Right column: title + actions */}
                            <div
                                className={`flex flex-1 items-center justify-between transition-opacity duration-300 ${
                                    !doc.isAvailable ? 'opacity-40' : 'opacity-100'
                                }`}
                                style={{ paddingTop: 4, paddingBottom: index < docs.length - 1 ? 56 : 4 }}
                            >
                                <h4 className={`text-[16px] font-normal md:font-semibold tracking-tight leading-snug ${
                                    doc.isAvailable ? 'text-gray-900' : 'text-gray-400'
                                }`}>
                                    {doc.title}
                                </h4>

                                {/* Actions */}
                                <div className="flex items-center space-x-2 shrink-0 ml-6">
                                    {doc.isAvailable ? (
                                        <>
                                            <button
                                                onClick={() => setPreviewDoc({ type: doc.id, title: doc.title })}
                                                className="h-9 px-5 rounded-full bg-[#F2F2F5] text-gray-800 text-[13px] font-semibold hover:bg-gray-200 transition-all"
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() => setPreviewDoc({ type: doc.id, title: doc.title })}
                                                className="h-9 px-5 rounded-full bg-[#F2F2F5] text-gray-800 text-[13px] font-semibold hover:bg-gray-200 transition-all"
                                            >
                                                Download
                                            </button>
                                        </>
                                    ) : (
                                        <div className="w-9 h-9 flex items-center justify-center text-gray-300">
                                            <Lock size={15} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Document Preview Portal */}
            {previewDoc && (
                <RequisitionDocumentPreview
                    type={previewDoc.type}
                    title={previewDoc.title}
                    requisition={requisition}
                    onClose={() => setPreviewDoc(null)}
                />
            )}

            {/* Expense Receipts Section */}
            {requisition.receipts && requisition.receipts.length > 0 && (
                <div className="max-w-3xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Expense Receipts</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Uploaded during expensing</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                        {requisition.receipts.map((receipt: any, idx: number) => {
                            const publicUrl = requisitionService.getFileUrl(receipt.file_url);
                            return (
                                <div key={receipt.id} className="group relative bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300">
                                    <div className="aspect-[3/4] overflow-hidden bg-gray-50">
                                        <img 
                                            src={publicUrl || ''} 
                                            alt={`Receipt ${idx + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-2">
                                            <a 
                                                href={publicUrl || ''} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white hover:text-gray-900 transition-all"
                                            >
                                                <FileDown size={18} />
                                            </a>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white">
                                        <p className="text-[12px] font-bold text-gray-900 truncate">Receipt #{idx + 1}</p>
                                        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
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
