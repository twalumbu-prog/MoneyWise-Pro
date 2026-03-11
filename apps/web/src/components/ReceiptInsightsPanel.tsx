import React, { useState } from 'react';
import {
    ChevronDown, ChevronUp, Sparkles, Store, Calendar, DollarSign,
    CreditCard, Receipt, Hash, AlertTriangle, CheckCircle, XCircle,
    Loader2, RefreshCw, ShoppingCart, FileWarning
} from 'lucide-react';

interface ReceiptLine {
    description: string;
    quantity?: number;
    unit_price?: number;
    total?: number;
}

export interface ReceiptOcrData {
    vendor?: string | null;
    vendor_address?: string | null;
    date?: string | null;
    time?: string | null;
    total_amount?: number | null;
    subtotal?: number | null;
    vat_amount?: number | null;
    vat_rate?: number | null;
    currency?: string | null;
    payment_method?: string | null;
    receipt_number?: string | null;
    til_number?: string | null;
    line_items?: ReceiptLine[];
    notes?: string | null;
    confidence?: number;
    error?: string | null;
}

interface Props {
    itemId: string;
    ocrData: ReceiptOcrData | null;
    ocrStatus: 'NONE' | 'PENDING' | 'DONE' | 'FAILED';
    expectedAmount?: number;
    onReanalyze: (itemId: string) => void;
    isReanalyzing?: boolean;
}

const formatCurrency = (amount: number | null | undefined, currency = 'ZMW') => {
    if (amount == null) return '—';
    return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const VerificationBadge: React.FC<{ receiptAmount?: number | null; expectedAmount?: number }> = ({ receiptAmount, expectedAmount }) => {
    if (receiptAmount == null || expectedAmount == null) return null;

    const diff = Math.abs(receiptAmount - expectedAmount);
    const tolerance = 0.05; // 5 cents tolerance

    if (diff <= tolerance) {
        return (
            <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <CheckCircle className="h-3 w-3" /> Amount Verified
            </span>
        );
    } else if (diff / expectedAmount <= 0.1) {
        return (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" /> Minor Variance (K{diff.toFixed(2)})
            </span>
        );
    } else {
        return (
            <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                <XCircle className="h-3 w-3" /> Amount Mismatch (K{diff.toFixed(2)})
            </span>
        );
    }
};

export const ReceiptInsightsPanel: React.FC<Props> = ({
    itemId,
    ocrData,
    ocrStatus,
    expectedAmount,
    onReanalyze,
    isReanalyzing
}) => {
    const [expanded, setExpanded] = useState(false);
    const [showRawItems, setShowRawItems] = useState(false);

    const isPending = ocrStatus === 'PENDING' || isReanalyzing;
    const hasFailed = ocrStatus === 'FAILED';
    const hasDone = ocrStatus === 'DONE' && ocrData && !ocrData.error;

    const triggerButton = (label: string) => (
        <button
            onClick={() => onReanalyze(itemId)}
            disabled={isPending}
            className="text-xs flex items-center gap-1 text-brand-green font-bold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Analyzing…' : label}
        </button>
    );

    // When status is NONE, show a subtle "Scan Receipt" button
    if (ocrStatus === 'NONE') {
        return (
            <tr className="bg-indigo-50/50">
                <td colSpan={4} className="px-4 py-1 text-right">
                    <button
                        onClick={() => onReanalyze(itemId)}
                        className="text-xs flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-medium ml-auto"
                    >
                        <Sparkles className="h-3 w-3" /> Scan Receipt with AI
                    </button>
                </td>
            </tr>
        );
    }

    return (
        <>
            {/* Toggle Row */}
            <tr
                className={`cursor-pointer border-t ${expanded ? 'bg-indigo-50' : 'bg-indigo-50/40 hover:bg-indigo-50'}`}
                onClick={() => setExpanded(e => !e)}
            >
                <td colSpan={4} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {isPending ? (
                                <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />
                            ) : hasFailed ? (
                                <FileWarning className="h-4 w-4 text-red-500" />
                            ) : (
                                <Sparkles className="h-4 w-4 text-indigo-600" />
                            )}
                            <span className="text-xs font-bold text-indigo-700">
                                {isPending ? 'Analyzing Receipt…' : hasFailed ? 'Analysis Failed' : `AI Receipt Insights${ocrData?.vendor ? ` — ${ocrData.vendor}` : ''}`}
                            </span>
                            {hasDone && (
                                <VerificationBadge receiptAmount={ocrData?.total_amount} expectedAmount={expectedAmount} />
                            )}
                        </div>
                        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                            {triggerButton('Re-scan')}
                            {expanded ? <ChevronUp className="h-4 w-4 text-indigo-400" /> : <ChevronDown className="h-4 w-4 text-indigo-400" />}
                        </div>
                    </div>
                </td>
            </tr>

            {/* Expanded Panel */}
            {expanded && (
                <tr className="bg-indigo-50">
                    <td colSpan={4} className="px-4 pb-4 pt-0">
                        {isPending && (
                            <div className="flex items-center justify-center py-4 gap-3 text-indigo-500">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-sm font-medium">AI is reading your receipt…</span>
                            </div>
                        )}

                        {hasFailed && (
                            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="font-bold mb-1">Analysis Failed</p>
                                <p className="text-xs">{ocrData?.error || 'An unknown error occurred. Please try re-scanning.'}</p>
                            </div>
                        )}

                        {hasDone && ocrData && (
                            <div className="space-y-3">
                                {/* Main Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                                    {ocrData.vendor && (
                                        <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                            <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">
                                                <Store className="h-3 w-3" /> Vendor
                                            </div>
                                            <p className="text-sm font-semibold text-gray-900 leading-tight">{ocrData.vendor}</p>
                                            {ocrData.vendor_address && <p className="text-xs text-gray-400 mt-0.5">{ocrData.vendor_address}</p>}
                                        </div>
                                    )}

                                    {ocrData.date && (
                                        <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                            <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">
                                                <Calendar className="h-3 w-3" /> Date
                                            </div>
                                            <p className="text-sm font-semibold text-gray-900">
                                                {new Date(ocrData.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </p>
                                            {ocrData.time && <p className="text-xs text-gray-400">{ocrData.time}</p>}
                                        </div>
                                    )}

                                    {ocrData.total_amount != null && (
                                        <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                            <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">
                                                <DollarSign className="h-3 w-3" /> Total
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">
                                                {formatCurrency(ocrData.total_amount, ocrData.currency || 'ZMW')}
                                            </p>
                                            {ocrData.subtotal != null && ocrData.subtotal !== ocrData.total_amount && (
                                                <p className="text-xs text-gray-400">Subtotal: {formatCurrency(ocrData.subtotal, ocrData.currency || 'ZMW')}</p>
                                            )}
                                        </div>
                                    )}

                                    {ocrData.vat_amount != null && (
                                        <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                            <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">
                                                <Receipt className="h-3 w-3" /> VAT
                                            </div>
                                            <p className="text-sm font-semibold text-gray-900">
                                                {formatCurrency(ocrData.vat_amount, ocrData.currency || 'ZMW')}
                                                {ocrData.vat_rate != null && ` (${ocrData.vat_rate}%)`}
                                            </p>
                                        </div>
                                    )}

                                    {ocrData.payment_method && (
                                        <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                            <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">
                                                <CreditCard className="h-3 w-3" /> Payment
                                            </div>
                                            <p className="text-sm font-semibold text-gray-900">{ocrData.payment_method}</p>
                                        </div>
                                    )}

                                    {(ocrData.receipt_number || ocrData.til_number) && (
                                        <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                            <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">
                                                <Hash className="h-3 w-3" /> Reference
                                            </div>
                                            {ocrData.receipt_number && <p className="text-xs font-semibold text-gray-900">Receipt: {ocrData.receipt_number}</p>}
                                            {ocrData.til_number && <p className="text-xs text-gray-500">Till: {ocrData.til_number}</p>}
                                        </div>
                                    )}
                                </div>

                                {/* Line Items from Receipt */}
                                {ocrData.line_items && ocrData.line_items.length > 0 && (
                                    <div className="bg-white rounded-lg border border-indigo-100 overflow-hidden">
                                        <button
                                            onClick={() => setShowRawItems(v => !v)}
                                            className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                                        >
                                            <span className="flex items-center gap-1">
                                                <ShoppingCart className="h-3 w-3" /> Receipt Line Items ({ocrData.line_items.length})
                                            </span>
                                            {showRawItems ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                        </button>
                                        {showRawItems && (
                                            <table className="min-w-full text-xs">
                                                <thead className="bg-indigo-50">
                                                    <tr>
                                                        <th className="px-3 py-1 text-left text-[10px] uppercase text-indigo-400 font-bold">Item</th>
                                                        <th className="px-3 py-1 text-right text-[10px] uppercase text-indigo-400 font-bold">Qty</th>
                                                        <th className="px-3 py-1 text-right text-[10px] uppercase text-indigo-400 font-bold">Unit</th>
                                                        <th className="px-3 py-1 text-right text-[10px] uppercase text-indigo-400 font-bold">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-indigo-50">
                                                    {ocrData.line_items.map((li, i) => (
                                                        <tr key={i}>
                                                            <td className="px-3 py-1 text-gray-800">{li.description}</td>
                                                            <td className="px-3 py-1 text-right text-gray-600">{li.quantity ?? '—'}</td>
                                                            <td className="px-3 py-1 text-right text-gray-600">{li.unit_price != null ? formatCurrency(li.unit_price, ocrData.currency || 'ZMW') : '—'}</td>
                                                            <td className="px-3 py-1 text-right font-semibold text-gray-800">{li.total != null ? formatCurrency(li.total, ocrData.currency || 'ZMW') : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}

                                {/* Notes */}
                                {ocrData.notes && (
                                    <p className="text-xs text-gray-500 italic bg-white rounded-lg border border-indigo-100 p-2">
                                        📝 {ocrData.notes}
                                    </p>
                                )}

                                {/* Confidence */}
                                {ocrData.confidence != null && (
                                    <p className="text-[10px] text-indigo-300 text-right">
                                        AI Confidence: {Math.round(ocrData.confidence * 100)}%
                                    </p>
                                )}
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
};
