import React from 'react';
import { REQUISITION_STATUS_CONFIG } from '../../services/requisition.service';

interface RequisitionProgressProps {
    currentStatus: string;
}

const RequisitionProgress: React.FC<RequisitionProgressProps> = ({ currentStatus }) => {
    // Unique labels for the UI
    const uiSteps = [
        { label: 'Draft', statuses: ['DRAFT'] },
        { label: 'Approved', statuses: ['PENDING_APPROVAL', 'AUTHORISED'] },
        { label: 'Disbursed', statuses: ['DISBURSED'] },
        { label: 'Expensed', statuses: ['EXPENSED'] },
        { label: 'Returns', statuses: ['RECEIVED', 'CHANGE_SUBMITTED'] },
        { label: 'Complete', statuses: Object.keys(REQUISITION_STATUS_CONFIG).filter(s => REQUISITION_STATUS_CONFIG[s].isCompleted) }
    ];

    const getCurrentStepIndex = () => {
        return uiSteps.findIndex(step => step.statuses.includes(currentStatus));
    };

    const currentIndex = getCurrentStepIndex();
    const isTerminal = REQUISITION_STATUS_CONFIG[currentStatus]?.isCompleted || false;

    return (
        <div className="flex items-start w-full px-8 py-4 bg-gray-50/50 border-b border-gray-100 overflow-x-auto min-h-[100px]">
            {uiSteps.map((step, index) => {
                const isCompleted = index < currentIndex || (index === currentIndex && isTerminal);
                const isCurrent = index === currentIndex && !isTerminal;
                
                return (
                    <React.Fragment key={step.label}>
                        <div className="flex flex-col items-center min-w-[80px]">
                            <div className={`flex items-center justify-center w-8 min-w-[32px] h-8 rounded-full border-2 transition-all duration-300 z-10 ${
                                isCompleted ? 'bg-[#006AFF] border-[#006AFF] text-white' :
                                isCurrent ? 'bg-white border-[#006AFF] text-[#006AFF]' :
                                'bg-white border-gray-200 text-gray-400'
                            }`}>
                                {isCompleted ? (
                                    <svg className="w-5 h-5 text-blue-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <span className="text-sm font-semibold">{index + 1}</span>
                                ) }
                            </div>
                            <span className={`mt-3 text-[10px] font-bold uppercase tracking-widest text-center ${
                                isCurrent ? 'text-[#006AFF]' : isCompleted ? 'text-gray-900' : 'text-gray-400'
                            }`}>
                                {step.label}
                            </span>
                        </div>
                        {index < uiSteps.length - 1 && (
                            <div className={`flex-1 min-w-[40px] h-[2px] mt-[15px] -mx-8 ${
                                index < currentIndex ? 'bg-[#006AFF]' : 'bg-gray-200'
                            }`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default RequisitionProgress;
