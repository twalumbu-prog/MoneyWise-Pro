import React, { useState, useEffect, useRef } from 'react';
import { cashbookService, CashbookEntry } from '../services/cashbook.service';
import { Layout } from '../components/Layout';
import {
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
    ChevronDown,
    Loader2,
    AlertCircle,
    Info,
    CheckCircle2,
    Clock,
    RotateCcw,
    Check,
    RefreshCw,
    AlertTriangle,
    Download
} from 'lucide-react';
import '../styles/cashbook.css';
import CloseBalanceModal from '../components/CloseBalanceModal';
import CashInflowModal from '../components/CashInflowModal';
import { useAuth } from '../context/AuthContext';
import { getStatusConfig, requisitionService } from '../services/requisition.service';
import { accountService, Account } from '../services/account.service';
import RequisitionModal from '../components/requisitions/RequisitionModal';
import { Requisition } from '../services/requisition.service';
import ExportLedgerModal from '../components/ExportLedgerModal';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/export.utils';


const SearchableAccountSelect: React.FC<{
    value: string;
    options: any[];
    onChange: (value: string) => void;
    placeholder?: string;
}> = ({ value, options, onChange, placeholder = "Select account..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt => 
        (opt.name || "").toLowerCase().includes(search.toLowerCase()) || 
        (opt.code || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative w-full max-w-[280px]" ref={dropdownRef}>
            <div 
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`flex items-center justify-between px-3 py-2 bg-gray-50/50 border rounded-xl cursor-pointer transition-all text-xs font-medium
                    ${isOpen ? 'border-blue-400 ring-4 ring-blue-50 bg-white' : 'border-gray-100 hover:border-blue-200'}`}
            >
                <span className={`truncate mr-2 ${selectedOption ? 'text-gray-900 font-bold' : 'text-gray-400'}`}>
                    {selectedOption ? `${selectedOption.code} · ${selectedOption.name}` : placeholder}
                </span>
                <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div 
                    className="absolute z-[100] w-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                    style={{ minWidth: '300px' }}
                >
                    <div className="p-2 border-b border-gray-50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search accounts..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-gray-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-gray-400 font-medium"
                            />
                        </div>
                    </div>
                    <div className="max-h-[240px] overflow-y-auto p-1 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => {
                                        onChange(opt.id);
                                        setIsOpen(false);
                                        setSearch("");
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors flex flex-col gap-0.5
                                        ${value === opt.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                    <span className="font-bold">{opt.name}</span>
                                    <span className="text-[10px] opacity-60 tracking-wider uppercase font-black">{opt.code}</span>
                                </button>
                            ))
                        ) : (
                            <div className="p-4 text-center text-gray-400 text-xs">No accounts found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


const CashLedger: React.FC = () => {
    const [entries, setEntries] = useState<CashbookEntry[]>([]);
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [postingReview, setPostingReview] = useState<{
        type: 'INFLOW' | 'REQUISITION';
        data: any;
        entry?: CashbookEntry;
    } | null>(null);
    const [isPosting, setIsPosting] = useState(false);
    const [postSuccess, setPostSuccess] = useState<{
        qbId: string;
        type: string;
    } | null>(null);
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
    const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);
    const [isRequisitionModalOpen, setIsRequisitionModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);

    // Search, Sort, and Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_HIGH' | 'AMOUNT_LOW'>('DATE_DESC');
    const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
    const [filterAccount, setFilterAccount] = useState<string>('ALL');

    const { userRole } = useAuth();
    const isRequestor = userRole === 'REQUESTOR';

    useEffect(() => {
        loadData();
        loadAccounts();
    }, [startDate, endDate, selectedAccountType]);

    const loadAccounts = async () => {
        try {
            const data = await accountService.getAll();
            setAccounts(data);
        } catch (error) {
            console.error('Failed to load accounts:', error);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
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

    const handleExport = async (format: 'csv' | 'xlsx' | 'pdf', exportStartDate: string, exportEndDate: string) => {
        try {
            const exportEntries = await cashbookService.getEntries({ startDate: exportStartDate, endDate: exportEndDate, accountType: selectedAccountType });
            
            const period = { start: exportStartDate, end: exportEndDate };
            const filename = `Cash_Ledger_${selectedAccountType}_${exportStartDate}_to_${exportEndDate}`;

            if (format === 'csv') {
                exportToCSV(exportEntries, filename);
            } else if (format === 'xlsx') {
                exportToExcel(exportEntries, filename, period);
            } else if (format === 'pdf') {
                exportToPDF(exportEntries, filename, period);
            }
        } catch (error) {
            console.error('Failed to export ledger:', error);
            alert('Failed to generate export. Please try again.');
        }
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
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
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                if (entry.requisitions?.status === 'COMPLETED' && entry.requisitions.line_items) {
                    const unclassifiedItems = entry.requisitions.line_items.filter((item: any) => !item.accounts);
                    if (unclassifiedItems.length > 0) count++;
                }
            });
        }
        return count;
    };

    const unclassifiedCount = countUnclassified();

    // Derived State for Filters
    const uniqueDepartments = React.useMemo(() => {
        const depts = new Set<string>();
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                if (entry.requisitions?.department) {
                    depts.add(entry.requisitions.department);
                }
            });
        }
        return Array.from(depts).sort();
    }, [entries]);

    const uniqueAccounts = React.useMemo(() => {
        const accs = new Set<string>();
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                entry.requisitions?.line_items?.forEach((item: any) => {
                    if (item.accounts?.name) {
                        accs.add(item.accounts.name);
                    }
                });
            });
        }
        return Array.from(accs).sort();
    }, [entries]);

    // Processed Data (Search, Filter, Sort)
    const processedEntries = React.useMemo(() => {
        if (!Array.isArray(entries)) return [];
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
        if (entry.entry_type === 'CLOSING_BALANCE') return <span className="inline-flex items-center text-[10px] font-normal uppercase tracking-wider text-slate-700"><Lock size={10} className="mr-1" /> Closed</span>;
        if (entry.entry_type === 'OPENING_BALANCE') return <span className="inline-flex items-center text-[10px] font-normal uppercase tracking-wider text-indigo-700">Opening</span>;
        let status = '';
        if (entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') {
            status = entry.qb_sync_status === 'SUCCESS' || entry.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.status || 'PENDING';
        } else if (entry.entry_type === 'DISBURSEMENT' && entry.requisitions) {
            status = entry.requisitions.qb_sync_status === 'SUCCESS' || entry.requisitions.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.requisitions.status;
        } else {
            return null;
        }
        const config = getStatusConfig(status);

        const getStatusIcon = (iconType: string, color: string) => {
            const colorClass = color === 'blue' ? 'text-[#006AFF]' : 
                               color === 'emerald' ? 'text-emerald-500' :
                               color === 'amber' ? 'text-amber-500' :
                               color === 'red' ? 'text-red-500' :
                               color === 'purple' ? 'text-purple-500' : 'text-gray-400';

            switch (iconType) {
                case 'clock': return <Clock size={12} className={colorClass} />;
                case 'check-circle': return <CheckCircle2 size={12} className={colorClass} />;
                case 'check': return <Check size={12} className={colorClass} />;
                case 'alert': return <AlertCircle size={12} className={colorClass} />;
                case 'rotate': return <RotateCcw size={12} className={colorClass} />;
                default: return <Clock size={12} className={colorClass} />;
            }
        };

        return (
            <div className="flex items-center w-fit">
                {getStatusIcon(config.iconType, config.color)}
                <span className="text-[10px] font-normal uppercase tracking-[0.15em] ml-1.5 text-gray-900">
                    {config.label}
                </span>
            </div>
        );
    };

    const handlePostToQB = async (req: any, entry: CashbookEntry) => {
        setPostingReview({
            type: 'REQUISITION',
            data: req,
            entry
        });
    };

    const handleAccountChange = async (lineItemId: string, accountId: string) => {
        try {
            await requisitionService.updateLineItemAccount(lineItemId, accountId);
            loadData();
        } catch (error: any) {
            alert('Failed to update account: ' + error.message);
        }
    };

    const handleLedgerAccountChange = async (entryId: string, accountId: string) => {
        try {
            await cashbookService.updateAccount(entryId, accountId);
            loadData();
        } catch (error: any) {
            alert('Failed to update account: ' + error.message);
        }
    };

    const confirmPostRequisition = async (req: any) => {
        try {
            setIsPosting(true);
            const result = await requisitionService.postToQuickBooks(req.id, {
                payment_account_id: 'CASH_ACCOUNT_ID', 
                payment_account_name: 'Cash on hand'
            });
            setPostSuccess({ qbId: result.qb_expense_id, type: 'Expense' });
            setPostingReview(null);
            loadData();
        } catch (error: any) {
            alert('Failed to post to QuickBooks: ' + error.message);
        } finally {
            setIsPosting(false);
        }
    };


    const handleApproveCategorization = async (requisitionId: string) => {
        try {
            await requisitionService.approveCategorization(requisitionId);
            alert('Categorization approved successfully!');
            loadData();
        } catch (error: any) {
            alert('Failed to approve categorization: ' + error.message);
        }
    };


    const handlePostLedgerToQB = async (entry: CashbookEntry) => {
        setPostingReview({
            type: 'INFLOW',
            data: entry,
            entry
        });
    };

    const confirmPostLedger = async (entry: CashbookEntry) => {
        try {
            setIsPosting(true);
            const result = await cashbookService.postToQuickBooks(entry.id, entry.account_id!);
            if (result.success) {
                setPostSuccess({ qbId: result.qbId, type: entry.entry_type === 'INFLOW' ? 'Deposit' : 'Journal Entry' });
                setPostingReview(null);
                loadData();
            } else {
                alert('Failed to post: ' + (result.error?.Message || result.error || 'Unknown error'));
            }
        } catch (error: any) {
            alert('Failed to post to QuickBooks: ' + error.message);
        } finally {
            setIsPosting(false);
        }
    };

    const renderBreakdown = (entry: CashbookEntry) => {
        // Case 1: Requisition Breakdown (Expenses)
        if (entry.requisition_id && entry.requisitions) {
            const req = entry.requisitions;
            const items = req.line_items || [];
            const disbursement = req.disbursements?.[0];

            const actualExpenditure = items.length > 0
                ? items.reduce((acc: number, item: any) => acc + Number(item.actual_amount ?? item.estimated_amount ?? 0), 0)
                : Number(req.actual_total ?? 0);

            const confirmedChange = Number(disbursement?.confirmed_change_amount || 0);
            const totalPrepared = Number(disbursement?.total_prepared || entry.credit || 0);

            const discrepancy = totalPrepared - actualExpenditure - confirmedChange;
            const expectedChange = totalPrepared - actualExpenditure;

            const handleViewDetails = (entry: any) => {
                const requisitionId = entry.requisition_id || entry.requisitions?.id;
                
                if (!requisitionId) {
                    console.warn('No requisition ID found for this entry');
                    return;
                }

                setSelectedRequisition({
                    id: requisitionId,
                    reference_number: entry.requisitions?.reference_number || 'N/A',
                    description: entry.requisitions?.description || entry.description,
                    status: entry.requisitions?.status || 'COMPLETED',
                    total_amount: entry.requisitions?.actual_total || entry.debit || entry.credit || 0
                } as any);
                setIsRequisitionModalOpen(true);
            };

            return (
                <div className="details-content redesign animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-100">
                        <div className="flex flex-wrap items-center gap-4">
                            <button 
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    handleViewDetails(entry);
                                }}
                                className="flex items-center px-5 py-2.5 bg-brand-navy hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest"
                            >
                                <Info size={14} className="mr-2" />
                                View Full Details
                            </button>
                            
                            {(req.status === 'EXPENSED' || req.status === 'DISBURSED' || req.status === 'RECEIVED') && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const allItemsHaveAccount = items.every((item: any) => !!item.account_id);
                                        if (!allItemsHaveAccount) {
                                            alert('Please categorize all line items before approving');
                                            return;
                                        }
                                        handleApproveCategorization(req.id);
                                    }}
                                    className="flex items-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest"
                                >
                                    <CheckCircle2 size={14} className="mr-2" />
                                    Approve Categorization
                                </button>
                            )}
                            
                            {(req.status === 'ACCOUNTED' || req.status === 'COMPLETED' || req.status === 'CATEGORIZED') && req.qb_sync_status !== 'SUCCESS' && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePostToQB(req, entry);
                                    }}
                                    className="flex items-center px-5 py-2.5 bg-[#006AFF] hover:bg-[#0052CC] text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest"
                                >
                                    <RefreshCw size={14} className="mr-2" />
                                    Post to QuickBooks
                                </button>
                            )}

                            {req.qb_sync_status === 'SUCCESS' && (
                                <div className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[11px] font-bold uppercase tracking-widest border border-emerald-100/50">
                                    <CheckCircle2 size={14} className="mr-2" />
                                    Posted to QuickBooks
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Reference</span>
                                <span className="text-[13px] font-bold text-brand-navy">{req.reference_number || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Status</span>
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                    req.status === 'ACCOUNTED'
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                        : req.status === 'COMPLETED' || req.status === 'CATEGORIZED'
                                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                        : 'bg-amber-50 text-amber-600 border border-amber-100'
                                }`}>
                                    {req.status === 'CATEGORIZED' ? 'COMPLETED' : req.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Main Breakdown Table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)]">
                        <table className="breakdown-table-modern table-fixed">
                            <thead>
                                <tr>
                                    <th className="text-left w-[30%]">Description</th>
                                    <th className="text-left w-[30%]">Accounting Treatment</th>
                                    <th className="text-center w-[10%]">Qty</th>
                                    <th className="text-right w-[15%]">Expected Total</th>
                                    <th className="text-right w-[15%]">Actual Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Disbursement Row */}
                                <tr className="summary-row cash-distributed bg-slate-50/50">
                                    <td className="font-bold flex items-center">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center mr-3">
                                            <Coins size={12} className="text-slate-600" />
                                        </div>
                                        Actual Cash Disbursed
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-black text-brand-navy text-[14px]">{formatCurrency(totalPrepared)}</td>
                                </tr>
                                
                                {/* Itemized Expenses */}
                                {items.map((item: any, idx: number) => (
                                    <tr key={item.id || idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="pl-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-semibold text-gray-800">{item.description}</span>
                                                <span className="text-[10px] text-gray-400">Line Item #{idx + 1}</span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <SearchableAccountSelect 
                                                value={item.account_id || ''} 
                                                options={accounts} 
                                                onChange={(val) => handleAccountChange(item.id, val)}
                                                placeholder="Categorize expense..."
                                            />
                                        </td>
                                        <td className="text-center text-gray-600 font-medium">{item.quantity || 1}</td>
                                        <td className="text-right text-gray-400 text-[13px]">{formatCurrency(item.estimated_amount)}</td>
                                        <td className="text-right font-black text-gray-900 text-[14px]">{formatCurrency(item.actual_amount ?? item.estimated_amount)}</td>
                                    </tr>
                                ))}

                                {/* Excess Change Row (if any) */}
                                {confirmedChange > 0 && (
                                    <tr className="summary-row change-returned">
                                        <td className="font-bold flex items-center">
                                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center mr-3">
                                                <RotateCcw size={12} className="text-emerald-600" />
                                            </div>
                                            Excess Cash Returned
                                        </td>
                                        <td className="text-center">-</td>
                                        <td className="text-right">{formatCurrency(expectedChange)}</td>
                                        <td className="text-right font-black text-emerald-600 text-[14px]">{formatCurrency(confirmedChange)}</td>
                                    </tr>
                                )}
                                
                                <tr className="summary-row expenditure-row border-t border-gray-100 bg-slate-50/30">
                                    <td className="font-bold flex items-center pl-4 py-4">
                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center mr-3">
                                            <Receipt size={12} className="text-slate-500" />
                                        </div>
                                        Total Actual Expenditure
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-black text-gray-900 text-[14px]">{formatCurrency(actualExpenditure)}</td>
                                </tr>

                                {/* Change Rows */}
                                <tr className="summary-row border-t border-gray-50">
                                    <td className="text-gray-500 font-medium pl-6">Expected Change</td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-bold text-gray-500">{formatCurrency(expectedChange)}</td>
                                </tr>

                                <tr className="summary-row">
                                    <td className="text-gray-800 font-bold flex items-center pl-6">
                                        <Check size={14} className="text-emerald-500 mr-2" />
                                        Actual Change Returned
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-black text-emerald-600 text-[14px]">{formatCurrency(confirmedChange)}</td>
                                </tr>

                                {/* Variance Row */}
                                <tr className={`summary-row border-t-2 ${Math.abs(discrepancy) > 0.01 ? 'bg-rose-50/50' : 'bg-gray-50/30'}`}>
                                    <td className="font-black flex items-center pl-4 py-4">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${Math.abs(discrepancy) > 0.01 ? 'bg-rose-100' : 'bg-gray-100'}`}>
                                            <AlertTriangle size={12} className={Math.abs(discrepancy) > 0.01 ? 'text-rose-600' : 'text-gray-400'} />
                                        </div>
                                        Cash Discrepancy
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className={`text-right font-black text-[15px] ${Math.abs(discrepancy) > 0.01 ? 'text-rose-600' : 'text-gray-400'}`}>
                                        {formatCurrency(discrepancy)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        // Case 2: Inflow, Adjustment, or Non-Requisition Disbursement
        if (entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT' || (entry.entry_type === 'DISBURSEMENT' && !entry.requisition_id)) {

            return (
                <div className="details-content redesign animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-100">
                        <div className="flex flex-wrap items-center gap-4">
                            {entry.qb_sync_status !== 'SUCCESS' ? (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!entry.account_id) {
                                            alert('Please select an accounting account first');
                                            return;
                                        }
                                        handlePostLedgerToQB(entry);
                                    }}
                                    disabled={!entry.account_id}
                                    className={`flex items-center px-5 py-2.5 rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest ${
                                        entry.account_id 
                                            ? 'bg-[#006AFF] hover:bg-[#0052CC] text-white' 
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <RefreshCw size={14} className="mr-2" />
                                    Post to QuickBooks
                                </button>
                            ) : (
                                <div className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[11px] font-bold uppercase tracking-widest border border-emerald-100/50">
                                    <CheckCircle2 size={14} className="mr-2" />
                                    Posted to QuickBooks
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Type</span>
                                <span className="text-[13px] font-bold text-brand-navy">{entry.entry_type}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Status</span>
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                    entry.status === 'ACCOUNTED' || entry.qb_sync_status === 'SUCCESS'
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                        : entry.status === 'COMPLETED'
                                            ? 'bg-blue-50 text-[#006AFF] border border-blue-100'
                                            : 'bg-amber-50 text-amber-600 border border-amber-100'
                                }`}>
                                    {entry.status === 'ACCOUNTED' || entry.qb_sync_status === 'SUCCESS' ? 'ACCOUNTED' : entry.status || 'PENDING'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)]">
                        <table className="breakdown-table-modern table-fixed">
                            <thead>
                                <tr>
                                    <th className="text-left w-[40%]">Description</th>
                                    <th className="text-left w-[40%]">Accounting Account</th>
                                    <th className="text-right w-[20%]">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="hover:bg-gray-50/50 transition-colors">
                                    <td className="pl-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-semibold text-gray-800">{entry.description}</span>
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <SearchableAccountSelect 
                                            value={entry.account_id || ''} 
                                            options={accounts} 
                                            onChange={(val) => handleLedgerAccountChange(entry.id, val)}
                                            placeholder={entry.entry_type === 'INFLOW' ? "Select Credit Account..." : "Select Debit Account..."}
                                        />
                                    </td>
                                    <td className="text-right font-black text-gray-900 text-[14px] pr-6">
                                        {formatCurrency(entry.debit || entry.credit)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        return null;
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
        <Layout noPadding={false}>
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
                            <div
                                key={acc.id}
                                onClick={() => setSelectedAccountType(acc.id as any)}
                                style={{ scrollSnapAlign: 'start', minWidth: '65vw', maxWidth: '65vw' }}
                                className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all duration-300 flex-shrink-0 cursor-pointer ${
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
                            </div>
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
                                            onClick={() => (entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') && toggleRow(entry.id)}
                                        >
                                            {/* Left: Date Column */}
                                            <div className="flex flex-col items-center mr-4 pt-0.5" style={{ minWidth: '32px' }}>
                                                <span className="text-[15px] font-normal text-brand-navy leading-none">{dayNum}</span>
                                                <span className="text-[9px] font-normal text-gray-400 uppercase tracking-wider mt-0.5">{month}</span>
                                            </div>

                                            {/* Middle: Description + Ref + Status */}
                                            <div className="flex-1 mr-4">
                                                <p className="text-[14px] font-medium text-brand-navy leading-tight line-clamp-1">
                                                    {description}
                                                </p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    {getEntryStatus(entry)}
                                                    {refNum && (
                                                        <p className="text-[11px] font-normal text-gray-400 uppercase tracking-tight">
                                                            {refNum}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right: Amount + Closing Balance */}
                                            <div className="flex flex-col items-end">
                                                <span className="text-[14px] font-normal text-gray-900 leading-tight">
                                                    {isOutflow ? '-' : '+'}{formatCurrency(amount)}
                                                </span>
                                                <span className="text-[11px] font-normal text-gray-400 mt-0.5">
                                                    {formatCurrency(entry.balance_after)}
                                                </span>
                                            </div>

                                            <ChevronRight 
                                                size={14} 
                                                className={`ml-2 mt-1 flex-shrink-0 transition-opacity ${entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT' ? 'text-gray-300' : 'text-gray-200 opacity-50'}`} 
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

                        <button
                            onClick={() => setIsExportModalOpen(true)}
                            className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                        >
                            <Download size={14} className="mr-2 text-gray-400" />
                            Export Ledger
                        </button>

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
                            <tr className="bg-white">
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest">Date</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest max-w-[400px]">Txn Details</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Inflow</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Outflow</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Balance</th>
                                <th className="p-6 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="">
                            {groupedEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-24 text-center">
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
                                            <td colSpan={6} className="px-6 py-3">
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
                                                    onClick={() => toggleRow(entry.id)}
                                                >
                                                    <td className="p-6">
                                                        <div className="text-sm font-normal text-gray-900">
                                                            {new Date(entry.date).getDate()}
                                                        </div>
                                                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-0.5">
                                                            {new Date(entry.date).toLocaleString('default', { weekday: 'short' })}
                                                        </div>
                                                    </td>
                                                    <td className="p-6 max-w-[400px]">
                                                        <div className="flex flex-col">
                                                            <div className="text-[14px] font-medium text-gray-900 line-clamp-1 leading-tight">
                                                                {entry.requisitions?.description || entry.description}
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                {getEntryStatus(entry)}
                                                                {(entry.reference_number || entry.requisitions?.reference_number || entry.requisition_id) && (
                                                                    <div className="text-[11px] font-normal text-gray-400 uppercase tracking-tight">
                                                                        #{entry.reference_number || entry.requisitions?.reference_number || entry.requisition_id?.slice(0, 8)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        {entry.debit > 0 ? (
                                                            <span className="text-[14px] font-normal text-gray-900">
                                                                {formatCurrency(entry.debit).replace('K', '')}
                                                            </span>
                                                        ) : <span className="text-gray-200">-</span>}
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        {entry.credit > 0 ? (
                                                            <span className="text-[14px] font-normal text-gray-900">
                                                                - {formatCurrency(entry.credit).replace('K', '')}
                                                            </span>
                                                        ) : <span className="text-gray-200">-</span>}
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        <span className="text-[14px] font-normal text-gray-400">
                                                            {formatCurrency(entry.balance_after).replace('K', '')}
                                                        </span>
                                                    </td>
                                                    <td className="p-6 w-12 text-center">
                                                        {(entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') && (
                                                            <ChevronRight size={16} className={`text-gray-300 group-hover:text-gray-400 transition-transform ${expandedRows[entry.id] ? 'rotate-90' : ''}`} strokeWidth={2.5} />
                                                        )}
                                                    </td>
                                                </tr>
                                                 {expandedRows[entry.id] && (entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') && (
                                                    <tr className="bg-gray-50/80">
                                                        <td colSpan={6} className="p-0">
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

            {/* Review Posting Modal */}
            {postingReview && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="p-10 border-b border-gray-50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Review QuickBooks Posting</h3>
                                    <p className="text-slate-500 text-sm font-medium">Verify the double-entry accounting treatment before syncing.</p>
                                </div>
                                <button
                                    onClick={() => setPostingReview(null)}
                                    className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all"
                                >
                                    <X size={24} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>

                        <div className="p-10 bg-slate-50/30 overflow-y-auto max-h-[50vh]">
                            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                                <table className="w-full border-collapse">
                                    <thead className="sticky top-0 z-10 bg-slate-50">
                                        <tr className="bg-slate-50/50">
                                            <th className="text-left py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Account & Description</th>
                                            <th className="text-right py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] w-32">Debit</th>
                                            <th className="text-right py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] w-32">Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {postingReview.type === 'REQUISITION' ? (
                                            <>
                                                {/* Expense Side */}
                                                {(postingReview.data.line_items || []).map((item: any, i: number) => (
                                                    <tr key={i}>
                                                        <td className="py-5 px-6">
                                                            <div className="font-bold text-slate-900 text-sm">{accounts.find(a => a.id === item.account_id)?.name || 'Uncategorized'}</div>
                                                            <div className="text-[11px] text-slate-400 font-medium">{item.description}</div>
                                                        </td>
                                                        <td className="py-5 px-6 text-right font-bold text-slate-900">{formatCurrency(item.actual_amount ?? item.estimated_amount ?? 0).replace('K', '')}</td>
                                                        <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                    </tr>
                                                ))}
                                                {/* Payment Side */}
                                                <tr>
                                                    <td className="py-5 px-6 pl-10">
                                                        <div className="font-bold text-slate-900 text-sm">MoneyWise Wallet / Cash</div>
                                                        <div className="text-[11px] text-slate-400 font-medium">Payment for {postingReview.data.reference_number}</div>
                                                    </td>
                                                    <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                    <td className="py-5 px-6 text-right font-bold text-rose-600">{formatCurrency(postingReview.entry?.credit || 0).replace('K', '')}</td>
                                                </tr>
                                            </>
                                        ) : (
                                            <>
                                                {/* Directional Logic: If it has a debit, it's an Inflow (Debit Wallet). 
                                                    If it has a credit, it's a Charge/Expense (Credit Wallet). */}
                                                {Number(postingReview.entry?.debit || 0) > 0 ? (
                                                    <>
                                                        {/* Regular Inflow: Debit Wallet, Credit Income Account */}
                                                        <tr>
                                                            <td className="py-5 px-6">
                                                                <div className="font-bold text-slate-900 text-sm">MoneyWise Wallet</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">Inflow receipt</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right font-bold text-emerald-600">{formatCurrency(postingReview.entry?.debit || 0).replace('K', '')}</td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-5 px-6 pl-10">
                                                                <div className="font-bold text-slate-900 text-sm">{accounts.find(a => a.id === postingReview.entry?.account_id)?.name || 'Uncategorized'}</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">{postingReview.entry?.description}</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                            <td className="py-5 px-6 text-right font-bold text-slate-900">{formatCurrency(postingReview.entry?.debit || 0).replace('K', '')}</td>
                                                        </tr>
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Transaction Charge: Debit Expense Account, Credit Wallet */}
                                                        <tr>
                                                            <td className="py-5 px-6">
                                                                <div className="font-bold text-slate-900 text-sm">{accounts.find(a => a.id === postingReview.entry?.account_id)?.name || 'Uncategorized'}</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">{postingReview.entry?.description}</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right font-bold text-slate-900">{formatCurrency(postingReview.entry?.credit || 0).replace('K', '')}</td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-5 px-6 pl-10">
                                                                <div className="font-bold text-slate-900 text-sm">MoneyWise Wallet</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">Service / Transaction Fee</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                            <td className="py-5 px-6 text-right font-bold text-rose-600">{formatCurrency(postingReview.entry?.credit || 0).replace('K', '')}</td>
                                                        </tr>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </tbody>
                                    <tfoot className="sticky bottom-0 z-10">
                                        <tr className="bg-slate-900 text-white">
                                            <td className="py-6 px-6 font-black text-xs uppercase tracking-widest">Total Balance</td>
                                            <td className="py-6 px-6 text-right font-black text-sm">
                                                {formatCurrency(postingReview.type === 'REQUISITION' 
                                                    ? (postingReview.data.line_items || []).reduce((acc: number, item: any) => acc + Number(item.actual_amount ?? item.estimated_amount ?? 0), 0)
                                                    : (Number(postingReview.entry?.debit || 0) > 0 ? (postingReview.entry?.debit || 0) : (postingReview.entry?.credit || 0))).replace('K', '')}
                                            </td>
                                            <td className="py-6 px-6 text-right font-black text-sm">
                                                {formatCurrency(postingReview.type === 'REQUISITION' 
                                                    ? (postingReview.entry?.credit || 0)
                                                    : (Number(postingReview.entry?.debit || 0) > 0 ? (postingReview.entry?.debit || 0) : (postingReview.entry?.credit || 0))).replace('K', '')}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div className="p-10 flex justify-end gap-4 bg-white">
                            <button
                                onClick={() => setPostingReview(null)}
                                className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all text-xs uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => postingReview.type === 'REQUISITION' ? confirmPostRequisition(postingReview.data) : confirmPostLedger(postingReview.entry!)}
                                disabled={isPosting}
                                className="bg-[#006AFF] hover:bg-[#0052CC] text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-blue-200 flex items-center disabled:opacity-50 disabled:shadow-none"
                            >
                                {isPosting ? (
                                    <>
                                        <Loader2 className="animate-spin mr-3" size={18} />
                                        Posting...
                                    </>
                                ) : (
                                    <>
                                        <Check className="mr-3" size={18} strokeWidth={3} />
                                        Confirm & Post
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Post Success Overlay */}
            {postSuccess && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-emerald-950/40 backdrop-blur-sm animate-in fade-in duration-500">
                    <div className="bg-white rounded-[48px] shadow-2xl p-12 text-center max-w-md border border-emerald-100 animate-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-emerald-500 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-200">
                            <Check size={48} className="text-white" strokeWidth={3} />
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Successfully Posted!</h3>
                        <p className="text-slate-500 font-medium mb-10">
                            The {postSuccess.type} has been successfully synchronized with QuickBooks Online.
                        </p>
                        <div className="bg-slate-50 rounded-3xl p-6 mb-10 flex items-center justify-between border border-slate-100">
                            <div className="text-left">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">QuickBooks ID</div>
                                <div className="text-sm font-bold text-slate-900">{postSuccess.qbId}</div>
                            </div>
                            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                Validated
                            </div>
                        </div>
                        <button
                            onClick={() => setPostSuccess(null)}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-slate-200"
                        >
                            Back to Ledger
                        </button>
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

            <RequisitionModal 
                isOpen={isRequisitionModalOpen}
                requisition={selectedRequisition}
                onClose={() => {
                    setIsRequisitionModalOpen(false);
                    setSelectedRequisition(null);
                }}
                onStatusChange={loadData}
            />

            <ExportLedgerModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExport}
                defaultStartDate={startDate}
                defaultEndDate={endDate}
            />
        </Layout>
    );
};

export default CashLedger;
