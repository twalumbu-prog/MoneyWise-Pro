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
    ArrowDownCircle,
    ArrowUpCircle,
    CheckCircle,
    Lock,
    PlusCircle,
    RefreshCw,
    Sparkles,
    AlertTriangle,
    X,
    Search,
    Filter,
    ArrowDownUp
} from 'lucide-react';
import '../styles/cashbook.css';
import CloseBalanceModal from '../components/CloseBalanceModal';
import CashInflowModal from '../components/CashInflowModal';
import { useAuth } from '../context/AuthContext';
import { integrationService } from '../services/integration.service';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/export.utils';
import { Download } from 'lucide-react';

const CashLedger: React.FC = () => {
    const [entries, setEntries] = useState<CashbookEntry[]>([]);
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [startDate, setStartDate] = useState(
        new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedAccountType, setSelectedAccountType] = useState<'CASH' | 'AIRTEL_MONEY' | 'BANK'>('CASH');
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
    const [isInflowModalOpen, setIsInflowModalOpen] = useState(false);
    const [isClassifying, setIsClassifying] = useState(false);
    const [classificationResults, setClassificationResults] = useState<any[]>([]);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

    // Search, Sort, and Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_HIGH' | 'AMOUNT_LOW'>('DATE_DESC');
    const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
    const [filterAccount, setFilterAccount] = useState<string>('ALL');

    const { userRole, organizationName } = useAuth();
    const isRequestor = userRole === 'REQUESTOR';

    useEffect(() => {
        loadData();
    }, [startDate, endDate, selectedAccountType]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [entriesData, balanceData] = await Promise.all([
                cashbookService.getEntries({ startDate, endDate, accountType: selectedAccountType }),
                cashbookService.getBalance(selectedAccountType)
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

    const handleBulkClassify = async () => {
        if (unclassifiedCount === 0) {
            alert('Great job! All completed transactions are already classified.');
            return;
        }

        if (!confirm(`This will use AI to classify ${unclassifiedCount} unclassified transactions. Continue?`)) return;

        setIsClassifying(true);
        try {
            const result = await cashbookService.classifyBulk();
            if (result.count > 0 && result.results) {
                setClassificationResults(result.results);
                setIsResultsModalOpen(true);
                loadData(); // Reload to show new classifications
            } else {
                alert(result.message);
            }
        } catch (error: any) {
            console.error('Classification failed', error);
            alert('Failed to classify transactions: ' + error.message);
        } finally {
            setIsClassifying(false);
        }
    };

    const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
        const filename = `Cash_Ledger_${startDate}_to_${endDate}`;
        const period = { start: startDate, end: endDate };

        switch (format) {
            case 'csv':
                exportToCSV(entries, filename);
                break;
            case 'excel':
                exportToExcel(entries, filename, period);
                break;
            case 'pdf':
                exportToPDF(entries, filename, period, organizationName || 'MoneyWise Pro');
                break;
        }
        setIsExportMenuOpen(false);
    };

    const countUnclassified = () => {
        let count = 0;
        entries.forEach(entry => {
            if (entry.requisitions?.status === 'COMPLETED' && entry.requisitions.line_items) {
                const unclassifiedItems = entry.requisitions.line_items.filter((item: any) => !item.accounts);
                if (unclassifiedItems.length > 0) count++;
            }
        });
        return count;
    };

    const unclassifiedCount = countUnclassified();

    // Derived State for Filters
    const uniqueDepartments = React.useMemo(() => {
        const depts = new Set<string>();
        entries.forEach(entry => {
            if (entry.requisitions?.department) {
                depts.add(entry.requisitions.department);
            }
        });
        return Array.from(depts).sort();
    }, [entries]);

    const uniqueAccounts = React.useMemo(() => {
        const accs = new Set<string>();
        entries.forEach(entry => {
            entry.requisitions?.line_items?.forEach((item: any) => {
                if (item.accounts?.name) {
                    accs.add(item.accounts.name);
                }
            });
        });
        return Array.from(accs).sort();
    }, [entries]);

    // Processed Data (Search, Filter, Sort)
    const processedEntries = React.useMemo(() => {
        let result = [...entries];

        // 1. Dropdown Filters
        if (filterDepartment !== 'ALL') {
            result = result.filter(entry => entry.requisitions?.department === filterDepartment);
        }

        if (filterAccount !== 'ALL') {
            result = result.filter(entry => {
                // Return true if any line item in this entry matches the account filter
                return entry.requisitions?.line_items?.some((item: any) => item.accounts?.name === filterAccount);
            });
        }

        // 2. Text Search
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            result = result.filter(entry => {
                const desc = entry.description?.toLowerCase() || '';
                const reqDesc = entry.requisitions?.description?.toLowerCase() || '';
                const refNum = entry.requisitions?.reference_number?.toLowerCase() || '';
                const requestor = entry.requisitions?.requestor?.name?.toLowerCase() || '';
                return desc.includes(query) || reqDesc.includes(query) || refNum.includes(query) || requestor.includes(query);
            });
        }

        // 3. Sort
        result.sort((a, b) => {
            if (sortBy === 'DATE_DESC') return new Date(b.date).getTime() - new Date(a.date).getTime();
            if (sortBy === 'DATE_ASC') return new Date(a.date).getTime() - new Date(b.date).getTime();

            // Amount sorting (treating Debit vs Credit)
            // For ledger sorting, we usually sort by absolute transaction value or net impact. 
            // We'll use the larger of the two (since it's usually one or the other).
            const amtA = Math.max(Number(a.debit || 0), Number(a.credit || 0));
            const amtB = Math.max(Number(b.debit || 0), Number(b.credit || 0));

            if (sortBy === 'AMOUNT_HIGH') return amtB - amtA;
            if (sortBy === 'AMOUNT_LOW') return amtA - amtB;

            return 0;
        });

        return result;

    }, [entries, searchQuery, filterDepartment, filterAccount, sortBy]);

    const formatCurrency = (amount: number) => {
        return `K${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getEntryStatus = (entry: CashbookEntry) => {
        if (entry.entry_type === 'CLOSING_BALANCE') return <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200"><Lock size={10} className="mr-1" /> Closed</span>;
        if (entry.entry_type === 'OPENING_BALANCE') return <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">Opening</span>;
        if (entry.entry_type !== 'DISBURSEMENT') return null;

        const status = entry.requisitions?.status || 'PENDING';

        if (status === 'COMPLETED') {
            const qbStatus = entry.requisitions?.qb_sync_status;
            return (
                <div className="flex flex-col items-end">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">Completed</span>
                    {qbStatus && (
                        <span className={`text-[9px] mt-1 font-bold uppercase tracking-widest ${qbStatus === 'SUCCESS' ? 'text-emerald-600' : qbStatus === 'FAILED' ? 'text-rose-600' : 'text-gray-400'
                            }`}>
                            QB: {qbStatus}
                        </span>
                    )}
                </div>
            );
        }
        if (status === 'DISBURSED' || status === 'RECEIVED' || status === 'CHANGE_SUBMITTED') {
            return <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">Disbursed</span>;
        }
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">{status}</span>;
    };

    const renderBreakdown = (entry: CashbookEntry) => {
        if (!entry.requisitions) return null;

        const req = entry.requisitions;
        const items = req.line_items || [];
        const disbursement = req.disbursements?.[0];

        const actualExpenditure = items.length > 0
            ? items.reduce((acc: number, item: any) => acc + Number(item.actual_amount || item.estimated_amount || 0), 0)
            : Number(req.actual_total || 0);

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
                                            {item.accounts ? (
                                                <div className="mt-1 flex items-center">
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                        {item.accounts.code}
                                                    </span>
                                                    <span className="ml-1.5 text-[10px] text-gray-400 truncate max-w-[150px]">
                                                        {item.accounts.name}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="mt-1 flex items-center text-amber-600 text-[10px] font-medium animate-pulse">
                                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                                    Unclassified
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
                                <span className="value text-brand-navy font-black">{formatCurrency(totalPrepared)}</span>
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
                                        className="px-3 py-1 bg-brand-navy text-white text-[10px] font-bold rounded-lg hover:bg-brand-green transition-colors"
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
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                        <h1 className="text-2xl font-bold text-gray-900 m-0">Cash Ledger</h1>

                        <div className="flex ml-0 md:ml-4 bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setSelectedAccountType('CASH')}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${selectedAccountType === 'CASH' ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Cash
                            </button>
                            <button
                                onClick={() => setSelectedAccountType('AIRTEL_MONEY')}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${selectedAccountType === 'AIRTEL_MONEY' ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Airtel Money
                            </button>
                            <button
                                onClick={() => setSelectedAccountType('BANK')}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${selectedAccountType === 'BANK' ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Bank Transfer
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3">
                        <div className="relative">
                            <button
                                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center"
                            >
                                <Download size={16} className="mr-2 text-gray-500" />
                                Export
                                <ChevronDown size={14} className={`ml-2 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isExportMenuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="py-1">
                                        <button
                                            onClick={() => handleExport('csv')}
                                            className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center"
                                        >
                                            <span className="w-8 text-xs font-bold text-gray-400">CSV</span>
                                            Export as CSV
                                        </button>
                                        <button
                                            onClick={() => handleExport('excel')}
                                            className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center"
                                        >
                                            <span className="w-8 text-xs font-bold text-emerald-600">XLSX</span>
                                            Export for Excel
                                        </button>
                                        <button
                                            onClick={() => handleExport('pdf')}
                                            className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center border-t border-gray-50"
                                        >
                                            <span className="w-8 text-xs font-bold text-rose-500">PDF</span>
                                            Export as PDF
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        {!isRequestor && (
                            <button
                                onClick={() => setIsInflowModalOpen(true)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center"
                            >
                                <PlusCircle size={16} className="mr-2" />
                                Log Inflow
                            </button>
                        )}
                        <button
                            onClick={() => setIsCloseModalOpen(true)}
                            className="bg-brand-navy hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center"
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
                onSuccess={() => {
                    // If we closed a book, ensure the end date is inclusive of the next day 
                    // ताकि opening balance दिखे
                    const nextDay = new Date(endDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    setEndDate(nextDay.toISOString().split('T')[0]);
                    loadData();
                }}
                currentSystemBalance={balance}
                accountType={selectedAccountType}
            />

            <CashInflowModal
                isOpen={isInflowModalOpen}
                onClose={() => setIsInflowModalOpen(false)}
                onSuccess={loadData}
            />

            {/* Command Center */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm gap-6 mt-6">

                {/* Visual Balance */}
                <div className="flex items-center gap-4 border-b md:border-b-0 md:border-r border-gray-100 pb-4 md:pb-0 md:pr-6 w-full md:w-auto">
                    <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">Verified Balance</span>
                        <span className="text-3xl font-black text-brand-navy tracking-tight">{formatCurrency(balance)}</span>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex-1 flex items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200 w-full md:w-auto">
                        <div className="relative flex items-center px-3 py-1.5 border-r border-gray-200/60">
                            <Calendar className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-transparent text-sm font-semibold text-gray-700 focus:outline-none w-[110px]"
                            />
                        </div>
                        <div className="px-3 text-gray-400 text-sm font-medium">to</div>
                        <div className="relative flex items-center px-3 py-1.5">
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-transparent text-sm font-semibold text-gray-700 focus:outline-none w-[110px]"
                            />
                        </div>
                    </div>
                </div>

                {/* Actions & Meta */}
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    {!isRequestor && (
                        <button
                            onClick={handleBulkClassify}
                            disabled={isClassifying}
                            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center border ${unclassifiedCount > 0
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 shadow-sm'
                                : 'bg-transparent text-gray-500 border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            <Sparkles size={16} className={`mr-2 ${isClassifying ? 'animate-spin' : ''}`} />
                            {isClassifying ? 'Classifying...' : (unclassifiedCount > 0 ? `Auto-Classify (${unclassifiedCount})` : 'Auto-Classify')}
                        </button>
                    )}
                    <div className="text-right pl-4 border-l border-gray-100 hidden sm:block">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest block mb-0.5">Transactions</span>
                        <div className="text-sm font-bold text-gray-700">{processedEntries.length} found</div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col md:flex-row items-center gap-4 mb-6 relative z-10">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by description, reference, or names..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all shadow-sm"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap md:flex-nowrap">
                    {/* Sort Dropdown */}
                    <div className="relative min-w-[140px]">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <ArrowDownUp className="h-4 w-4 text-gray-400" />
                        </div>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 appearance-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none shadow-sm cursor-pointer"
                        >
                            <option value="DATE_DESC">Newest First</option>
                            <option value="DATE_ASC">Oldest First</option>
                            <option value="AMOUNT_HIGH">Highest Amount</option>
                            <option value="AMOUNT_LOW">Lowest Amount</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    </div>

                    {/* Filters Button */}
                    <div className="relative">
                        <button
                            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                            className={`px-4 py-2.5 bg-white border rounded-xl text-sm font-semibold flex items-center transition-all shadow-sm ${filterDepartment !== 'ALL' || filterAccount !== 'ALL' ? 'border-brand-green text-brand-green bg-green-50/10' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <Filter className="h-4 w-4 mr-2" />
                            Filters
                            {(filterDepartment !== 'ALL' || filterAccount !== 'ALL') && (
                                <span className="ml-2 bg-brand-green text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                    {(filterDepartment !== 'ALL' ? 1 : 0) + (filterAccount !== 'ALL' ? 1 : 0)}
                                </span>
                            )}
                            <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isFilterMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isFilterMenuOpen && (
                            <div className="absolute right-0 md:left-auto mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-4 space-y-4">
                                    {/* Department Filter */}
                                    <div className={uniqueDepartments.length === 0 ? 'opacity-50' : ''}>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Department</label>
                                        <div className="relative">
                                            <select
                                                value={filterDepartment}
                                                onChange={(e) => setFilterDepartment(e.target.value)}
                                                disabled={uniqueDepartments.length === 0}
                                                className={`w-full pl-3 pr-8 py-2 bg-gray-50 border rounded-lg text-sm font-semibold appearance-none focus:ring-2 focus:ring-brand-green/20 outline-none truncate 
                                                    ${uniqueDepartments.length === 0 ? 'cursor-not-allowed text-gray-400 border-gray-200' :
                                                        filterDepartment !== 'ALL' ? 'cursor-pointer border-brand-green text-brand-green bg-green-50/50' : 'cursor-pointer border-gray-200 text-gray-700 hover:border-gray-300'
                                                    }`}
                                            >
                                                <option value="ALL">All Departments</option>
                                                {uniqueDepartments.map(dept => (
                                                    <option key={dept} value={dept}>{dept}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${filterDepartment !== 'ALL' ? 'text-brand-green' : 'text-gray-400'}`} />
                                        </div>
                                    </div>

                                    {/* Account Filter */}
                                    <div className={uniqueAccounts.length === 0 ? 'opacity-50' : ''}>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Account Type</label>
                                        <div className="relative">
                                            <select
                                                value={filterAccount}
                                                onChange={(e) => setFilterAccount(e.target.value)}
                                                disabled={uniqueAccounts.length === 0}
                                                className={`w-full pl-3 pr-8 py-2 bg-gray-50 border rounded-lg text-sm font-semibold appearance-none focus:ring-2 focus:ring-brand-green/20 outline-none truncate 
                                                    ${uniqueAccounts.length === 0 ? 'cursor-not-allowed text-gray-400 border-gray-200' :
                                                        filterAccount !== 'ALL' ? 'cursor-pointer border-indigo-400 text-indigo-700 bg-indigo-50/50' : 'cursor-pointer border-gray-200 text-gray-700 hover:border-gray-300'
                                                    }`}
                                            >
                                                <option value="ALL">All Accounts</option>
                                                {uniqueAccounts.map(acc => (
                                                    <option key={acc} value={acc}>{acc}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${filterAccount !== 'ALL' ? 'text-indigo-500' : 'text-gray-400'}`} />
                                        </div>
                                    </div>

                                    {(filterDepartment !== 'ALL' || filterAccount !== 'ALL') && (
                                        <button
                                            onClick={() => { setFilterDepartment('ALL'); setFilterAccount('ALL'); setIsFilterMenuOpen(false); }}
                                            className="w-full mt-2 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
                                        >
                                            Clear Filters
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="shadow-sm border border-gray-100 rounded-2xl overflow-hidden bg-white">
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
                        {processedEntries.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-20 text-center border-b-0">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="p-4 bg-gray-50 rounded-full mb-3">
                                            <Receipt className="h-8 w-8 text-gray-300" />
                                        </div>
                                        <p className="text-gray-500 font-medium">No transactions match your search/filters.</p>
                                        <p className="text-xs text-gray-400 mt-1">Try clearing your filters or adjusting your date range.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            processedEntries.map((entry) => (
                                <React.Fragment key={entry.id}>
                                    <tr
                                        className={`transition-colors group border-b border-gray-100 last:border-b-0 cursor-pointer 
                                                ${expandedRows[entry.id] ? 'bg-gray-50 border-l-4 border-l-brand-navy' : 'hover:bg-gray-50/80'} 
                                                ${entry.entry_type === 'CLOSING_BALANCE' ? 'bg-slate-50/60 border-l-4 border-l-slate-400' : ''} 
                                                ${entry.entry_type === 'OPENING_BALANCE' ? 'bg-indigo-50/40 border-l-4 border-l-indigo-400' : ''}
                                                ${!expandedRows[entry.id] && entry.entry_type !== 'CLOSING_BALANCE' && entry.entry_type !== 'OPENING_BALANCE' ? 'border-l-4 border-l-transparent' : ''}`}
                                        onClick={() => entry.requisition_id && toggleRow(entry.id)}
                                    >
                                        <td className="p-5">
                                            <div className="text-sm font-semibold text-gray-900">{new Date(entry.date).toLocaleDateString()}</div>
                                            <div className="text-[10px] text-gray-400 uppercase tracking-tighter mt-0.5">
                                                {new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="p-5 max-w-md">
                                            <div className="flex flex-col">
                                                <span className="text-[15px] font-bold text-gray-900 line-clamp-1">
                                                    {entry.requisitions?.reference_number
                                                        ? `Voucher ${entry.requisitions.reference_number}`
                                                        : entry.description}
                                                </span>
                                                <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                                                    {entry.requisitions?.description || entry.description}
                                                </div>
                                                {entry.requisitions?.type && entry.requisitions.type !== 'EXPENSE' && (
                                                    <div className="mt-1.5">
                                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${entry.requisitions.type === 'LOAN' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                                                            }`}>
                                                            {entry.requisitions.type}
                                                        </span>
                                                    </div>
                                                )}
                                                {entry.requisitions?.requestor?.name && (
                                                    <div className="flex items-center mt-2 text-[11px] text-gray-400">
                                                        <User className="h-3.5 w-3.5 mr-1.5" />
                                                        Paid to: <span className="font-semibold ml-1 text-gray-700">{entry.requisitions.requestor.name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center space-x-2">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${entry.entry_type === 'DISBURSEMENT' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                    entry.entry_type === 'RETURN' || entry.entry_type === 'INFLOW' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                                                        entry.entry_type === 'ADJUSTMENT' ? 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200' :
                                                            entry.entry_type === 'CLOSING_BALANCE' ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                                                                entry.entry_type === 'OPENING_BALANCE' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                                                    'bg-gray-50 text-gray-700 border border-gray-200'
                                                    }`}>
                                                    {entry.entry_type.replace('_', ' ')}
                                                </span>
                                                {getEntryStatus(entry)}
                                            </div>
                                        </td>
                                        <td className="p-5 text-right">
                                            {entry.debit > 0 ? (
                                                <span className="text-[15px] font-bold text-emerald-600 flex items-center justify-end">
                                                    <ArrowDownCircle className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                                                    {formatCurrency(entry.debit)}
                                                </span>
                                            ) : <span className="text-gray-300">-</span>}
                                        </td>
                                        <td className="p-5 text-right">
                                            {entry.credit > 0 ? (
                                                <span className="text-[15px] font-bold text-rose-600 flex items-center justify-end">
                                                    <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                                                    {formatCurrency(entry.credit)}
                                                </span>
                                            ) : <span className="text-gray-300">-</span>}
                                        </td>
                                        <td className="p-5 text-right">
                                            <span className="text-[15px] font-black text-gray-900">{formatCurrency(entry.balance_after)}</span>
                                        </td>
                                        <td className="p-5 w-12 text-center">
                                            {entry.requisition_id && (
                                                <button className="text-gray-400 hover:text-brand-navy hover:bg-gray-100 p-1.5 rounded-full transition-all duration-200">
                                                    {expandedRows[entry.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedRows[entry.id] && entry.requisition_id && (
                                        <tr className="bg-gray-50 border-b border-gray-100 border-l-4 border-l-brand-navy shadow-inner">
                                            <td colSpan={7} className="p-0">
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                    {renderBreakdown(entry)}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Classification Results Modal */}
            {isResultsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                                    <Sparkles className="h-5 w-5 text-amber-500 mr-2" />
                                    Classification Results
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Successfully classified {classificationResults.length} transactions.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsResultsModalOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {classificationResults.map((result: any, index: number) => (
                                <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-medium text-gray-900">{result.description}</div>
                                        <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${result.method === 'RULE' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                            }`}>
                                            {result.method === 'RULE' ? 'Rule Match' : 'AI Analysis'}
                                        </div>
                                    </div>

                                    <div className="flex items-center mt-2 text-sm">
                                        <span className="text-gray-500 mr-2">Assigned to:</span>
                                        <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200 shadow-sm">
                                            {result.account_code} - {result.account_name}
                                        </span>
                                    </div>

                                    {result.reasoning && (
                                        <div className="mt-3 text-xs text-gray-600 bg-white p-3 rounded border border-gray-200">
                                            <span className="font-bold text-gray-400 uppercase tracking-wider block mb-1">Rationale</span>
                                            {result.reasoning}
                                        </div>
                                    )}

                                    {result.confidence && (
                                        <div className="mt-2 text-[10px] text-gray-400 flex items-center justify-end">
                                            Confidence: {(result.confidence * 100).toFixed(0)}%
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                            <button
                                onClick={() => setIsResultsModalOpen(false)}
                                className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors shadow-lg"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default CashLedger;
