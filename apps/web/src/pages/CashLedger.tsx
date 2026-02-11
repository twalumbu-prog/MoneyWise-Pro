import React, { useState, useEffect } from 'react';
import { cashbookService, CashbookEntry } from '../services/cashbook.service';
import { Layout } from '../components/Layout';
import {
    ChevronDown,
    ChevronUp,
    User,
    Receipt,
    AlertCircle,
    Info,
    Calendar,
    Wallet,
    ArrowDownCircle,
    ArrowUpCircle,
    CheckCircle,
    Lock,
    PlusCircle,
    RefreshCw
} from 'lucide-react';
import '../styles/cashbook.css';
import CloseBalanceModal from '../components/CloseBalanceModal';
import CashInflowModal from '../components/CashInflowModal';
import { useAuth } from '../context/AuthContext';
import { integrationService } from '../services/integration.service';

const CashLedger: React.FC = () => {
    const [entries, setEntries] = useState<CashbookEntry[]>([]);
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [startDate, setStartDate] = useState(
        new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
    const [isInflowModalOpen, setIsInflowModalOpen] = useState(false);
    const { userRole } = useAuth();
    const isRequestor = userRole === 'REQUESTOR';

    useEffect(() => {
        loadData();
    }, [startDate, endDate]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [entriesData, balanceData] = await Promise.all([
                cashbookService.getEntries({ startDate, endDate }),
                cashbookService.getBalance()
            ]);
            setEntries(entriesData);
            setBalance(balanceData);
        } catch (error) {
            console.error('Failed to load cashbook data:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleRetrySync = async (requisitionId: string) => {
        try {
            await integrationService.retrySync(requisitionId);
            await loadData();
        } catch (error: any) {
            alert('Failed to retry sync: ' + error.message);
        }
    };

    const formatCurrency = (amount: number) => {
        return `K${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getEntryStatus = (entry: CashbookEntry) => {
        if (entry.entry_type === 'CLOSING_BALANCE') return <span className="status-badge completed flex items-center"><Lock size={10} className="mr-1" /> Closed</span>;
        if (entry.entry_type === 'OPENING_BALANCE') return <span className="status-badge pending">Opening</span>;
        if (entry.entry_type !== 'DISBURSEMENT') return null;
        const status = entry.requisitions?.status || 'PENDING';

        if (status === 'COMPLETED') {
            const qbStatus = entry.requisitions?.qb_sync_status;
            return (
                <div className="flex flex-col items-end">
                    <span className="status-badge completed">Completed</span>
                    {qbStatus && (
                        <span className={`text-[9px] mt-1 font-bold uppercase tracking-widest ${qbStatus === 'SUCCESS' ? 'text-green-600' : qbStatus === 'FAILED' ? 'text-red-600' : 'text-gray-400'
                            }`}>
                            QB: {qbStatus}
                        </span>
                    )}
                </div>
            );
        }
        if (status === 'DISBURSED' || status === 'RECEIVED' || status === 'CHANGE_SUBMITTED') {
            return <span className="status-badge disbursed">Disbursed</span>;
        }
        return <span className="status-badge pending">{status}</span>;
    };

    const renderBreakdown = (entry: CashbookEntry) => {
        if (!entry.requisitions) return null;

        const req = entry.requisitions;
        const items = req.line_items || [];
        const disbursement = req.disbursements?.[0];

        const actualExpenditure = Number(req.actual_total || 0);
        const confirmedChange = Number(disbursement?.confirmed_change_amount || 0);
        const totalPrepared = Number(disbursement?.total_prepared || entry.credit || 0);

        // Total Variance = Budget - (Spent + Returned)
        // This captures lost money (positive) or extra money (negative)
        const discrepancy = totalPrepared - actualExpenditure - confirmedChange;

        return (
            <div className="details-content">
                <div className="spending-breakdown">
                    <div className="breakdown-section">
                        <h4><Receipt className="inline h-3 w-3 mr-1" /> Spending Breakdown</h4>
                        <table className="line-items-mini">
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="text-gray-600">
                                            <div>{item.description}</div>
                                            {item.accounts && (
                                                <div className="mt-1 flex items-center">
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                        {item.accounts.code}
                                                    </span>
                                                    <span className="ml-1.5 text-[10px] text-gray-400 truncate max-w-[150px]">
                                                        {item.accounts.name}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-right font-semibold align-top pt-3">
                                            {formatCurrency(item.actual_amount || item.estimated_amount)}
                                        </td>
                                    </tr>
                                ))}
                                {Math.abs(discrepancy) > 0.01 && (
                                    <tr className="bg-red-50/50">
                                        <td className="text-red-700 font-medium py-3 pl-2 border-l-2 border-red-200">
                                            <div>Unreconciled Variance</div>
                                            <div className="text-[10px] opacity-75 mt-0.5">Missing cash not returned</div>
                                        </td>
                                        <td className="text-right font-bold text-red-600 align-top pt-3 pr-2">
                                            {formatCurrency(discrepancy)}
                                        </td>
                                    </tr>
                                )}
                                {items.length === 0 && (
                                    <tr><td colSpan={2} className="text-gray-400 italic">No line items recorded</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div >

                    <div className="breakdown-section">
                        <h4><Info className="inline h-3 w-3 mr-1" /> Transaction Reconciliation</h4>
                        <div className="summary-grid">
                            <div className="summary-card">
                                <span className="label">Original Disbursed</span>
                                <span className="value text-indigo-600 font-black">{formatCurrency(totalPrepared)}</span>
                            </div>
                            <div className="summary-card">
                                <span className="label">Actual Spending</span>
                                <span className="value expenditure">{formatCurrency(actualExpenditure)}</span>
                            </div>
                            <div className="summary-card">
                                <span className="label">Change Received</span>
                                <span className="value change">{formatCurrency(confirmedChange)}</span>
                            </div>
                        </div>

                        {Math.abs(discrepancy) > 0.01 && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 flex items-start">
                                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-bold uppercase tracking-wider mb-1">Unreconciled Variance: {formatCurrency(discrepancy)}</div>
                                    <p className="opacity-80">The sum of expenditures and returned change does not match the original disbursement. The ledger balance has been adjusted to account for this missing amount.</p>
                                </div>
                            </div>
                        )}
                        {Math.abs(discrepancy) <= 0.01 && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700 flex items-center">
                                <CheckCircle className="h-4 w-4 mr-2" />
                                <span>Transaction fully reconciled. All funds accounted for.</span>
                            </div>
                        )}

                        {req.status === 'COMPLETED' && (
                            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                                <div className="flex items-center">
                                    <div className={`p-1.5 rounded-lg mr-3 ${req.qb_sync_status === 'SUCCESS' ? 'bg-green-100 text-green-600' : req.qb_sync_status === 'FAILED' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        <RefreshCw size={14} className={req.qb_sync_status === 'PENDING' ? 'animate-spin' : ''} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">QuickBooks Sync</div>
                                        <div className="text-xs font-bold text-gray-700">
                                            {req.qb_sync_status === 'SUCCESS' ? 'Synced successfully' :
                                                req.qb_sync_status === 'FAILED' ? 'Sync failed' :
                                                    'Not synced yet'}
                                        </div>
                                    </div>
                                </div>
                                {req.qb_sync_status === 'FAILED' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRetrySync(req.id);
                                        }}
                                        className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg hover:bg-indigo-100 transition-colors"
                                    >
                                        Retry Sync
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div >
            </div >
        );
    };

    if (loading && entries.length === 0) {
        return <Layout><div className="loading">Loading cashbook...</div></Layout>;
    }

    return (
        <Layout>
            <div className="cashbook-container">
                <div className="cashbook-header">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <Wallet className="h-6 w-6" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 m-0">Cash Ledger</h1>
                    </div>
                    <div className="balance-display flex items-center space-x-4">
                        <div className="text-right">
                            <span className="balance-label block">Verified Main Petty Cash Balance</span>
                            <span className="balance-amount">{formatCurrency(balance)}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            {!isRequestor && (
                                <button
                                    onClick={() => setIsInflowModalOpen(true)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center"
                                >
                                    <PlusCircle size={16} className="mr-2" />
                                    Log Inflow
                                </button>
                            )}
                            <button
                                onClick={() => setIsCloseModalOpen(true)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center"
                            >
                                <Lock size={16} className="mr-2" />
                                Close Balance
                            </button>
                        </div>
                    </div>
                </div>

                <CloseBalanceModal
                    isOpen={isCloseModalOpen}
                    onClose={() => setIsCloseModalOpen(false)}
                    onSuccess={loadData}
                    currentSystemBalance={balance}
                />

                <CashInflowModal
                    isOpen={isInflowModalOpen}
                    onClose={() => setIsInflowModalOpen(false)}
                    onSuccess={loadData}
                />

                <div className="filters flex items-center justify-between mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="flex space-x-4">
                        <div className="filter-group">
                            <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Date From</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Date To</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Showing</span>
                        <div className="text-sm font-bold text-gray-700">{entries.length} Transactions</div>
                    </div>
                </div>

                <div className="cashbook-table shadow-xl border border-gray-100 rounded-2xl overflow-hidden bg-white">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="p-4 text-[10px] uppercase text-gray-400 font-bold tracking-widest">Date</th>
                                <th className="p-4 text-[10px] uppercase text-gray-400 font-bold tracking-widest">Description & Details</th>
                                <th className="p-4 text-[10px] uppercase text-gray-400 font-bold tracking-widest">Status / Type</th>
                                <th className="p-4 text-[10px] uppercase text-gray-400 font-bold tracking-widest text-right">Debit</th>
                                <th className="p-4 text-[10px] uppercase text-gray-400 font-bold tracking-widest text-right">Credit</th>
                                <th className="p-4 text-[10px] uppercase text-gray-400 font-bold tracking-widest text-right">Balance</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {entries.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="no-data py-20 text-center text-gray-400 italic">No transactions found in this range.</td>
                                </tr>
                            ) : (
                                entries.map((entry) => (
                                    <React.Fragment key={entry.id}>
                                        <tr
                                            className={`clickable-row transition-colors group ${expandedRows[entry.id] ? 'bg-indigo-50/30' : ''} ${entry.entry_type === 'CLOSING_BALANCE' ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''} ${entry.entry_type === 'OPENING_BALANCE' ? 'bg-green-50/50' : ''}`}
                                            onClick={() => entry.requisition_id && toggleRow(entry.id)}
                                        >
                                            <td className="p-4">
                                                <div className="text-sm font-semibold text-gray-900">{new Date(entry.date).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-gray-400 uppercase tracking-tighter">
                                                    {new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td className="p-4 max-w-md">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-gray-900 line-clamp-1">
                                                        {entry.requisitions?.reference_number
                                                            ? `Voucher ${entry.requisitions.reference_number}`
                                                            : entry.description}
                                                    </span>
                                                    <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                                                        {entry.requisitions?.description || entry.description}
                                                    </div>
                                                    {entry.requisitions?.type && entry.requisitions.type !== 'EXPENSE' && (
                                                        <div className="mt-1">
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${entry.requisitions.type === 'LOAN' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                                                                }`}>
                                                                {entry.requisitions.type}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {entry.requisitions?.requestor?.name && (
                                                        <div className="flex items-center mt-1.5 text-[10px] text-gray-400">
                                                            <User className="h-3 w-3 mr-1" />
                                                            Paid to: <span className="font-bold ml-1 text-gray-600">{entry.requisitions.requestor.name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center space-x-2">
                                                    <span className={`entry-type ${entry.entry_type.toLowerCase()}`}>
                                                        {entry.entry_type.replace('_', ' ')}
                                                    </span>
                                                    {getEntryStatus(entry)}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                {entry.debit > 0 ? (
                                                    <span className="text-sm font-bold text-green-600 flex items-center justify-end">
                                                        <ArrowDownCircle className="h-3 w-3 mr-1 opactiy-50" />
                                                        {formatCurrency(entry.debit)}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                {entry.credit > 0 ? (
                                                    <span className="text-sm font-bold text-red-600 flex items-center justify-end">
                                                        <ArrowUpCircle className="h-3 w-3 mr-1 opacity-50" />
                                                        {formatCurrency(entry.credit)}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="text-sm font-black text-gray-900">{formatCurrency(entry.balance_after)}</span>
                                            </td>
                                            <td className="p-4">
                                                {entry.requisition_id && (
                                                    <button className="text-gray-400 group-hover:text-indigo-600 transition-colors">
                                                        {expandedRows[entry.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedRows[entry.id] && entry.requisition_id && (
                                            <tr className="details-row">
                                                <td colSpan={7}>
                                                    {renderBreakdown(entry)}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
};

export default CashLedger;
