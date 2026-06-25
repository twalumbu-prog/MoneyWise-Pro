import React from 'react';
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
};

// Strip the internal "PENDING_INTENT:" prefix and the "| Cust: … | Method" tail
// so the row shows a clean human title.
export const inflowTitle = (description: string) =>
    (description || 'Inflow').replace(/^PENDING_INTENT:\s*/, '').split(' | ')[0].trim();

export const InflowInbox: React.FC<InflowInboxProps> = ({ inflows, onRowClick }) => {
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

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[500px] relative z-0 isolate">
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-gray-50/50">
                        {inflows.map((row) => {
                            const status = row.status || 'COMPLETED';
                            const source = ACCOUNT_TYPE_LABEL[row.account_type || ''] || 'Inflow';
                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => onRowClick?.(row.id)}
                                    className="group cursor-pointer hover:bg-emerald-50/30 transition-all bg-gray-50/30"
                                >
                                    {/* Leading accent dot */}
                                    <td className="py-6 px-8 w-4">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
                                    </td>

                                    {/* Description + source / reference metadata */}
                                    <td className="py-6 px-2 flex-1">
                                        <div className="flex flex-col space-y-2">
                                            <div className="text-[15px] tracking-[-0.01em] font-normal text-gray-700 line-clamp-1">
                                                {inflowTitle(row.description)}
                                            </div>
                                            <div className="flex items-center space-x-3 text-[11px] uppercase tracking-tight font-medium">
                                                <span className="text-gray-400">{source}</span>
                                                <div className="h-1 w-1 rounded-full bg-gray-200" />
                                                <span className="text-gray-300">
                                                    {row.reference_number || 'Receipt'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Status pill */}
                                    <td className="py-6 px-6 w-[180px]">
                                        <div className="flex items-center bg-white px-3.5 py-1.5 rounded-full border border-gray-100 shadow-sm w-fit transition-all hover:border-gray-200 group-hover:shadow-md group-hover:shadow-emerald-50/50">
                                            {getStatusIcon(status)}
                                            <span className="text-[10px] font-black text-brand-navy uppercase tracking-widest ml-2">
                                                {getStatusConfig(status).label}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Amount + date */}
                                    <td className="py-6 px-6 text-right w-[160px]">
                                        <div className="flex flex-col space-y-1">
                                            <div className="text-[17px] tracking-tight font-normal text-emerald-600">
                                                +K{(row.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                            <div className="text-[11px] text-gray-400 tracking-widest leading-none font-normal">
                                                {new Date(row.date).toLocaleDateString('en-GB')}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {inflows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-6 border border-gray-100">
                            <Search size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-brand-navy">No inflows yet</h3>
                        <p className="text-gray-400 max-w-xs mx-auto text-sm font-medium mt-2">
                            Record a sale with the New Sale button to see money-in here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
