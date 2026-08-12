import React, { useState } from 'react';
import { Search, Check, Clock, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { getStatusConfig } from '../services/requisition.service';

export interface InflowRow {
    id: string;
    description: string;
    debit: number;
    status?: string;
    date: string;
    created_at?: string;
    reference_number?: string;
    account_type?: string;
    accounts?: { name?: string } | null;
    has_unread_updates?: boolean;
}

interface InflowInboxProps {
    inflows: InflowRow[];
    onRowClick?: (id: string) => void;
}

// External ledgers + the MoneyWise wallet, shown as the inflow's source sub-label.
const ACCOUNT_TYPE_LABEL: Record<string, string> = {
    CASH: 'Cash',
    AIRTEL_MONEY: 'Mobile Money',
    BANK: 'Bank',
    MONEYWISE_WALLET: 'MoneyWise Wallet',
    MASTERFEES: 'Master Fees',
    MASTERFEES_MANUAL: 'Master Fees (Manual)',
};

// Strip the internal "PENDING_INTENT:" prefix and the "| Cust: … | Method" tail
// so the row shows a clean human title.
export const inflowTitle = (description: string) =>
    (description || 'Inflow').replace(/^PENDING_INTENT:\s*/, '').split(' | ')[0].trim();

export const InflowInbox: React.FC<InflowInboxProps> = ({ inflows, onRowClick }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

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

    return (
        <div className="bg-white rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex flex-col divide-y divide-[#E8EEF8]">
                {inflows.map((row) => {
                    const status = row.status || 'COMPLETED';
                    const source = ACCOUNT_TYPE_LABEL[row.account_type || ''] || 'Inflow';
                    const statusConfig = getStatusConfig(status);

                    return (
                        <div
                            key={row.id}
                            onClick={() => onRowClick?.(row.id)}
                            className={`group px-3 py-3.5 flex items-center gap-4 cursor-pointer transition-colors ${
                                selected.has(row.id) ? 'bg-[#F0F7FF]' : 'hover:bg-gray-50/70'
                            }`}
                        >
                            {/* Checkbox */}
                            <div
                                className="w-5 h-4 flex-shrink-0 inline-flex justify-center items-center gap-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(row.id)}
                                    onChange={() => toggleSelected(row.id)}
                                    className="w-3.5 h-3.5 appearance-none bg-white rounded shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)] border-[0.50px] border-indigo-300 checked:bg-[#0058DB] checked:border-[#0058DB] cursor-pointer"
                                />
                            </div>

                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm truncate font-medium text-gray-700">
                                        {inflowTitle(row.description)}
                                    </span>
                                    <span className="text-sm whitespace-nowrap font-semibold text-[#111827]">
                                        +K{(row.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-px">
                                    <span className="text-[10px] font-normal capitalize text-[#6B7280]">
                                        {source} · {row.reference_number || 'Receipt'}
                                    </span>
                                    <span className="text-[10px] font-normal text-neutral-500">
                                        {new Date(row.date).toLocaleDateString('en-GB')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                    {getStatusIcon(status)}
                                    <span className="text-[10px] font-normal capitalize text-[#6B7280]">
                                        {statusConfig.label}
                                    </span>
                                </div>
                            </div>

                            {/* Unread dot */}
                            <div className="w-4 flex-shrink-0 flex items-center justify-center">
                                {row.has_unread_updates && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#0058DB] shadow-sm shadow-blue-200" />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {inflows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-6 border border-[#E8EEF8]">
                        <Search size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-brand-navy">No inflows yet</h3>
                    <p className="text-gray-400 max-w-xs mx-auto text-sm font-medium mt-2">
                        Record a sale with the New Sale button to see money-in here.
                    </p>
                </div>
            )}
        </div>
    );
};
