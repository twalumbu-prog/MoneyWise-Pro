import React, { useState } from 'react';
import RequisitionProgress from './RequisitionProgress';
import RequisitionChat from './RequisitionChat';
import { Requisition } from '../../services/requisition.service';
import { useAuth } from '../../context/AuthContext';
import RequisitionAttachments from './RequisitionAttachments';

interface RequisitionModalProps {
    requisition: Requisition | null;
    isOpen: boolean;
    onClose: () => void;
    onStatusChange?: () => void;
}

const RequisitionModal: React.FC<RequisitionModalProps> = ({
    requisition,
    isOpen,
    onClose,
    onStatusChange
}) => {
    const [activeTab, setActiveTab] = useState<'chat' | 'attachments'>('chat');
    const { userRole } = useAuth();
    if (!isOpen || !requisition) return null;

    const canAction = userRole === 'ACCOUNTANT' || userRole === 'ADMIN' || userRole === 'MANAGER';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-white w-full max-w-4xl h-full max-h-[850px] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex items-start justify-between bg-white">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 tracking-tight leading-none mb-1">
                            {requisition.description}
                        </h2>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                REQ-{requisition.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span className="text-xs font-medium text-gray-500">
                                Requested by {requisition.requestor_name || 'System User'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                    >
                        <svg className="w-6 h-6 text-gray-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Progress Tracking */}
                <RequisitionProgress currentStatus={requisition.status} />

                {/* Tabs */}
                <div className="flex items-center px-8 border-b border-gray-100 bg-white sticky top-0 z-10">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                            activeTab === 'chat' ? 'text-[#006AFF]' : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        Chat History
                        {activeTab === 'chat' && (
                            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#006AFF]" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('attachments')}
                        className={`px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                            activeTab === 'attachments' ? 'text-[#006AFF]' : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        Attachments
                        {activeTab === 'attachments' && (
                            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#006AFF]" />
                        )}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-[#E6F2FE]">
                    {activeTab === 'chat' ? (
                        <RequisitionChat
                            requisition={requisition}
                            canAction={canAction}
                            onStatusChange={onStatusChange}
                        />
                    ) : (
                        <RequisitionAttachments requisition={requisition} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default RequisitionModal;
