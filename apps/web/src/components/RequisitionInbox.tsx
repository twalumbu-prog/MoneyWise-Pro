import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, Clock, AlertCircle, CheckCircle2, RotateCcw, MoreVertical, Trash2, Loader2 } from 'lucide-react';
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
    /** Admin only: delete every ticked request at once. Shows the bar when something is ticked. */
    onDeleteMany?: (ids: string[]) => Promise<void>;
}

export const RequisitionInbox: React.FC<RequisitionInboxProps> = ({ requisitions, onRowClick, onDelete, onDeleteMany }) => {
    const [deleting, setDeleting] = useState(false);
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

    // A ticked request that has left the list (deleted, filtered out) is no longer ticked.
    useEffect(() => {
        setSelected((prev) => {
            const here = new Set(requisitions.map((r) => r.id));
            const next = new Set([...prev].filter((id) => here.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [requisitions]);

    const deleteSelected = async () => {
        if (!onDeleteMany || selected.size === 0 || deleting) return;
        setDeleting(true);
        try { await onDeleteMany([...selected]); setSelected(new Set()); } finally { setDeleting(false); }
    };

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
            case 'clock': return <Clock size={12} className="text-[#0B57D0]" />;
            case 'check-circle': return <CheckCircle2 size={12} className="text-[#0B57D0]" />;
            case 'check': return <Check size={12} className="text-emerald-500" />;
            case 'alert': return <AlertCircle size={12} className="text-red-500" />;
            case 'rotate': return <RotateCcw size={12} className="text-gray-400" />;
            default: return <Clock size={12} className="text-gray-400" />;
        }
    };

    const getStatusText = (status: string) => getStatusConfig(status).label;

    return (
        <div className="bg-white rounded-2xl p-3 flex flex-col gap-2">
            {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#E8F0FE] px-4 py-2.5 text-xs">
                    <span className="font-bold text-[#041E49]">{selected.size} selected</span>
                    <button type="button" onClick={() => setSelected(new Set(requisitions.map((r) => r.id)))} className="font-medium text-[#0B57D0] hover:underline">Select all {requisitions.length}</button>
                    <button type="button" onClick={() => setSelected(new Set())} className="font-medium text-[#5F6368] hover:underline">Clear</button>
                    {onDeleteMany && (
                        <button type="button" onClick={deleteSelected} disabled={deleting}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-700 disabled:opacity-50">
                            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete {selected.size}
                        </button>
                    )}
                </div>
            )}
            <div className="flex flex-col divide-y divide-[rgba(116,119,117,0.22)]">
                {requisitions.map((req) => (
                    <div
                        key={req.id}
                        onClick={() => onRowClick(req.id)}
                        className={`group px-3 py-3.5 flex items-center gap-4 cursor-pointer transition-colors ${
                            selected.has(req.id) ? 'bg-[#E8F0FE]' : 'hover:bg-gray-50/70'
                        }`}
                    >
                        <div className="w-5 h-4 flex-shrink-0 inline-flex justify-center items-center gap-4" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                checked={selected.has(req.id)}
                                onChange={() => toggleSelected(req.id)}
                                className="w-3.5 h-3.5 appearance-none bg-white rounded shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)] border-[0.50px] border-indigo-300 checked:bg-[#0B57D0] checked:border-[#0B57D0] cursor-pointer"
                            />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm truncate font-medium text-gray-700">
                                    {req.description}
                                </span>
                                <span className="text-sm whitespace-nowrap font-semibold text-[#1F1F1F]">
                                    K{req.estimated_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-px">
                                <span className="text-[10px] font-normal capitalize text-[#5F6368]">
                                    {req.requestor_name || 'System User'} · {req.department || 'General'} Dept.
                                </span>
                                <span className="text-[10px] font-normal text-neutral-500">
                                    {new Date(req.created_at).toLocaleDateString('en-GB')}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                                {getStatusIcon(req.status)}
                                <span className="text-[10px] font-normal capitalize text-[#5F6368]">
                                    {getStatusText(req.status)}
                                </span>
                            </div>
                        </div>

                        <div className="w-4 flex-shrink-0 flex items-center justify-center">
                            {req.has_unread_updates && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[#0B57D0] md:bg-[#0B57D0] shadow-sm shadow-blue-200" />
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
                                    className="absolute right-0 mt-1 w-48 bg-white border border-[rgba(116,119,117,0.22)] rounded-xl shadow-lg z-50 py-1"
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
                    <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-6 border border-[rgba(116,119,117,0.22)]">
                        <Search size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-[#1F1F1F]">No messages found</h3>
                    <p className="text-gray-400 max-w-xs mx-auto text-sm font-medium mt-2">
                        Select a different filter or check back later for new requests.
                    </p>
                </div>
            )}
        </div>
    );
};
