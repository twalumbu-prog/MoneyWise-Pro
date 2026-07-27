import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, Clock, AlertCircle, CheckCircle2, RotateCcw, MoreVertical, Trash2 } from 'lucide-react';
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
    onDelete?: (id: string) => void;
}

export const RequisitionInbox: React.FC<RequisitionInboxProps> = ({ requisitions, onRowClick, onDelete }) => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleSelected = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getStatusIcon = (status: string) => {
        const config = getStatusConfig(status);
        switch (config.iconType) {
            case 'clock': return <Clock size={12} className="text-[#0058DB]" />;
            case 'check-circle': return <CheckCircle2 size={12} className="text-[#0058DB]" />;
            case 'check': return <Check size={12} className="text-emerald-500" />;
            case 'alert': return <AlertCircle size={12} className="text-red-500" />;
            case 'rotate': return <RotateCcw size={12} className="text-gray-400" />;
            default: return <Clock size={12} className="text-gray-400" />;
        }
    };

    const getStatusText = (status: string) => getStatusConfig(status).label;

    return (
        <div className="bg-white rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex flex-col divide-y divide-[#E8EEF8]">
                {requisitions.map((req) => (
                    <div
                        key={req.id}
                        onClick={() => onRowClick(req.id)}
                        className={`group px-3 py-3.5 flex items-center gap-4 cursor-pointer transition-colors ${
                            selected.has(req.id) ? 'bg-[#F0F7FF]' : 'hover:bg-gray-50/70'
                        }`}
                    >
                        <div className="w-5 h-4 flex-shrink-0 inline-flex justify-center items-center gap-4" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                checked={selected.has(req.id)}
                                onChange={() => toggleSelected(req.id)}
                                className="w-3.5 h-3.5 appearance-none bg-white rounded shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)] border-[0.50px] border-indigo-300 checked:bg-[#0058DB] checked:border-[#0058DB] cursor-pointer"
                            />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm truncate font-medium text-gray-700">
                                    {req.description}
                                </span>
                                <span className="text-sm whitespace-nowrap font-semibold text-[#111827]">
                                    K{req.estimated_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-px">
                                <span className="text-[10px] font-normal capitalize text-[#6B7280]">
                                    {req.requestor_name || 'System User'} · {req.department || 'General'} Dept.
                                </span>
                                <span className="text-[10px] font-normal text-neutral-500">
                                    {new Date(req.created_at).toLocaleDateString('en-GB')}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                                {getStatusIcon(req.status)}
                                <span className="text-[10px] font-normal capitalize text-[#6B7280]">
                                    {getStatusText(req.status)}
                                </span>
                            </div>
                        </div>

                        <div className="w-4 flex-shrink-0 flex items-center justify-center">
                            {req.has_unread_updates && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0058DB] shadow-sm shadow-blue-200" />
                            )}
                        </div>

                        <div className="relative flex-shrink-0">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === req.id ? null : req.id);
                                }}
                                className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors rounded-lg hover:bg-gray-100 active:scale-95 opacity-0 group-hover:opacity-100"
                            >
                                <MoreVertical size={16} />
                            </button>

                            {openMenuId === req.id && (
                                <div
                                    ref={menuRef}
                                    className="absolute right-0 mt-1 w-48 bg-white border border-[#E8EEF8] rounded-xl shadow-lg z-50 py-1"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'CHANGE_SUBMITTED'].includes(req.status) ? (
                                        <button
                                            onClick={() => {
                                                setOpenMenuId(null);
                                                if (onDelete) onDelete(req.id);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-650 hover:bg-red-50 transition-colors flex items-center"
                                        >
                                            <Trash2 size={14} className="mr-2 text-red-500" />
                                            Delete Requisition
                                        </button>
                                    ) : (
                                        <div className="px-4 py-2 text-xs text-gray-400 font-medium text-left">
                                            No actions available
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {requisitions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-6 border border-[#E8EEF8]">
                        <Search size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-brand-navy">No messages found</h3>
                    <p className="text-gray-400 max-w-xs mx-auto text-sm font-medium mt-2">
                        Select a different filter or check back later for new requests.
                    </p>
                </div>
            )}
        </div>
    );
};
