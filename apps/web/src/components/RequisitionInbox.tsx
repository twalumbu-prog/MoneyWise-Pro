import React from 'react';
import { Search, Check, Clock, AlertCircle, CheckCircle2, RotateCcw, MoreVertical } from 'lucide-react';
import { getStatusConfig } from '../services/requisition.service';

interface Requisition {
    id: string;
    description: string;
    estimated_total: number;
    status: string;
    created_at: string;
    requestor_name?: string;
    department?: string;
    type?: string;
    has_unread_updates?: boolean;
}

interface RequisitionInboxProps {
    requisitions: Requisition[];
    onRowClick: (id: string) => void;
}



export const RequisitionInbox: React.FC<RequisitionInboxProps> = ({ requisitions, onRowClick }) => {

    const getStatusIcon = (status: string) => {
        const config = getStatusConfig(status);
        switch (config.iconType) {
            case 'clock': return <Clock size={16} className="text-blue-500" />;
            case 'check-circle': return <CheckCircle2 size={16} className="text-[#006AFF]" />;
            case 'check': return <Check size={16} className="text-emerald-500" />;
            case 'alert': return <AlertCircle size={16} className="text-red-500" />;
            case 'rotate': return <RotateCcw size={16} className="text-gray-400" />;
            default: return <Clock size={16} className="text-gray-400" />;
        }
    };

    const getStatusText = (status: string) => {
        return getStatusConfig(status).label;
    };

    const displayRequisitions = requisitions;

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[500px] relative z-0 isolate">
            {/* List View */}

            {/* List View */}
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-gray-50/50">
                        {displayRequisitions.map((req) => (
                            <tr 
                                key={req.id} 
                                onClick={() => onRowClick(req.id)}
                                className={`group cursor-pointer hover:bg-blue-50/30 transition-all
                                    ${req.has_unread_updates ? 'bg-transparent' : 'bg-gray-50/30'}`}
                            >
                                {/* UNREAD INDICATOR */}
                                <td className="py-6 px-8 w-4">
                                    {req.has_unread_updates && (
                                        <div className="h-2 w-2 rounded-full bg-[#006AFF] shadow-sm shadow-blue-200" />
                                    )}
                                </td>

                                {/* MAIN CONTENT: DESCRIPTION & METADATA */}
                                <td className="py-6 px-2 flex-1">
                                    <div className="flex flex-col space-y-2">
                                        <div className={`text-[15px] tracking-[ -0.01em ] ${req.has_unread_updates ? 'font-bold text-brand-navy' : 'font-normal text-gray-700'} line-clamp-1`}>
                                            {req.description}
                                        </div>
                                        <div className={`flex items-center space-x-3 text-[11px] uppercase tracking-tight ${req.has_unread_updates ? 'font-bold' : 'font-medium'}`}>
                                            {/* REQUESTOR LABEL */}
                                            <span className="text-gray-400">
                                                By {req.requestor_name || 'System User'}
                                            </span>
                                            {/* DOT DIVIDER */}
                                            <div className="h-1 w-1 rounded-full bg-gray-200" />
                                            {/* DEPARTMENT LABEL */}
                                            <span className="text-gray-300">
                                                {req.department || 'General'} Dept.
                                            </span>
                                        </div>
                                    </div>
                                </td>

                                {/* STATUS COLUMN (Independent) */}
                                <td className="py-6 px-6 w-[180px]">
                                    <div className="flex items-center bg-white px-3.5 py-1.5 rounded-full border border-gray-100 shadow-sm w-fit transition-all hover:border-gray-200 group-hover:shadow-md group-hover:shadow-blue-50/50">
                                        {getStatusIcon(req.status)}
                                        <span className="text-[10px] font-black text-brand-navy uppercase tracking-widest ml-2">
                                            {getStatusText(req.status)}
                                        </span>
                                    </div>
                                </td>

                                {/* AMOUNT & DATE */}
                                <td className="py-6 px-6 text-right w-[160px]">
                                    <div className="flex flex-col space-y-1">
                                        <div className={`text-[17px] tracking-tight ${req.has_unread_updates ? 'font-black text-brand-navy' : 'font-normal text-brand-navy'}`}>
                                            K{req.estimated_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                        <div className={`text-[11px] text-gray-400 tracking-widest leading-none ${req.has_unread_updates ? 'font-bold' : 'font-normal'}`}>
                                            {new Date(req.created_at).toLocaleDateString('en-GB')}
                                        </div>
                                    </div>
                                </td>

                                {/* OPTIONS MENU */}
                                <td className="py-6 px-6 w-[80px] text-center">
                                    <button className="p-2 text-gray-200 hover:text-gray-400 transition-colors rounded-lg hover:bg-gray-50 active:scale-95">
                                        <MoreVertical size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                {displayRequisitions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-6 border border-gray-100">
                            <Search size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-brand-navy">No messages found</h3>
                        <p className="text-gray-400 max-w-xs mx-auto text-sm font-medium mt-2">
                            Select a different filter or check back later for new requests.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
