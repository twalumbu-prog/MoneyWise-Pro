import React, { useState } from 'react';
import RequisitionProgress from './RequisitionProgress';
import RequisitionChat from './RequisitionChat';
import { Requisition } from '../../services/requisition.service';
import { useAuth } from '../../context/AuthContext';
import RequisitionAttachments from './RequisitionAttachments';
import { AuditScoreBreakdown } from '../AuditScoreBreakdown';
import { AlertCircle } from 'lucide-react';

interface RequisitionModalProps {
    requisition: Requisition | null;
    isOpen: boolean;
    onClose: () => void;
    onStatusChange?: () => void;
}

// Expand icon (Notion-style: arrows pointing out)
const ExpandIcon = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M1.5 1.5H5.5M1.5 1.5V5.5M1.5 1.5L5.5 5.5M13.5 1.5H9.5M13.5 1.5V5.5M13.5 1.5L9.5 5.5M1.5 13.5H5.5M1.5 13.5V9.5M1.5 13.5L5.5 9.5M13.5 13.5H9.5M13.5 13.5V9.5M13.5 13.5L9.5 9.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

// Collapse icon (arrows pointing in)
const CollapseIcon = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M5.5 1.5V5.5H1.5M5.5 5.5L1.5 1.5M9.5 1.5V5.5H13.5M9.5 5.5L13.5 1.5M5.5 13.5V9.5H1.5M5.5 9.5L1.5 13.5M9.5 13.5V9.5H13.5M9.5 9.5L13.5 13.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const RequisitionModal: React.FC<RequisitionModalProps> = ({
    requisition,
    isOpen,
    onClose,
    onStatusChange
}) => {
    const [activeTab, setActiveTab] = useState<'chat' | 'attachments' | 'audit'>('chat');
    const [isExpanded, setIsExpanded] = useState(false);
    const { userRole } = useAuth();

    if (!isOpen || !requisition) return null;

    const canAction = userRole === 'ACCOUNTANT' || userRole === 'ADMIN' || userRole === 'MANAGER';

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${isExpanded ? 'p-0' : 'p-0 md:p-10'}`}>
            {/* Backdrop — sits behind the card, closes modal on click */}
            <div
                className={`absolute inset-0 bg-black/30 backdrop-blur-md ${isExpanded ? 'hidden' : ''}`}
                onClick={onClose}
            />

            {/* Modal Content — relative so it sits above the backdrop */}
            <div
                className={`relative bg-white shadow-2xl flex flex-col transition-all duration-300 ease-in-out ${
                    isExpanded
                        ? 'w-full h-full rounded-none'
                        : 'w-full h-full md:max-w-4xl md:h-full md:max-h-[850px] rounded-none md:rounded-3xl'
                }`}
            >
                {/* Header */}
                <div className="px-6 md:px-8 py-4 md:py-3 border-b border-gray-100 flex items-center md:items-start justify-between bg-white flex-shrink-0">
                    {/* Mobile: X on Left | Desktop: Info on Left */}
                    <div className="flex items-center flex-1">
                        <button
                            onClick={onClose}
                            className="md:hidden p-1 mr-4 hover:bg-gray-100 rounded-full transition-colors group"
                        >
                            <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div>
                            <h2 className="text-base md:text-lg font-normal md:font-bold text-gray-900 tracking-tight leading-tight md:leading-none mb-0.5 md:mb-1">
                                {requisition.description}
                            </h2>
                            <div className="flex items-center space-x-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    PR No. REQ-{requisition.id.slice(0, 8).toUpperCase()}
                                </span>
                                <span className="hidden md:inline w-1 h-1 bg-gray-300 rounded-full" />
                                <span className="hidden md:inline text-[10px] font-medium text-gray-500">
                                    Requested by {requisition.requestor_name || 'System User'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons: Expand + Close (Desktop Only) */}
                    <div className="hidden md:flex items-center space-x-1">
                        <button
                            onClick={() => setIsExpanded(prev => !prev)}
                            title={isExpanded ? 'Collapse view' : 'Expand to full page'}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            {isExpanded ? (
                                <span className="text-gray-400 group-hover:text-gray-700 flex items-center scale-90">
                                    <CollapseIcon />
                                </span>
                            ) : (
                                <span className="text-gray-400 group-hover:text-gray-700 flex items-center scale-90">
                                    <ExpandIcon />
                                </span>
                            )}
                        </button>

                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors group"
                        >
                            <svg className="w-5 h-5 text-gray-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Mobile More Button */}
                    <div className="md:hidden">
                        <button className="p-1 hover:bg-gray-100 rounded-full">
                            <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Progress Tracking */}
                <RequisitionProgress currentStatus={requisition.status} userRole={userRole || undefined} />

                {/* Tabs Switcher */}
                <div className="bg-white px-6 md:px-8 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="bg-gray-100/80 p-1 md:p-0 md:bg-transparent rounded-full md:rounded-none flex items-center md:border-b-0">
                        <button
                            onClick={() => setActiveTab('chat')}
                            className={`flex-1 md:flex-none px-6 py-2.5 text-[11px] md:text-[10px] font-bold uppercase tracking-widest transition-all relative rounded-full md:rounded-none ${
                                activeTab === 'chat'
                                    ? 'bg-white md:bg-transparent text-gray-900 md:text-[#006AFF] shadow-sm md:shadow-none'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Chat History
                            <div className={`hidden md:block absolute bottom-0 left-0 right-0 h-[2px] bg-[#006AFF] transition-opacity ${activeTab === 'chat' ? 'opacity-100' : 'opacity-0'}`} />
                        </button>
                        <button
                            onClick={() => setActiveTab('attachments')}
                            className={`flex-1 md:flex-none px-6 py-2.5 text-[11px] md:text-[10px] font-bold uppercase tracking-widest transition-all relative rounded-full md:rounded-none ${
                                activeTab === 'attachments'
                                    ? 'bg-white md:bg-transparent text-gray-900 md:text-[#006AFF] shadow-sm md:shadow-none'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Attachments
                            <div className={`hidden md:block absolute bottom-0 left-0 right-0 h-[2px] bg-[#006AFF] transition-opacity ${activeTab === 'attachments' ? 'opacity-100' : 'opacity-0'}`} />
                        </button>
                        <button
                            onClick={() => setActiveTab('audit')}
                            className={`flex-1 md:flex-none px-6 py-2.5 text-[11px] md:text-[10px] font-bold uppercase tracking-widest transition-all relative rounded-full md:rounded-none ${
                                activeTab === 'audit'
                                    ? 'bg-white md:bg-transparent text-gray-900 md:text-[#006AFF] shadow-sm md:shadow-none'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Audit Score
                            {requisition.audit_score !== undefined && requisition.audit_score !== null && (
                                <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                                    requisition.audit_score >= 85 ? 'bg-emerald-100 text-emerald-700' :
                                    requisition.audit_score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                }`}>
                                    {Math.round(requisition.audit_score)}%
                                </span>
                            )}
                            <div className={`hidden md:block absolute bottom-0 left-0 right-0 h-[2px] bg-[#006AFF] transition-opacity ${activeTab === 'audit' ? 'opacity-100' : 'opacity-0'}`} />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-[#E6F2FE]">
                    {activeTab === 'chat' ? (
                        <RequisitionChat
                            requisition={requisition}
                            canAction={canAction}
                            onStatusChange={onStatusChange}
                        />
                    ) : activeTab === 'attachments' ? (
                        <RequisitionAttachments requisition={requisition} />
                    ) : (
                        <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-white">
                            {requisition.audit_score !== undefined && requisition.audit_score !== null ? (
                                <AuditScoreBreakdown 
                                    score={requisition.audit_score} 
                                    breakdown={requisition.audit_score_breakdown!}
                                    accountedAt={requisition.accounted_at}
                                    createdAt={requisition.created_at}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-24 text-center">
                                    <div className="p-6 bg-gray-50 rounded-[2rem] mb-6">
                                        <AlertCircle className="h-10 w-10 text-gray-300" />
                                    </div>
                                    <h3 className="text-xl font-black text-brand-navy">Score Not Yet Calculated</h3>
                                    <p className="text-gray-500 max-w-xs mt-3 font-medium">
                                        Audit scores are calculated automatically once the transaction is finalized and posted to QuickBooks.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RequisitionModal;
