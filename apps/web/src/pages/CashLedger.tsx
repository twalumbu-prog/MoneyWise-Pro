import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cashbookService, CashbookEntry } from '../services/cashbook.service';
import { Layout } from '../components/Layout';
import {
    User,
    Receipt,
    Calendar,
    Lock,
    PlusCircle,
    Sparkles,
    X,
    Search,
    Filter,
    ArrowDownUp,
    Smartphone,
    Coins,
    Wallet,
    Building2,
    ChevronRight,
    Loader2,
    AlertCircle,
    Info,
    CheckCircle,
    CheckCircle2,
    Clock,
    RotateCcw,
    Check,
    RefreshCw,
    AlertTriangle,
    MessageSquare
} from 'lucide-react';
import '../styles/cashbook.css';
import CloseBalanceModal from '../components/CloseBalanceModal';
import CashInflowModal from '../components/CashInflowModal';
import { useAuth } from '../context/AuthContext';
import { integrationService } from '../services/integration.service';
import { getStatusConfig } from '../services/requisition.service';

const CashLedger: React.FC = () => {
    const navigate = useNavigate();
    const [entries, setEntries] = useState<CashbookEntry[]>([]);
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [startDate, setStartDate] = useState(
        new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedAccountType, setSelectedAccountType] = useState<'CASH' | 'AIRTEL_MONEY' | 'BANK' | 'MONEYWISE_WALLET'>('MONEYWISE_WALLET');
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
    const [isInflowModalOpen, setIsInflowModalOpen] = useState(false);
    const [isClassifying, setIsClassifying] = useState(false);
    const [classificationResults, setClassificationResults] = useState<any[]>([]);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

    // Search, Sort, and Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_HIGH' | 'AMOUNT_LOW'>('DATE_DESC');
    const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
    const [filterAccount, setFilterAccount] = useState<string>('ALL');

    const { userRole } = useAuth();
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

    const groupedEntries = React.useMemo(() => {
        const groups: { month: string, entries: CashbookEntry[] }[] = [];
        processedEntries.forEach(entry => {
            const date = new Date(entry.date);
            const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' }).replace(' ', ' · ');
            let group = groups.find(g => g.month === monthYear);
            if (!group) {
                group = { month: monthYear, entries: [] };
                groups.push(group);
            }
            group.entries.push(entry);
        });
        return groups;
    }, [processedEntries]);

    const formatCurrency = (amount: number) => {
        return `K${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getEntryStatus = (entry: CashbookEntry) => {
        if (entry.entry_type === 'CLOSING_BALANCE') return <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200"><Lock size={10} className="mr-1" /> Closed</span>;
        if (entry.entry_type === 'OPENING_BALANCE') return <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">Opening</span>;
        if (entry.entry_type !== 'DISBURSEMENT' || !entry.requisitions) return null;

        const status = entry.requisitions.status;
        const config = getStatusConfig(status);

        const getStatusIcon = (iconType: string) => {
            switch (iconType) {
                case 'clock': return <Clock size={12} className="text-blue-500" />;
                case 'check-circle': return <CheckCircle2 size={12} className="text-[#006AFF]" />;
                case 'check': return <Check size={12} className="text-emerald-500" />;
                case 'alert': return <AlertCircle size={12} className="text-red-500" />;
                case 'rotate': return <RotateCcw size={12} className="text-gray-400" />;
                default: return <Clock size={12} className="text-gray-400" />;
            }
        };

        return (
            <div className="flex items-center bg-white pl-2 pr-3 py-1 rounded-full border border-gray-100 shadow-sm transition-all hover:border-gray-200 hover:shadow-md w-fit">
                {getStatusIcon(config.iconType)}
                <span className="text-[10px] font-black text-brand-navy uppercase tracking-[0.15em] ml-1.5">
                    {config.label}
                </span>
            </div>
        );
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
                {/* Meta details Header */}
                <div className="flex flex-wrap items-center justify-between gap-8 mb-6 pb-6 border-b border-gray-100/50">
                    <div className="flex flex-wrap items-center gap-8">
                        <div>
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Processed For / Requestor</div>
                            <div className="flex items-center text-sm font-bold text-gray-900">
                                <div className="p-1.5 bg-brand-pink/5 rounded-lg mr-2.5">
                                    <User size={14} className="text-brand-pink" />
                                </div>
                                {req.requestor?.name || 'System Ledger Entry'}
                            </div>
                        </div>
                        
                        {req.qb_sync_status && (
                            <div>
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">QuickBooks Ledger Sync</div>
                                <div className={`text-[11px] font-black uppercase flex items-center ${
                                    req.qb_sync_status === 'SUCCESS' ? 'text-[#006AFF]' : 
                                    req.qb_sync_status === 'FAILED' ? 'text-rose-600' : 'text-gray-400'
                                }`}>
                                    <div className={`w-2 h-2 rounded-full mr-2.5 ${
                                        req.qb_sync_status === 'SUCCESS' ? 'bg-[#006AFF] shadow-[0_0_8px_rgba(0,106,255,0.4)]' : 
                                        req.qb_sync_status === 'FAILED' ? 'bg-rose-500' : 'bg-gray-400'
                                    }`} />
                                    {req.qb_sync_status}
                                </div>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/requisitions?id=${req.id}`);
                        }}
                        className="flex items-center px-4 py-2.5 bg-[#006AFF] hover:bg-[#004BB5] text-white rounded-xl text-[11px] font-bold transition-all shadow-sm shadow-blue-100 uppercase tracking-widest"
                    >
                        <MessageSquare size={14} className="mr-2" strokeWidth={2.5} />
                        Requisition Chat
                    </button>
                </div>

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
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                                        req.status === 'ACCOUNTED' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-100 text-gray-600 border-gray-200'
                                                    }`}>
                                                        {item.accounts.code}
                                                    </span>
                                                    <span className="ml-1.5 text-[10px] text-gray-400 truncate max-w-[150px]">
                                                        {item.accounts.name}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="mt-1 flex items-center text-[#006AFF] text-[10px] font-medium animate-pulse">
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
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-[#006AFF]/10 border-t-[#006AFF] rounded-full animate-spin" />
                        <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#006AFF] animate-pulse" size={24} strokeWidth={2.5} />
                    </div>
                    <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] text-gray-400 animate-pulse">
                        Synchronizing Ledger
                    </p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout noPadding={true}>
            {/* ============ MOBILE LAYOUT ============ */}
            <div className="md:hidden flex flex-col min-h-screen bg-white pt-6">



                {/* Mobile Wallet Cards - Horizontal Swipeable */}
                <div className="flex overflow-x-auto no-scrollbar gap-4 pb-6 px-6 scroll-px-6" style={{ scrollSnapType: 'x mandatory' }}>
                    {[
                        { id: 'MONEYWISE_WALLET', name: 'MoneyWise Wallet', icon: Wallet },
                        { id: 'CASH', name: 'Cash Account', icon: Coins },
                        { id: 'AIRTEL_MONEY', name: 'Airtel Money', icon: Smartphone },
                        { id: 'BANK', name: 'Bank Account', icon: Building2 },
                    ].map((acc) => {
                        const isActive = selectedAccountType === acc.id;
                        return (
                            <button
                                key={acc.id}
                                onClick={() => setSelectedAccountType(acc.id as any)}
                                style={{ scrollSnapAlign: 'start', minWidth: '65vw', maxWidth: '65vw' }}
                                className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all duration-300 flex-shrink-0 ${
                                    isActive
                                        ? 'bg-white border-[#006AFF]'
                                        : 'bg-gray-50 border-transparent'
                                }`}
                            >
                                {/* Card Icon + Name */}
                                <div className="flex items-center mb-2">
                                    <Wallet size={12} className={isActive ? 'text-[#006AFF]' : 'text-gray-400'} strokeWidth={3} />
                                    <span className={`ml-2 text-[10px] font-bold uppercase tracking-widest ${
                                        isActive ? 'text-[#006AFF]' : 'text-gray-400'
                                    }`}>{acc.name}</span>
                                </div>

                                {/* Balance */}
                                <div className={`text-xl font-black tracking-tight mb-3 ${
                                    isActive ? 'text-brand-navy' : 'text-gray-400'
                                }`}>
                                    {isActive ? formatCurrency(balance) : formatCurrency(0)}
                                </div>

                                {/* Deposit Button - Only on active card for admins */}
                                {isActive && !isRequestor && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsInflowModalOpen(true); }}
                                        className="w-full flex items-center justify-center py-2.5 rounded-full border border-gray-200 text-[12px] font-bold text-brand-navy bg-white transition-all active:bg-gray-50"
                                    >
                                        <PlusCircle size={14} className="mr-2" strokeWidth={2.5} />
                                        Deposit Funds
                                    </button>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Mobile Toolbar: Search, Filter, Date */}
                <div className="px-6 pb-4 flex items-center gap-3 border-b border-gray-50">
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2.5} />
                        <input
                            type="text"
                            placeholder="Search transactions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-[13px] font-medium text-brand-navy placeholder:text-gray-400 focus:outline-none"
                        />
                    </div>
                    <button
                        onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                        className={`p-2.5 rounded-2xl border transition-colors ${
                            isFilterMenuOpen ? 'bg-[#F0F7FF] border-[#006AFF]/20 text-[#006AFF]' : 'bg-gray-50 border-gray-100 text-gray-400'
                        }`}
                    >
                        <Filter size={17} strokeWidth={2.5} />
                    </button>
                    <button
                        onClick={() => setSortBy(sortBy === 'DATE_DESC' ? 'DATE_ASC' : 'DATE_DESC')}
                        className="p-2.5 rounded-2xl border bg-gray-50 border-gray-100 text-gray-400"
                    >
                        <ArrowDownUp size={17} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Mobile Filter Menu */}
                {isFilterMenuOpen && (
                    <div className="mx-6 mb-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-3">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5">Department</span>
                            <select
                                value={filterDepartment}
                                onChange={(e) => setFilterDepartment(e.target.value)}
                                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:outline-none"
                            >
                                <option value="ALL">All Departments</option>
                                {uniqueDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={() => { setFilterDepartment('ALL'); setFilterAccount('ALL'); setSearchQuery(''); }}
                            className="text-[10px] font-black uppercase tracking-widest text-[#006AFF] text-left"
                        >
                            Reset Filters
                        </button>
                    </div>
                )}

                {/* Mobile Transaction List (Grouped by Month) */}
                <div className="flex-1 bg-white">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-24">
                            <div className="w-10 h-10 border-4 border-[#006AFF]/10 border-t-[#006AFF] rounded-full animate-spin" />
                            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 animate-pulse">Syncing Ledger</p>
                        </div>
                    )}

                    {!loading && groupedEntries.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24">
                            <div className="p-5 bg-gray-50 rounded-full mb-4">
                                <Receipt className="h-10 w-10 text-gray-300" strokeWidth={1.5} />
                            </div>
                            <p className="text-gray-900 font-bold">No transactions found</p>
                            <p className="text-sm text-gray-400 mt-1">Try adjusting your date range or filters.</p>
                        </div>
                    )}

                    {!loading && groupedEntries.map((group) => (
                        <div key={group.month}>
                            {/* Month Group Header */}
                            <div className="px-6 py-3 bg-gray-50 border-y border-gray-100">
                                <span className="text-[11px] font-bold text-gray-500">{group.month}</span>
                            </div>

                            {/* Transaction Rows */}
                            <div className="divide-y divide-gray-50">
                                {group.entries.map((entry) => {
                                    const isOutflow = entry.credit > 0;
                                    const amount = isOutflow ? entry.credit : entry.debit;
                                    const refNum = entry.reference_number || entry.requisitions?.reference_number;
                                    const description = entry.requisitions?.description || entry.description;
                                    const date = new Date(entry.date);
                                    const dayNum = date.getDate().toString().padStart(2, '0');
                                    const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();

                                    return (
                                        <div
                                            key={entry.id}
                                            className="px-6 py-5 flex items-start justify-between active:bg-gray-50 transition-colors"
                                            onClick={() => entry.requisition_id && toggleRow(entry.id)}
                                        >
                                            {/* Left: Date Column */}
                                            <div className="flex flex-col items-center mr-4 pt-0.5" style={{ minWidth: '32px' }}>
                                                <span className="text-[15px] font-black text-brand-navy leading-none">{dayNum}</span>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{month}</span>
                                            </div>

                                            {/* Middle: Description + Ref */}
                                            <div className="flex-1 mr-4">
                                                <p className="text-[14px] font-semibold text-brand-navy leading-tight line-clamp-1">
                                                    {description}
                                                </p>
                                                {refNum && (
                                                    <p className="text-[11px] font-normal text-gray-400 mt-0.5 uppercase tracking-tight">
                                                        {refNum}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Right: Amount + Closing Balance */}
                                            <div className="flex flex-col items-end">
                                                <span className={`text-[14px] font-semibold leading-tight ${
                                                    isOutflow ? 'text-rose-600' : 'text-emerald-600'
                                                }`}>
                                                    {isOutflow ? '-' : '+'}{formatCurrency(amount)}
                                                </span>
                                                <span className="text-[11px] font-normal text-gray-400 mt-0.5">
                                                    {formatCurrency(entry.balance_after)}
                                                </span>
                                            </div>

                                            <ChevronRight 
                                                size={14} 
                                                className={`ml-2 mt-1 flex-shrink-0 transition-opacity ${entry.requisition_id ? 'text-gray-300' : 'text-gray-200 opacity-50'}`} 
                                                strokeWidth={2.5} 
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ============ DESKTOP LAYOUT ============ */}
            <div className="hidden md:block">
            <div className="space-y-8 pb-4">
                {/* Account Selection Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { id: 'MONEYWISE_WALLET', name: 'MoneyWise Wallet', icon: Wallet, color: 'text-[#006AFF]', bg: 'bg-[#006AFF]/5', border: 'border-[#006AFF]/20' },
                        { id: 'CASH', name: 'Cash Account', icon: Coins, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
                        { id: 'AIRTEL_MONEY', name: 'Airtel Money', icon: Smartphone, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100' },
                        { id: 'BANK', name: 'Bank Account', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' }
                    ].map((acc) => {
                        const isActive = selectedAccountType === acc.id;
                        return (
                            <button
                                key={acc.id}
                                onClick={() => setSelectedAccountType(acc.id as any)}
                                className={`relative p-6 rounded-[24px] border-2 text-left transition-all duration-300 group ${
                                    isActive 
                                        ? 'bg-white border-[#006AFF] shadow-[0_8px_30px_rgba(0,0,0,0.04)]' 
                                        : 'bg-white border-transparent hover:border-gray-100'
                                }`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`p-3 rounded-2xl ${isActive ? 'bg-gray-50' : acc.bg} ${isActive ? 'text-gray-900' : acc.color} transition-colors duration-300`}>
                                        <acc.icon size={20} strokeWidth={2.5} />
                                    </div>
                                </div>
                                <div>
                                    <span className={`text-[11px] font-bold uppercase tracking-widest block mb-1 ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                        {acc.name}
                                    </span>
                                    <div className="flex items-baseline gap-1">
                                        <span className={`text-2xl font-black tracking-tight ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                                            {formatCurrency(isActive ? balance : 0).split('.')[0]}
                                        </span>
                                        <span className={`text-sm font-bold opacity-60 ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                            .{formatCurrency(isActive ? balance : 0).split('.')[1] || '00'}
                                        </span>
                                    </div>
                                </div>
                                {!isActive && (
                                    <div className="absolute inset-0 bg-gray-50/40 opacity-0 group-hover:opacity-100 rounded-[24px] transition-opacity pointer-events-none" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Minimalist Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-50">
                    <div className="flex items-center space-x-2">
                        {!isRequestor && (
                            <button
                                onClick={() => setIsInflowModalOpen(true)}
                                className="bg-[#000000] hover:bg-gray-800 text-white px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                            >
                                <PlusCircle size={14} className="mr-2" strokeWidth={3} />
                                Deposit Funds
                            </button>
                        )}
                        
                        {selectedAccountType !== 'MONEYWISE_WALLET' && (
                            <button
                                onClick={() => setIsCloseModalOpen(true)}
                                className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                            >
                                <Lock size={14} className="mr-2 text-gray-400" />
                                Close Balance
                            </button>
                        )}

                        {unclassifiedCount > 0 && (
                            <button
                                onClick={handleBulkClassify}
                                disabled={isClassifying}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center disabled:opacity-50"
                            >
                                <Sparkles size={14} className={`mr-2 ${isClassifying ? 'animate-spin' : ''}`} />
                                {isClassifying ? 'Classifying...' : `Classify AI (${unclassifiedCount})`}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center px-2">
                            <div className="relative group">
                                <Search size={18} strokeWidth={2.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent pl-9 pr-4 py-2 text-xs font-bold text-gray-600 focus:outline-none w-[120px] transition-all focus:w-[200px]"
                                />
                            </div>
                            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
                            <button 
                                onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                                className={`p-2 transition-colors rounded-xl hover:bg-white hover:shadow-sm ${isFilterMenuOpen || filterDepartment !== 'ALL' || filterAccount !== 'ALL' ? 'text-[#006AFF]' : 'text-gray-400'}`}
                            >
                                <Filter size={18} strokeWidth={2.5} />
                            </button>
                            <button 
                                className="p-2 text-gray-400 hover:text-gray-900 transition-colors rounded-xl hover:bg-white hover:shadow-sm"
                                onClick={() => setSortBy(sortBy === 'DATE_DESC' ? 'DATE_ASC' : 'DATE_DESC')}
                            >
                                <ArrowDownUp size={18} strokeWidth={2.5} />
                            </button>
                            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
                            <div className="flex items-center pl-1 pr-2">
                                <Calendar size={18} className="text-gray-400 mr-2" strokeWidth={2.5} />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-transparent text-[11px] font-bold text-gray-600 focus:outline-none w-[90px] cursor-pointer"
                                />
                                <span className="mx-1 text-gray-300 font-bold">-</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-transparent text-[11px] font-bold text-gray-600 focus:outline-none w-[90px] cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

                {/* Filter Menu (Sub-toolbar) */}
                {isFilterMenuOpen && (
                    <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm animate-in slide-in-from-top-2 duration-200">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Department</span>
                            <select
                                value={filterDepartment}
                                onChange={(e) => setFilterDepartment(e.target.value)}
                                className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none shadow-sm min-w-[150px]"
                            >
                                <option value="ALL">All Departments</option>
                                {uniqueDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Category Account</span>
                            <select
                                value={filterAccount}
                                onChange={(e) => setFilterAccount(e.target.value)}
                                className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none shadow-sm min-w-[150px]"
                            >
                                <option value="ALL">All Accounts</option>
                                {uniqueAccounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                            </select>
                        </div>
                        <button 
                            onClick={() => { setFilterDepartment('ALL'); setFilterAccount('ALL'); setSearchQuery(''); }}
                            className="mt-auto px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#006AFF] hover:bg-[#006AFF]/5 rounded-xl transition-colors"
                        >
                            Reset
                        </button>
                    </div>
                )}


                <div className="shadow-sm border border-gray-100 rounded-[32px] overflow-x-auto bg-white mt-8">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white border-b border-gray-50">
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest">Date</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest max-w-[400px]">Txn Details</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest">Status</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-center">Category</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Inflow</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Outflow</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Balance</th>
                                <th className="p-6 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {groupedEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-24 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="p-5 bg-gray-50 rounded-full mb-4">
                                                <Receipt className="h-10 w-10 text-gray-300" strokeWidth={1.5} />
                                            </div>
                                            <p className="text-gray-900 font-bold">No transactions found</p>
                                            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search query.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                groupedEntries.map((group) => (
                                    <React.Fragment key={group.month}>
                                        <tr className="bg-gray-50/50">
                                            <td colSpan={8} className="px-6 py-3 border-y border-gray-100/50">
                                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
                                                    {group.month}
                                                </span>
                                            </td>
                                        </tr>
                                        {group.entries.map((entry) => (
                                            <React.Fragment key={entry.id}>
                                                <tr
                                                    className={`transition-all group cursor-pointer 
                                                        ${expandedRows[entry.id] ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                                                    onClick={() => entry.requisition_id && toggleRow(entry.id)}
                                                >
                                                    <td className="p-6">
                                                        <div className="text-sm font-bold text-gray-900">
                                                            {new Date(entry.date).getDate()}
                                                        </div>
                                                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-0.5">
                                                            {new Date(entry.date).toLocaleString('default', { weekday: 'short' })}
                                                        </div>
                                                    </td>
                                                    <td className="p-6 max-w-[400px]">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2 font-bold text-gray-900 overflow-hidden">
                                                                <div className="text-[14px] line-clamp-1 flex items-center overflow-hidden">
                                                                    {(entry.reference_number || entry.requisitions?.reference_number || entry.requisition_id) && (
                                                                        <span className="px-2 py-0.5 rounded-md bg-blue-50/50 text-[#006AFF] font-medium text-[11px] mr-2 flex-shrink-0">
                                                                            #{entry.reference_number || entry.requisitions?.reference_number || entry.requisition_id?.slice(0, 8)}
                                                                        </span>
                                                                    )}
                                                                    <span className="truncate flex-1">{entry.requisitions?.description || entry.description}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-6">
                                                        {getEntryStatus(entry)}
                                                    </td>
                                                    <td className="p-6 text-center">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                            entry.entry_type === 'DISBURSEMENT' ? 'bg-transparent text-gray-400 border border-gray-200' :
                                                            entry.entry_type === 'RETURN' || entry.entry_type === 'INFLOW' ? 'bg-transparent text-gray-400 border border-gray-200' :
                                                            entry.entry_type === 'ADJUSTMENT' ? 'bg-purple-50 text-purple-600/70 border border-purple-100' :
                                                            'bg-gray-50 text-gray-400 border border-gray-100'
                                                        }`}>
                                                            {entry.entry_type === 'DISBURSEMENT' ? 'Expense' :
                                                             entry.entry_type === 'INFLOW' ? 'Inflow' : 
                                                             (entry.entry_type || 'Account').replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        {entry.debit > 0 ? (
                                                            <span className="text-[14px] font-black text-gray-900">
                                                                {formatCurrency(entry.debit).replace('K', '')}
                                                            </span>
                                                        ) : <span className="text-gray-200">-</span>}
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        {entry.credit > 0 ? (
                                                            <span className="text-[14px] font-black text-rose-600">
                                                                - {formatCurrency(entry.credit).replace('K', '')}
                                                            </span>
                                                        ) : <span className="text-gray-200">-</span>}
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        <span className="text-[14px] font-black text-gray-900">
                                                            {formatCurrency(entry.balance_after).replace('K', '')}
                                                        </span>
                                                    </td>
                                                    <td className="p-6 w-12 text-center">
                                                        {entry.requisition_id && (
                                                            <ChevronRight size={16} className={`text-gray-300 group-hover:text-gray-400 transition-transform ${expandedRows[entry.id] ? 'rotate-90' : ''}`} strokeWidth={2.5} />
                                                        )}
                                                    </td>
                                                </tr>
                                                {expandedRows[entry.id] && entry.requisition_id && (
                                                    <tr className="bg-gray-50/80">
                                                        <td colSpan={8} className="p-0 border-b border-gray-100">
                                                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                                {renderBreakdown(entry)}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                </div>

            {/* Classification Results Modal */}
            {isResultsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-100">
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 flex items-center tracking-tight">
                                    <div className="p-2 bg-amber-50 rounded-xl mr-3" />
                                    Classification Results
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsResultsModalOpen(false)}
                                className="p-3 hover:bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-900 transition-all border border-transparent hover:border-gray-100"
                            >
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/30">
                            {classificationResults.map((result: any, index: number) => (
                                <div key={index} className="bg-white rounded-[24px] p-6 border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-gray-200">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="font-bold text-gray-900 text-[15px]">{result.description}</div>
                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                            result.method === 'RULE' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                                        }`}>
                                            {result.method === 'RULE' ? 'Rule Match' : 'AI Analysis'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-8 border-t border-gray-50 bg-white flex justify-end">
                            <button
                                onClick={() => setIsResultsModalOpen(false)}
                                className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-gray-200"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shared Modals (both layouts) */}
            <CloseBalanceModal
                isOpen={isCloseModalOpen}
                onClose={() => setIsCloseModalOpen(false)}
                onSuccess={() => {
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
                initialInflowType={selectedAccountType === 'MONEYWISE_WALLET' ? 'WALLET' : 'CASH'}
                isReadOnlyType={selectedAccountType === 'MONEYWISE_WALLET'}
            />
        </Layout>
    );
};

export default CashLedger;
