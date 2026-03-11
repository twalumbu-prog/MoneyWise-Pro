import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { reportService, ExpenditureAggregation, ExpenditureItem } from '../services/report.service';
import { budgetService, Budget } from '../services/budget.service';
import { accountService, Account } from '../services/account.service';
import { BudgetModal } from '../components/BudgetModal';
import { ChevronLeft, ChevronRight, BarChart3, TrendingUp, ChevronDown, ChevronUp, Loader2, DollarSign, Settings2, SlidersHorizontal, Eye, EyeOff, Filter } from 'lucide-react';

type PeriodType = 'MONTHLY' | 'WEEKLY' | 'QUARTERLY';
type ModeType = 'EXPENSE' | 'CASH_OUTFLOW';

export const Reporting: React.FC = () => {
    // State
    const [mode, setMode] = useState<ModeType>('EXPENSE');
    const [periodType, setPeriodType] = useState<PeriodType>('MONTHLY');
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    
    const [expenditures, setExpenditures] = useState<ExpenditureAggregation[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [allAccounts, setAllAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Visibility Settings
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
    const [excludeZeroSpend, setExcludeZeroSpend] = useState(false);
    
    const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [accountItems, setAccountItems] = useState<Record<string, ExpenditureItem[]>>({});
    
    const [sortField, setSortField] = useState<'name' | 'amount' | 'variance'>('amount');
    const [sortDesc, setSortDesc] = useState(true);

    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [selectedAccountForBudget, setSelectedAccountForBudget] = useState<{id: string, name: string} | null>(null);

    // Date Math
    const periodData = useMemo(() => {
        const start = new Date(currentDate);
        const end = new Date(currentDate);

        if (periodType === 'MONTHLY') {
            start.setDate(1);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
        } else if (periodType === 'WEEKLY') {
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
            end.setDate(start.getDate() + 6);
        } else if (periodType === 'QUARTERLY') {
            const currentMonth = start.getMonth();
            const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
            start.setMonth(quarterStartMonth, 1);
            end.setMonth(quarterStartMonth + 3, 0);
        }

        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        
        // Formatting label
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let label = '';
        if (periodType === 'MONTHLY') {
            label = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
        } else if (periodType === 'WEEKLY') {
            label = `${start.getDate()} ${monthNames[start.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]}`;
        } else {
            label = `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
        }

        return { start: startStr, end: endStr, label, type: periodType };
    }, [currentDate, periodType]);

    // Data Fetching
    const loadData = async () => {
        setLoading(true);
        try {
            const [expData, budData, accData] = await Promise.all([
                reportService.getExpenditures(periodData.start, periodData.end, mode),
                budgetService.getBudgets(periodData.start, periodData.end, periodType),
                accountService.getAll()
            ]);
            setExpenditures(expData);
            setBudgets(budData);
            setAllAccounts(accData.filter((a: Account) => a.type === 'EXPENSE'));
        } catch (error) {
            console.error('Failed to load reporting data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        setExpandedAccount(null); // Reset expansions on period/mode change
    }, [periodData.start, periodData.end, mode, periodType]);

    // Handlers
    const handlePrevPeriod = () => {
        const d = new Date(currentDate);
        if (periodType === 'MONTHLY') d.setMonth(d.getMonth() - 1);
        if (periodType === 'WEEKLY') d.setDate(d.getDate() - 7);
        if (periodType === 'QUARTERLY') d.setMonth(d.getMonth() - 3);
        setCurrentDate(d);
    };

    const handleNextPeriod = () => {
        const d = new Date(currentDate);
        if (periodType === 'MONTHLY') d.setMonth(d.getMonth() + 1);
        if (periodType === 'WEEKLY') d.setDate(d.getDate() + 7);
        if (periodType === 'QUARTERLY') d.setMonth(d.getMonth() + 3);
        setCurrentDate(d);
    };

    const toggleExpand = async (accountId: string) => {
        if (expandedAccount === accountId) {
            setExpandedAccount(null);
            return;
        }

        setExpandedAccount(accountId);
        if (!accountItems[accountId]) {
            setItemsLoading(true);
            try {
                const items = await reportService.getExpenditureItems(accountId, periodData.start, periodData.end, mode);
                setAccountItems(prev => ({ ...prev, [accountId]: items }));
            } catch (err) {
                console.error("Failed to fetch items", err);
            } finally {
                setItemsLoading(false);
            }
        }
    };

    // Calculate integrated data for display
    const displayData = useMemo(() => {
        // Build base map from all expense accounts
        const integrationMap = new Map<string, any>();

        allAccounts.forEach(acc => {
            // we use qb_account_id mapping where possible
            integrationMap.set(acc.id, {
                account_id: acc.id,
                account_name: acc.name,
                total_amount: 0,
                transaction_count: 0
            });
        });

        // Merge in expenditures
        expenditures.forEach(exp => {
            if (integrationMap.has(exp.account_id)) {
                const existing = integrationMap.get(exp.account_id);
                existing.total_amount = exp.total_amount;
                existing.transaction_count = exp.transaction_count;
                // Prefer API names if they somehow diverge or if account is generic
                if (exp.account_name !== 'Uncategorized Expense') {
                    existing.account_name = exp.account_name;
                }
            } else {
                // An expenditure came through for an account not in our `allAccounts` list (e.g., Uncategorized)
                integrationMap.set(exp.account_id, exp);
            }
        });

        const integrated = Array.from(integrationMap.values()).map(exp => {
            const budget = budgets.find(b => b.qb_account_id === exp.account_id);
            const budgetedAmount = budget ? budget.amount : 0;
            const variance = budgetedAmount > 0 ? budgetedAmount - exp.total_amount : null;
            
            return {
                ...exp,
                budgeted_amount: budgetedAmount,
                variance: variance,
                variancePercentage: budgetedAmount > 0 ? (exp.total_amount / budgetedAmount) * 100 : null
            };
        });

        // Apply filters
        const filtered = integrated.filter(item => {
            if (hiddenAccounts.has(item.account_id)) return false;
            if (excludeZeroSpend && item.total_amount === 0) return false;
            return true;
        });

        // Sorting
        return filtered.sort((a, b) => {
            let valA, valB;
            if (sortField === 'name') {
                valA = a.account_name;
                valB = b.account_name;
            } else if (sortField === 'amount') {
                valA = a.total_amount;
                valB = b.total_amount;
            } else {
                valA = a.variance || 0;
                valB = b.variance || 0;
            }

            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    }, [expenditures, budgets, allAccounts, sortField, sortDesc, hiddenAccounts, excludeZeroSpend]);

    const toggleAccountVisibility = (accountId: string) => {
        setHiddenAccounts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountId)) {
                newSet.delete(accountId);
            } else {
                newSet.add(accountId);
            }
            return newSet;
        });
    };


    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Header & Controls */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
                                    <BarChart3 className="h-5 w-5" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-brand-navy leading-tight">Expenditure Report</h1>
                                    <p className="text-sm text-gray-500">Track and analyze spending against budgets</p>
                                </div>
                            </div>
                        </div>

                        {/* Top Controls: Mode & Period */}
                        <div className="flex flex-wrap items-center gap-4">
                            {/* Mode Toggle */}
                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                <button
                                    onClick={() => setMode('EXPENSE')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                        mode === 'EXPENSE' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    Expense Mode
                                </button>
                                <button
                                    onClick={() => setMode('CASH_OUTFLOW')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                                        mode === 'CASH_OUTFLOW' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                    }`}
                                >
                                    Outflow Mode
                                </button>
                            </div>

                            <div className="h-8 w-px bg-gray-200 hidden md:block"></div>

                            {/* Period Navigation */}
                            <div className="flex items-center gap-2">
                                <select 
                                    value={periodType}
                                    onChange={(e) => setPeriodType(e.target.value as PeriodType)}
                                    className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-brand-green focus:border-brand-green block p-2 outline-none font-bold"
                                >
                                    <option value="WEEKLY">Weekly</option>
                                    <option value="MONTHLY">Monthly</option>
                                    <option value="QUARTERLY">Quarterly</option>
                                </select>

                                <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                                    <button onClick={handlePrevPeriod} className="p-2 text-gray-500 hover:text-brand-navy transition-colors">
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <span className="text-sm font-bold text-brand-navy min-w-[120px] text-center px-2">
                                        {periodData.label}
                                    </span>
                                    <button onClick={handleNextPeriod} className="p-2 text-gray-500 hover:text-brand-navy transition-colors">
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="h-8 w-px bg-gray-200 hidden md:block"></div>

                            {/* View Settings */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
                                        isSettingsOpen 
                                        ? 'bg-brand-navy text-white shadow-sm border-brand-navy' 
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <SlidersHorizontal className="h-4 w-4" />
                                    View
                                </button>

                                {isSettingsOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 p-4 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-bold text-gray-900">View Settings</h3>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Quick Filters */}
                                            <div>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Preset Filters</p>
                                                <button
                                                    onClick={() => setExcludeZeroSpend(!excludeZeroSpend)}
                                                    className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors group text-left"
                                                >
                                                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                                                        <Filter className="h-4 w-4 text-gray-400 group-hover:text-brand-navy" />
                                                        Exclude Zero K0.00 Spend
                                                    </div>
                                                    <div className={`w-8 h-4 rounded-full transition-colors relative flex items-center ${excludeZeroSpend ? 'bg-brand-green' : 'bg-gray-200'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full absolute transition-transform ${excludeZeroSpend ? 'translate-x-4' : 'translate-x-1'}`} />
                                                    </div>
                                                </button>
                                            </div>

                                            <div className="h-px bg-gray-100"></div>

                                            {/* Account Visibility */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Account Visibility</p>
                                                    {hiddenAccounts.size > 0 && (
                                                        <button 
                                                            onClick={() => setHiddenAccounts(new Set())}
                                                            className="text-xs font-bold text-brand-green hover:text-brand-navy transition-colors"
                                                        >
                                                            Show All
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="max-h-60 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                                    {allAccounts.map(account => (
                                                        <button
                                                            key={account.id}
                                                            onClick={() => toggleAccountVisibility(account.id)}
                                                            className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors group text-left"
                                                        >
                                                            <span className={`text-sm font-medium truncate pr-2 ${hiddenAccounts.has(account.id) ? 'text-gray-400' : 'text-gray-700'}`}>
                                                                {account.name}
                                                            </span>
                                                            {hiddenAccounts.has(account.id) ? (
                                                                <EyeOff className="h-4 w-4 text-gray-300 flex-shrink-0" />
                                                            ) : (
                                                                <Eye className="h-4 w-4 text-brand-navy flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-gray-500 mb-1">Total {mode === 'EXPENSE' ? 'Expenses' : 'Outflows'}</p>
                            <h3 className="text-3xl font-black text-brand-navy">
                                K{displayData.reduce((acc, curr) => acc + curr.total_amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </h3>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                            <TrendingUp className="h-6 w-6" />
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-gray-500 mb-1">Total Budget Allocated</p>
                            <h3 className="text-3xl font-black text-brand-navy">
                                K{displayData.reduce((acc, curr) => acc + (curr.budgeted_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </h3>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-brand-green/10 text-brand-green flex items-center justify-center">
                            <DollarSign className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-gray-500 mb-1">Overall Variance</p>
                            <h3 className={`text-3xl font-black ${
                                (() => {
                                    const totalBudget = displayData.reduce((acc, curr) => acc + (curr.budgeted_amount || 0), 0);
                                    const totalExpense = displayData.reduce((acc, curr) => acc + curr.total_amount, 0);
                                    const variance = totalBudget - totalExpense;
                                    if (totalBudget === 0) return 'text-brand-navy';
                                    return variance >= 0 ? 'text-brand-green' : 'text-red-500';
                                })()
                            }`}>
                                {(() => {
                                    const totalBudget = displayData.reduce((acc, curr) => acc + (curr.budgeted_amount || 0), 0);
                                    const totalExpense = displayData.reduce((acc, curr) => acc + curr.total_amount, 0);
                                    if (totalBudget === 0) return 'N/A';
                                    const variance = totalBudget - totalExpense;
                                    return `${variance >= 0 ? '+' : ''}K${variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                })()}
                            </h3>
                        </div>
                    </div>
                </div>

                {/* Data Table */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="p-5 font-bold text-xs uppercase tracking-widest text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => { setSortField('name'); setSortDesc(!sortDesc); }}
                                    >
                                        Account Name
                                    </th>
                                    <th className="p-5 font-bold text-xs uppercase tracking-widest text-gray-500 text-right cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => { setSortField('amount'); setSortDesc(!sortDesc); }}
                                    >
                                        Actual Spent
                                    </th>
                                    <th className="p-5 font-bold text-xs uppercase tracking-widest text-gray-500 text-right">
                                        Budget Target
                                    </th>
                                    <th className="p-5 font-bold text-xs uppercase tracking-widest text-gray-500 text-right cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => { setSortField('variance'); setSortDesc(!sortDesc); }}
                                    >
                                        Variance
                                    </th>
                                    <th className="p-5 text-right font-bold text-xs uppercase tracking-widest text-gray-500">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && displayData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-500">
                                            <Loader2 className="h-8 w-8 animate-spin text-brand-green mx-auto mb-4" />
                                            Loading expenditure data...
                                        </td>
                                    </tr>
                                ) : displayData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-500 font-medium">
                                            No expenditures found for this period.
                                        </td>
                                    </tr>
                                ) : (
                                    displayData.map((row) => (
                                        <React.Fragment key={row.account_id}>
                                            <tr className={`transition-colors hover:bg-gray-50 group`}>
                                                <td className="p-5">
                                                    <button 
                                                        onClick={() => toggleExpand(row.account_id)}
                                                        className="flex items-center text-left font-bold text-brand-navy hover:text-brand-green transition-colors"
                                                    >
                                                        {expandedAccount === row.account_id ? (
                                                            <ChevronUp className="h-4 w-4 mr-2 text-gray-400" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4 mr-2 text-gray-400" />
                                                        )}
                                                        {row.account_name}
                                                        <span className="ml-2 px-2 py-0.5 bg-gray-100 text-[10px] text-gray-500 rounded-full">
                                                            {row.transaction_count} txs
                                                        </span>
                                                    </button>
                                                </td>
                                                <td className="p-5 text-right font-black text-gray-900">
                                                    K{row.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="p-5 text-right font-medium">
                                                    {row.budgeted_amount > 0 ? (
                                                        <span className="text-gray-600">
                                                            K{row.budgeted_amount.toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 italic text-sm">Not set</span>
                                                    )}
                                                </td>
                                                <td className="p-5 text-right">
                                                    {row.variance !== null ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className={`font-bold ${row.variance >= 0 ? 'text-brand-green' : 'text-red-500'}`}>
                                                                {row.variance >= 0 ? '+' : ''}K{row.variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                            <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                                                                <div 
                                                                    className={`h-full ${row.variancePercentage! > 100 ? 'bg-red-500' : 'bg-brand-green'}`}
                                                                    style={{ width: `${Math.min(row.variancePercentage!, 100)}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300">-</span>
                                                    )}
                                                </td>
                                                <td className="p-5 text-right">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedAccountForBudget({ id: row.account_id, name: row.account_name });
                                                            setIsBudgetModalOpen(true);
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-brand-green hover:bg-brand-green/10 rounded-lg transition-colors inline-block"
                                                        title="Set Budget"
                                                    >
                                                        <Settings2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                            
                                            {/* Expanded Sub-table */}
                                            {expandedAccount === row.account_id && (
                                                <tr>
                                                    <td colSpan={5} className="p-0 border-b border-gray-100">
                                                        <div className="bg-gray-50 p-6 shadow-inner">
                                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Transaction Details</h4>
                                                            
                                                            {itemsLoading ? (
                                                                <div className="flex items-center text-sm text-gray-500">
                                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                                    Loading items...
                                                                </div>
                                                            ) : !accountItems[row.account_id]?.length ? (
                                                                <div className="text-sm text-gray-500">No transactions found for this period.</div>
                                                            ) : (
                                                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                                                    <table className="w-full text-left text-sm">
                                                                        <thead className="bg-gray-50 border-b border-gray-100">
                                                                            <tr>
                                                                                <th className="p-3 font-semibold text-gray-600">Date</th>
                                                                                <th className="p-3 font-semibold text-gray-600">Requisition</th>
                                                                                <th className="p-3 font-semibold text-gray-600">Description</th>
                                                                                <th className="p-3 font-semibold text-gray-600 text-right">Amount</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-100">
                                                                            {accountItems[row.account_id].map(item => (
                                                                                <tr key={item.id} className="hover:bg-gray-50/50">
                                                                                    <td className="p-3 text-gray-500">
                                                                                        {new Date(item.date).toLocaleDateString()}
                                                                                    </td>
                                                                                    <td className="p-3 text-brand-navy font-medium">
                                                                                        {item.requisition_ref || 'N/A'}
                                                                                    </td>
                                                                                    <td className="p-3">
                                                                                        <span className="text-gray-900 line-clamp-1">{item.description}</span>
                                                                                        <span className="text-xs text-brand-green mt-0.5 block">{item.requestor_name}</span>
                                                                                    </td>
                                                                                    <td className="p-3 text-right font-bold text-gray-900">
                                                                                        K{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
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
                </div>

            </div>

            {isBudgetModalOpen && selectedAccountForBudget && (
                <BudgetModal
                    isOpen={isBudgetModalOpen}
                    onClose={() => setIsBudgetModalOpen(false)}
                    accountId={selectedAccountForBudget.id}
                    accountName={selectedAccountForBudget.name}
                    currentPeriod={{
                        start: periodData.start,
                        end: periodData.end,
                        type: periodData.type,
                        label: periodData.label
                    }}
                    existingAmount={budgets.find(b => b.qb_account_id === selectedAccountForBudget.id)?.amount}
                    onSuccess={loadData}
                />
            )}
        </Layout>
    );
};
