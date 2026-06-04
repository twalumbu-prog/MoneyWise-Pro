import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { reportService, ExpenditureAggregation, ExpenditureItem } from '../services/report.service';
import { budgetService, Budget } from '../services/budget.service';
import { accountService, Account } from '../services/account.service';
import { BudgetModal } from '../components/BudgetModal';
import { ChevronLeft, ChevronRight, BarChart3, ChevronDown, ChevronUp, Loader2, Settings2, SlidersHorizontal, Eye, EyeOff, Filter, Plus, Trash2, FolderOutput, ArrowUpDown, Link2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import budgetBg from '../assets/Frame 24.png';

type PeriodType = 'MONTHLY' | 'WEEKLY' | 'QUARTERLY';
type ModeType = 'EXPENSE' | 'CASH_OUTFLOW';

interface ReportGroup {
    id: string;
    name: string;
}

// Helper to calculate percentage change
const getPercentageChange = (current: number, previous: number) => {
    if (previous === 0) {
        return current > 0 ? { value: 100, isIncrease: true } : { value: 0, isIncrease: false };
    }
    const diff = current - previous;
    const pct = (diff / previous) * 100;
    return {
        value: Math.round(Math.abs(pct)),
        isIncrease: pct > 0
    };
};

export const Reporting: React.FC = () => {
        // State
    const [mode, setMode] = useState<ModeType>('EXPENSE');
    const [periodType, setPeriodType] = useState<PeriodType>('MONTHLY');
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    
    const [expenditures, setExpenditures] = useState<ExpenditureAggregation[]>([]);
    const [prevExpenditures, setPrevExpenditures] = useState<ExpenditureAggregation[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [allAccounts, setAllAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [reportView, setReportView] = useState<'PROFIT_LOSS' | 'NET_WORTH'>('PROFIT_LOSS');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['INCOME', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY']));

    // Mobile Layout States
    const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
    const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
    
    // Visibility Settings
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
    const [excludeZeroSpend, setExcludeZeroSpend] = useState(false);
    
    const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [accountItems, setAccountItems] = useState<Record<string, ExpenditureItem[]>>({});
    
    // Grouping & Multi-select State
    const [groups, setGroups] = useState<ReportGroup[]>([]);
    const [accountGroups, setAccountGroups] = useState<Record<string, string>>({}); // accountId -> groupId
    const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
    const [isGroupingEnabled, setIsGroupingEnabled] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    
    const { organizationId: orgId } = useAuth();

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

    const prevPeriodData = useMemo(() => {
        const start = new Date(currentDate);
        const end = new Date(currentDate);

        if (periodType === 'MONTHLY') {
            start.setMonth(start.getMonth() - 1, 1);
            end.setMonth(end.getMonth(), 0);
        } else if (periodType === 'WEEKLY') {
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1) - 7;
            start.setDate(diff);
            end.setDate(start.getDate() + 6);
        } else if (periodType === 'QUARTERLY') {
            const currentMonth = start.getMonth();
            const quarterStartMonth = (Math.floor(currentMonth / 3) * 3) - 3;
            start.setMonth(quarterStartMonth, 1);
            end.setMonth(quarterStartMonth + 3, 0);
        }

        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];

        return { start: startStr, end: endStr };
    }, [currentDate, periodType]);

    // Data Fetching
    const loadData = async () => {
        setLoading(true);
        try {
            const [expData, budData, accData, prevExpData] = await Promise.all([
                reportService.getExpenditures(periodData.start, periodData.end, mode),
                budgetService.getBudgets(periodData.start, periodData.end, periodType),
                accountService.getAll(),
                reportService.getExpenditures(prevPeriodData.start, prevPeriodData.end, mode)
            ]);
            setExpenditures(expData);
            setBudgets(budData);
            setAllAccounts(accData);
            setPrevExpenditures(prevExpData);

            // Load saved groups from local storage
            if (orgId) {
                const savedGroups = localStorage.getItem(`reportGroups_${orgId}`);
                const savedAssignments = localStorage.getItem(`accountGroups_${orgId}`);
                const savedGroupingToggle = localStorage.getItem(`isGroupingEnabled_${orgId}`);
                
                if (savedGroups) setGroups(JSON.parse(savedGroups));
                if (savedAssignments) setAccountGroups(JSON.parse(savedAssignments));
                if (savedGroupingToggle) setIsGroupingEnabled(savedGroupingToggle === 'true');
            }

        } catch (error) {
            console.error('Failed to load reporting data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (orgId) {
            loadData();
        }
        setExpandedAccount(null); // Reset expansions on period/mode change
        setSelectedAccounts(new Set()); // Reset selections on period change
    }, [periodData.start, periodData.end, mode, periodType, orgId]);

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

    const toggleGroupExpand = (groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    };

    // Grouping Handlers
    const handleCreateGroup = () => {
        if (!newGroupName.trim() || !orgId) return;
        const newGroup = { id: Date.now().toString(), name: newGroupName.trim() };
        const updatedGroups = [...groups, newGroup];
        setGroups(updatedGroups);
        localStorage.setItem(`reportGroups_${orgId}`, JSON.stringify(updatedGroups));
        setNewGroupName('');
    };

    const handleDeleteGroup = (groupId: string) => {
        if (!orgId) return;
        const updatedGroups = groups.filter(g => g.id !== groupId);
        setGroups(updatedGroups);
        localStorage.setItem(`reportGroups_${orgId}`, JSON.stringify(updatedGroups));
        
        // Remove assignments
        const newAssignments = { ...accountGroups };
        let modified = false;
        Object.keys(newAssignments).forEach(accId => {
            if (newAssignments[accId] === groupId) {
                delete newAssignments[accId];
                modified = true;
            }
        });
        if (modified) {
            setAccountGroups(newAssignments);
            localStorage.setItem(`accountGroups_${orgId}`, JSON.stringify(newAssignments));
        }
    };

    const handleAssignToGroup = (groupId: string | null) => {
        if (!orgId || selectedAccounts.size === 0) return;
        
        const newAssignments = { ...accountGroups };
        selectedAccounts.forEach(accId => {
            if (groupId) {
                newAssignments[accId] = groupId;
            } else {
                delete newAssignments[accId]; // Unassign
            }
        });
        
        setAccountGroups(newAssignments);
        localStorage.setItem(`accountGroups_${orgId}`, JSON.stringify(newAssignments));
        setSelectedAccounts(new Set()); // Clear selection after bulk action
    };

    const handleBulkHide = () => {
        setHiddenAccounts(prev => {
            const newHidden = new Set(prev);
            selectedAccounts.forEach(accId => newHidden.add(accId));
            return newHidden;
        });
        setSelectedAccounts(new Set()); // Clear selection
    };

    const toggleGrouping = () => {
        const newValue = !isGroupingEnabled;
        setIsGroupingEnabled(newValue);
        if (orgId) {
            localStorage.setItem(`isGroupingEnabled_${orgId}`, String(newValue));
        }
    };

    const toggleRowSelection = (accountId: string) => {
        setSelectedAccounts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountId)) newSet.delete(accountId);
            else newSet.add(accountId);
            return newSet;
        });
    };

    // Render helper for an individual account row to avoid deeply nested maps
    const renderAccountRow = (row: any) => (
        <React.Fragment key={row.account_id}>
                <tr className={`transition-colors hover:bg-gray-50 group`}>
                    <td className="p-5">
                        <input 
                            type="checkbox" 
                            className="rounded text-brand-green focus:ring-brand-green border-gray-300 w-4 h-4 cursor-pointer"
                            checked={selectedAccounts.has(row.account_id)}
                            onChange={() => toggleRowSelection(row.account_id)}
                        />
                    </td>
                    <td className="py-5 pr-5">
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
                        <td colSpan={6} className="p-0 border-b border-gray-100">
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
    );

    // Calculate integrated data for display
    const displayData = useMemo(() => {
        // Build base map from accounts matching current view
        const activeTypes = reportView === 'PROFIT_LOSS' 
            ? ['INCOME', 'EXPENSE'] 
            : ['ASSET', 'LIABILITY', 'EQUITY'];

        const integrationMap = new Map<string, any>();

        allAccounts
            .filter(acc => activeTypes.includes(acc.type))
            .forEach(acc => {
                integrationMap.set(acc.id, {
                    account_id: acc.id,
                    account_name: acc.name,
                    type: acc.type,
                    total_amount: 0,
                    transaction_count: 0
                });
            });

        // Merge in expenditures (actual balances from backend)
        expenditures.forEach(exp => {
            if (integrationMap.has(exp.account_id)) {
                const existing = integrationMap.get(exp.account_id);
                existing.total_amount = exp.total_amount;
                existing.transaction_count = exp.transaction_count;
                if (exp.account_name !== 'Uncategorized Expense') {
                    existing.account_name = exp.account_name;
                }
            } else if (activeTypes.includes(exp.type)) {
                integrationMap.set(exp.account_id, exp);
            }
        });

        const integrated = Array.from(integrationMap.values()).map(exp => {
            const budget = budgets.find(b => b.qb_account_id === exp.account_id);
            const budgetedAmount = budget ? budget.amount : 0;
            const variance = budgetedAmount > 0 ? budgetedAmount - exp.total_amount : null;
            
            // Find previous amount
            const prevExp = prevExpenditures.find(p => p.account_id === exp.account_id);
            const prevTotalAmount = prevExp ? prevExp.total_amount : 0;
            
            return {
                ...exp,
                budgeted_amount: budgetedAmount,
                variance: variance,
                variancePercentage: budgetedAmount > 0 ? (exp.total_amount / budgetedAmount) * 100 : null,
                prev_total_amount: prevTotalAmount
            };
        });

        // Apply filters
        const filtered = integrated.filter(item => {
            if (hiddenAccounts.has(item.account_id)) return false;
            if (excludeZeroSpend && item.total_amount === 0) return false;
            return true;
        });

        // Sorting
        const sorted = filtered.sort((a, b) => {
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

        // Always group by standard categories
        const groupedData: Record<string, { groupName: string; items: any[]; totals: any }> = {};
        
        if (reportView === 'PROFIT_LOSS') {
            groupedData['INCOME'] = { groupName: 'Income', items: [], totals: { total_amount: 0, budgeted_amount: 0, prev_total_amount: 0 } };
            groupedData['EXPENSE'] = { groupName: 'Expenses', items: [], totals: { total_amount: 0, budgeted_amount: 0, prev_total_amount: 0 } };
        } else {
            groupedData['ASSET'] = { groupName: 'Assets', items: [], totals: { total_amount: 0, budgeted_amount: 0, prev_total_amount: 0 } };
            groupedData['LIABILITY'] = { groupName: 'Liabilities', items: [], totals: { total_amount: 0, budgeted_amount: 0, prev_total_amount: 0 } };
            groupedData['EQUITY'] = { groupName: 'Equity', items: [], totals: { total_amount: 0, budgeted_amount: 0, prev_total_amount: 0 } };
        }

        sorted.forEach(item => {
            const targetGroup = groupedData[item.type];
            if (targetGroup) {
                targetGroup.items.push(item);
                targetGroup.totals.total_amount += item.total_amount;
                targetGroup.totals.budgeted_amount += (item.budgeted_amount || 0);
                targetGroup.totals.prev_total_amount += (item.prev_total_amount || 0);
            }
        });

        // Calculate variance totals for groups
        Object.values(groupedData).forEach(group => {
            const variance = group.totals.budgeted_amount > 0 ? group.totals.budgeted_amount - group.totals.total_amount : null;
            group.totals.variance = variance;
        });

        return { isGrouped: true, groups: groupedData, data: sorted, flatData: sorted };

    }, [expenditures, budgets, allAccounts, sortField, sortDesc, hiddenAccounts, excludeZeroSpend, prevExpenditures, reportView]);

    const totals = useMemo(() => {
        const groups = displayData.groups || {};
        
        const totalRevenue = groups['INCOME']?.totals.total_amount || 0;
        const totalExpenses = groups['EXPENSE']?.totals.total_amount || 0;
        const totalProfit = totalRevenue - totalExpenses;
        
        const prevTotalRevenue = groups['INCOME']?.totals.prev_total_amount || 0;
        const prevTotalExpenses = groups['EXPENSE']?.totals.prev_total_amount || 0;
        const prevTotalProfit = prevTotalRevenue - prevTotalExpenses;
        
        const profitChange = getPercentageChange(totalProfit, prevTotalProfit);
        
        const totalAssets = groups['ASSET']?.totals.total_amount || 0;
        const totalLiabilities = groups['LIABILITY']?.totals.total_amount || 0;
        const totalEquity = groups['EQUITY']?.totals.total_amount || 0;
        const netWorth = totalAssets - totalLiabilities;
        
        const prevTotalAssets = groups['ASSET']?.totals.prev_total_amount || 0;
        const prevTotalLiabilities = groups['LIABILITY']?.totals.prev_total_amount || 0;
        const prevNetWorth = prevTotalAssets - prevTotalLiabilities;
        
        const netWorthChange = getPercentageChange(netWorth, prevNetWorth);
        
        return {
            totalRevenue,
            totalExpenses,
            totalProfit,
            prevTotalProfit,
            profitChange,
            
            totalAssets,
            totalLiabilities,
            totalEquity,
            netWorth,
            prevNetWorth,
            netWorthChange
        };
    }, [displayData]);

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






    const displayMonthName = useMemo(() => {
        if (periodType === 'MONTHLY') {
            return currentDate.toLocaleDateString('en-US', { month: 'long' });
        }
        return periodData.label;
    }, [currentDate, periodType, periodData.label]);

    const monthOptions = useMemo(() => {
        const options = [];
        const date = new Date();
        // Go 10 months back and 2 months forward
        for (let i = -10; i <= 2; i++) {
            const d = new Date();
            d.setDate(1); // avoid month overflow issues
            d.setMonth(date.getMonth() + i);
            options.push({
                label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                date: new Date(d.getFullYear(), d.getMonth(), 1)
            });
        }
        return options;
    }, []);




    return (
        <Layout noPadding={true} backgroundColor="bg-white" title="Reports">
            {/* Desktop View */}
            <div className="hidden md:block max-w-6xl mx-auto space-y-6 px-4 md:px-12 py-4 md:py-8">
                {/* Header & Controls */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
                                    <BarChart3 className="h-5 w-5" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-brand-navy leading-tight">Financial Reports</h1>
                                    <p className="text-sm text-gray-500">Track and analyze business financials and net worth</p>
                                </div>
                            </div>
                        </div>

                        {/* Top Controls: Mode & Period */}
                        <div className="flex flex-wrap items-center gap-4">
                            {/* Mode Toggle (P&L only) */}
                            {reportView === 'PROFIT_LOSS' && (
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
                            )}

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
                                                        Exclude Zero Spend
                                                    </div>
                                                    <div className={`w-8 h-4 rounded-full transition-colors relative flex items-center ${excludeZeroSpend ? 'bg-brand-green' : 'bg-gray-200'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full absolute transition-transform ${excludeZeroSpend ? 'translate-x-4' : 'translate-x-1'}`} />
                                                    </div>
                                                </button>
                                            </div>

                                            <div className="h-px bg-gray-100"></div>

                                            {/* Account Grouping settings */}
                                            <div>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Account Grouping</p>
                                                
                                                <label className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer group mb-2">
                                                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                                                        <FolderOutput className="h-4 w-4 text-gray-400 group-hover:text-brand-navy" />
                                                        Group by Custom Groups
                                                    </div>
                                                    <div className={`w-8 h-4 rounded-full transition-colors relative flex items-center ${isGroupingEnabled ? 'bg-brand-green' : 'bg-gray-200'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full absolute transition-transform ${isGroupingEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                                                    </div>
                                                    <input type="checkbox" className="hidden" checked={isGroupingEnabled} onChange={toggleGrouping} />
                                                </label>

                                                <div className="flex items-center gap-2 mb-2 px-2">
                                                    <input 
                                                        type="text" 
                                                        value={newGroupName}
                                                        onChange={(e) => setNewGroupName(e.target.value)}
                                                        placeholder="New Group Name"
                                                        className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green"
                                                        onKeyDown={(e) => { if(e.key === 'Enter') handleCreateGroup() }}
                                                    />
                                                    <button 
                                                        onClick={handleCreateGroup}
                                                        disabled={!newGroupName.trim()}
                                                        className="p-1.5 bg-brand-green text-white rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                </div>

                                                {groups.length > 0 && (
                                                    <div className="max-h-32 overflow-y-auto pr-1 space-y-1 custom-scrollbar px-2 mt-2 border-t border-gray-100 pt-2">
                                                        {groups.map(group => (
                                                            <div key={group.id} className="flex items-center justify-between text-sm py-1 group/item">
                                                                <span className="text-gray-600 truncate mr-2">{group.name}</span>
                                                                <button 
                                                                    onClick={() => handleDeleteGroup(group.id)}
                                                                    className="text-red-400 hover:text-red-600 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
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
                                                    {allAccounts
                                                        .filter(acc => (reportView === 'PROFIT_LOSS' ? ['INCOME', 'EXPENSE'] : ['ASSET', 'LIABILITY', 'EQUITY']).includes(acc.type))
                                                        .map(account => (
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

                {/* Report Type Toggle Pill Selector */}
                <div className="flex bg-gray-100/80 p-1 rounded-2xl max-w-sm mx-auto mb-8 border border-gray-200/50">
                    <button
                        onClick={() => setReportView('NET_WORTH')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all text-center ${
                            reportView === 'NET_WORTH' ? 'bg-white text-brand-navy shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        Net Worth
                    </button>
                    <button
                        onClick={() => setReportView('PROFIT_LOSS')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all text-center ${
                            reportView === 'PROFIT_LOSS' ? 'bg-white text-brand-navy shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        Profit/Loss
                    </button>
                </div>

                {/* Desktop Summary Card */}
                <div
                    className="rounded-[28px] p-8 text-white shadow-lg relative overflow-hidden mb-8"
                    style={{
                        backgroundImage: `url(${budgetBg})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                >
                    {reportView === 'PROFIT_LOSS' ? (
                        <>
                            <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">
                                Total Profit
                            </p>
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-[42px] font-black leading-none tracking-tight">
                                    K{totals.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h2>
                                <span className="text-[32px] font-black leading-none font-bold">
                                    <span className="text-[#4D9FFF]">{totals.profitChange.isIncrease ? '+' : '-'}</span>
                                    <span className="text-white">{totals.profitChange.value}%</span>
                                </span>
                            </div>
                            
                            <div className="bg-white/10 rounded-2xl px-6 py-4 mt-6 flex justify-between items-center text-xs font-bold text-white/90 max-w-2xl">
                                <div className="flex items-center gap-2">
                                    <Link2 size={14} className="text-white/60" />
                                    <span>Total Revenue <strong className="font-extrabold text-white">K{totals.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                                <div className="h-4 w-px bg-white/20"></div>
                                <div className="flex items-center gap-2">
                                    <ArrowUpRight size={15} className="text-[#34D399]" />
                                    <span>Total Expenses <strong className="font-extrabold text-white">K{totals.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">
                                Net Worth
                            </p>
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-[42px] font-black leading-none tracking-tight">
                                    K{totals.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h2>
                                <span className="text-[32px] font-black leading-none font-bold">
                                    <span className="text-[#4D9FFF]">{totals.netWorthChange.isIncrease ? '+' : '-'}</span>
                                    <span className="text-white">{totals.netWorthChange.value}%</span>
                                </span>
                            </div>
                            
                            <div className="bg-white/10 rounded-2xl px-6 py-4 mt-6 flex justify-between items-center text-xs font-bold text-white/90 max-w-2xl">
                                <div className="flex items-center gap-2">
                                    <Link2 size={14} className="text-white/60" />
                                    <span>Total Assets <strong className="font-extrabold text-white">K{totals.totalAssets.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                                <div className="h-4 w-px bg-white/20"></div>
                                <div className="flex items-center gap-2">
                                    <ArrowUpRight size={15} className="text-[#34D399]" />
                                    <span>Total Liabilities <strong className="font-extrabold text-white">K{totals.totalLiabilities.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Category Group Cards - Separate cards for each group */}
                {loading && (!displayData.isGrouped ? displayData.data?.length === 0 : displayData.flatData?.length === 0) ? (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center text-gray-500 mt-8">
                        <Loader2 className="h-8 w-8 animate-spin text-[#006AFF] mx-auto mb-4" />
                        Loading reports...
                    </div>
                ) : (!displayData.isGrouped ? displayData.data?.length === 0 : displayData.flatData?.length === 0) ? (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center text-gray-500 font-medium mt-8">
                        No financial records found for this period.
                    </div>
                ) : (
                    <div className="space-y-6 mt-8">
                        {displayData.isGrouped && displayData.groups && Object.entries(displayData.groups).map(([groupId, groupData]) => {
                            if (groupData.items.length === 0) return null;
                            
                            const isExpanded = expandedGroups.has(groupId);
                            
                            return (
                                <div key={groupId} className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
                                    {/* Category Header */}
                                    <div 
                                        onClick={() => toggleGroupExpand(groupId)}
                                        className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                            <FolderOutput className="h-4 w-4 text-brand-green" />
                                            <h2 className="text-md font-bold text-brand-navy">{groupData.groupName}</h2>
                                            <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                                {groupData.items.length} accounts
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-6 text-sm font-bold text-gray-700">
                                            <div>
                                                <span className="text-gray-400 text-xs font-medium mr-2">TOTAL</span>
                                                <span className="text-brand-navy">K{groupData.totals.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                            {groupData.totals.budgeted_amount > 0 && (
                                                <>
                                                    <div className="h-4 w-px bg-gray-200"></div>
                                                    <div>
                                                        <span className="text-gray-400 text-xs font-medium mr-2">BUDGET</span>
                                                        <span>K{groupData.totals.budgeted_amount.toLocaleString()}</span>
                                                    </div>
                                                    <div className="h-4 w-px bg-gray-200"></div>
                                                    <div>
                                                        <span className="text-gray-400 text-xs font-medium mr-2">VARIANCE</span>
                                                        <span className={groupData.totals.variance >= 0 ? 'text-brand-green' : 'text-red-500'}>
                                                            {groupData.totals.variance >= 0 ? '+' : ''}K{groupData.totals.variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b border-gray-100 bg-gray-50/10">
                                                        <th className="p-4 w-12">
                                                            <input 
                                                                type="checkbox" 
                                                                className="rounded text-brand-green focus:ring-brand-green border-gray-300 w-4 h-4 cursor-pointer"
                                                                checked={groupData.items.every((item: any) => selectedAccounts.has(item.account_id))}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    const allInGroup = groupData.items.every((item: any) => selectedAccounts.has(item.account_id));
                                                                    setSelectedAccounts(prev => {
                                                                        const next = new Set(prev);
                                                                        groupData.items.forEach((item: any) => {
                                                                            if (allInGroup) next.delete(item.account_id);
                                                                            else next.add(item.account_id);
                                                                        });
                                                                        return next;
                                                                    });
                                                                }}
                                                            />
                                                        </th>
                                                        <th className="py-4 pr-4 font-bold text-xs uppercase tracking-widest text-gray-500">
                                                            Account Name
                                                        </th>
                                                        <th className="p-4 font-bold text-xs uppercase tracking-widest text-gray-500 text-right">
                                                            {reportView === 'PROFIT_LOSS' ? 'Actual Amount' : 'Balance'}
                                                        </th>
                                                        <th className="p-4 font-bold text-xs uppercase tracking-widest text-gray-500 text-right">
                                                            {reportView === 'PROFIT_LOSS' ? 'Budget Limit' : 'Target'}
                                                        </th>
                                                        <th className="p-4 font-bold text-xs uppercase tracking-widest text-gray-500 text-right">
                                                            Variance
                                                        </th>
                                                        <th className="p-4 text-right font-bold text-xs uppercase tracking-widest text-gray-500">
                                                            Actions
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {groupData.items.map((row: any) => renderAccountRow(row))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Bulk Actions Floating Toolbar */}
                {selectedAccounts.size > 0 && (
                    <div className="sticky bottom-6 z-40 mt-6 animate-in fade-in slide-in-from-bottom-8 duration-300">
                        <div className="bg-brand-navy text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.2)] rounded-2xl border border-white/10 backdrop-blur-xl bg-blend-overlay">
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-white text-sm flex items-center gap-2">
                                    <FolderOutput className="h-4 w-4" />
                                    {selectedAccounts.size} account{selectedAccounts.size > 1 ? 's' : ''} selected
                                </span>
                                <span className="text-sm font-medium text-gray-300 hidden sm:inline ml-4 border-l border-white/20 pl-4">Choose action:</span>
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <button
                                    onClick={handleBulkHide}
                                    className="bg-white/10 border border-white/20 text-white font-bold text-sm rounded-lg px-4 py-2.5 hover:bg-white/20 transition-colors flex items-center gap-2 flex-1 sm:flex-none"
                                >
                                    <EyeOff className="w-4 h-4" />
                                    Hide Selected
                                </button>
                                <select
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val !== 'none-selected') {
                                            handleAssignToGroup(val === 'remove' ? null : val);
                                            e.target.value = 'none-selected'; // reset drop-down immediately
                                        }
                                    }}
                                    className="flex-1 sm:flex-none bg-white/10 border border-white/20 text-white font-bold text-sm rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-green appearance-none cursor-pointer outline-none hover:bg-white/20 transition-colors [&>option]:text-gray-900 [&>option]:bg-white"
                                    defaultValue="none-selected"
                                >
                                    <option value="none-selected" disabled>Assign to group...</option>
                                    <option value="remove" className="!text-red-500 font-bold">✖ Remove from Group</option>
                                    <option disabled>──────────</option>
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => setSelectedAccounts(new Set())}
                                    className="text-sm font-bold text-gray-400 hover:text-white transition-colors px-4 py-2.5 rounded-lg hover:bg-white/10 whitespace-nowrap"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile Responsive View */}
            <div className="md:hidden flex flex-col min-h-screen bg-white pb-28 pt-2">
                {/* Mobile View Toggle */}
                <div className="mx-6 mb-4 flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    <button
                        onClick={() => setReportView('NET_WORTH')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                            reportView === 'NET_WORTH' ? 'bg-white text-brand-navy shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        Net Worth
                    </button>
                    <button
                        onClick={() => setReportView('PROFIT_LOSS')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                            reportView === 'PROFIT_LOSS' ? 'bg-white text-brand-navy shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        Profit/Loss
                    </button>
                </div>

                {/* Total Financials Summary Card */}
                <div
                    className="mx-6 mb-6 rounded-[28px] p-6 text-white shadow-lg relative overflow-hidden"
                    style={{
                        backgroundImage: `url(${budgetBg})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                >
                    {reportView === 'PROFIT_LOSS' ? (
                        <>
                            <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">
                                Total Profit
                            </p>
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-[34px] font-black leading-none">
                                    K{totals.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h2>
                                <span className="text-[28px] font-black leading-none font-bold">
                                    <span className="text-[#4D9FFF]">{totals.profitChange.isIncrease ? '+' : '-'}</span>
                                    <span className="text-white">{totals.profitChange.value}%</span>
                                </span>
                            </div>
                            
                            {/* Secondary Band */}
                            <div className="bg-white/10 rounded-2xl px-4 py-3 mt-5 flex justify-between items-center text-[10px] font-bold text-white/90">
                                <div className="flex items-center gap-1.5">
                                    <Link2 size={13} className="text-white/60" />
                                    <span>Total Revenue <strong className="font-extrabold text-white">K{totals.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                                <div className="h-3 w-px bg-white/20"></div>
                                <div className="flex items-center gap-1.5">
                                    <ArrowUpRight size={14} className="text-[#34D399]" />
                                    <span>Total Expenses <strong className="font-extrabold text-white">K{totals.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">
                                Net Worth
                            </p>
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-[34px] font-black leading-none">
                                    K{totals.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h2>
                                <span className="text-[28px] font-black leading-none font-bold">
                                    <span className="text-[#4D9FFF]">{totals.netWorthChange.isIncrease ? '+' : '-'}</span>
                                    <span className="text-white">{totals.netWorthChange.value}%</span>
                                </span>
                            </div>
                            
                            {/* Secondary Band */}
                            <div className="bg-white/10 rounded-2xl px-4 py-3 mt-5 flex justify-between items-center text-[10px] font-bold text-white/90">
                                <div className="flex items-center gap-1.5">
                                    <Link2 size={13} className="text-white/60" />
                                    <span>Total Assets <strong className="font-extrabold text-white">K{totals.totalAssets.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                                <div className="h-3 w-px bg-white/20"></div>
                                <div className="flex items-center gap-1.5">
                                    <ArrowUpRight size={14} className="text-[#34D399]" />
                                    <span>Total Liabilities <strong className="font-extrabold text-white">K{totals.totalLiabilities.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Month Dropdown & Pill Controls Row */}
                <div className="mx-6 mb-5 flex items-center justify-between relative">
                    {/* Month selector dropdown trigger */}
                    <div className="relative">
                        <button 
                            onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
                            className="flex items-center gap-1 text-2xl font-black text-brand-navy tracking-tight focus:outline-none"
                        >
                            <span>{displayMonthName}</span>
                            <ChevronDown size={22} className="text-gray-400 mt-1" />
                        </button>
                        
                        {isMonthDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsMonthDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-100 rounded-3xl shadow-xl z-50 py-2 max-h-80 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                                    {monthOptions.map((opt, index) => {
                                        const isSelected = opt.date.getMonth() === currentDate.getMonth() && opt.date.getFullYear() === currentDate.getFullYear();
                                        return (
                                            <button
                                                key={index}
                                                onClick={() => {
                                                    setCurrentDate(opt.date);
                                                    setPeriodType('MONTHLY');
                                                    setIsMonthDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-5 py-3 text-sm font-bold transition-all ${
                                                    isSelected 
                                                        ? 'text-[#006AFF] bg-[#F5FAFF]' 
                                                        : 'text-gray-600 hover:text-brand-navy hover:bg-gray-50'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Pill controls */}
                    <div className="flex items-center gap-3">
                        <div className="flex bg-gray-100/80 rounded-full p-1 items-center">
                            {/* Sort button */}
                            <button 
                                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                                className={`p-2 rounded-full transition-all text-gray-500 hover:text-gray-900 active:scale-95`}
                                title="Sort"
                            >
                                <ArrowUpDown size={18} />
                            </button>
                            
                            <div className="h-4 w-px bg-gray-200 mx-0.5"></div>
                            
                            {/* Filter button */}
                            <button 
                                onClick={() => setExcludeZeroSpend(!excludeZeroSpend)}
                                className={`p-2 rounded-full transition-all active:scale-95 ${excludeZeroSpend ? 'text-[#006AFF] bg-white shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
                                title="Filter zero spend"
                            >
                                <Filter size={18} />
                            </button>
                        </div>

                        {/* Settings button */}
                        <div className="relative">
                            <button 
                                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                className={`p-2.5 rounded-full transition-all active:scale-95 bg-gray-100/80 text-gray-500 hover:text-gray-900 ${isSettingsOpen ? 'text-[#006AFF] bg-[#F0F7FF]' : ''}`}
                                title="Settings"
                            >
                                <Settings2 size={18} />
                            </button>

                            {isSettingsOpen && (
                                <>
                                    <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsSettingsOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 p-4 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-bold text-gray-900">View Settings</h3>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Preset Filters */}
                                            <div>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Preset Filters</p>
                                                <button
                                                    onClick={() => setExcludeZeroSpend(!excludeZeroSpend)}
                                                    className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors group text-left"
                                                >
                                                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                                                        <Filter className="h-4 w-4 text-gray-400 group-hover:text-brand-navy" />
                                                        Exclude Zero Spend
                                                    </div>
                                                    <div className={`w-8 h-4 rounded-full transition-colors relative flex items-center ${excludeZeroSpend ? 'bg-brand-green' : 'bg-gray-200'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full absolute transition-transform ${excludeZeroSpend ? 'translate-x-4' : 'translate-x-1'}`} />
                                                    </div>
                                                </button>
                                            </div>

                                            <div className="h-px bg-gray-100"></div>

                                            {/* Account Grouping settings */}
                                            <div>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Account Grouping</p>
                                                
                                                <label className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer group mb-2">
                                                    <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                                                        <FolderOutput className="h-4 w-4 text-gray-400 group-hover:text-brand-navy" />
                                                        Group by Custom Groups
                                                    </div>
                                                    <div className={`w-8 h-4 rounded-full transition-colors relative flex items-center ${isGroupingEnabled ? 'bg-brand-green' : 'bg-gray-200'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full absolute transition-transform ${isGroupingEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                                                    </div>
                                                    <input type="checkbox" className="hidden" checked={isGroupingEnabled} onChange={toggleGrouping} />
                                                </label>

                                                <div className="flex items-center gap-2 mb-2 px-2">
                                                    <input 
                                                        type="text" 
                                                        value={newGroupName}
                                                        onChange={(e) => setNewGroupName(e.target.value)}
                                                        placeholder="New Group Name"
                                                        className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#006AFF] focus:ring-1 focus:ring-[#006AFF]"
                                                        onKeyDown={(e) => { if(e.key === 'Enter') handleCreateGroup() }}
                                                    />
                                                    <button 
                                                        onClick={handleCreateGroup}
                                                        disabled={!newGroupName.trim()}
                                                        className="p-1.5 bg-[#006AFF] text-white rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>

                                                {groups.length > 0 && (
                                                    <div className="max-h-32 overflow-y-auto pr-1 space-y-1 custom-scrollbar px-2 mt-2 border-t border-gray-100 pt-2">
                                                        {groups.map(group => (
                                                            <div key={group.id} className="flex items-center justify-between text-xs py-1 group/item">
                                                                <span className="text-gray-600 truncate mr-2">{group.name}</span>
                                                                <button 
                                                                    onClick={() => handleDeleteGroup(group.id)}
                                                                    className="text-red-400 hover:text-red-600 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
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
                                                <div className="max-h-40 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                                    {allAccounts.map(account => (
                                                        <button
                                                            key={account.id}
                                                            onClick={() => toggleAccountVisibility(account.id)}
                                                            className="w-full flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-lg transition-colors group text-left"
                                                        >
                                                            <span className={`text-xs font-medium truncate pr-2 ${hiddenAccounts.has(account.id) ? 'text-gray-400' : 'text-gray-700'}`}>
                                                                {account.name}
                                                            </span>
                                                            {hiddenAccounts.has(account.id) ? (
                                                                <EyeOff className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                                                            ) : (
                                                                <Eye className="h-3.5 w-3.5 text-brand-navy flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    
                    {/* Sort selection dropdown overlay */}
                    {isSortDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsSortDropdownOpen(false)} />
                            <div className="absolute right-12 mt-12 w-56 bg-white border border-gray-100 rounded-3xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                {[
                                    { label: 'Amount (High to Low)', field: 'amount', desc: true },
                                    { label: 'Amount (Low to High)', field: 'amount', desc: false },
                                    { label: 'Name (A to Z)', field: 'name', desc: false },
                                    { label: 'Name (Z to A)', field: 'name', desc: true },
                                    { label: 'Variance (High to Low)', field: 'variance', desc: true },
                                    { label: 'Variance (Low to High)', field: 'variance', desc: false },
                                ].map((opt, index) => {
                                    const isSelected = sortField === opt.field && sortDesc === opt.desc;
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => {
                                                setSortField(opt.field as any);
                                                setSortDesc(opt.desc);
                                                setIsSortDropdownOpen(false);
                                            }}
                                            className={`w-full text-left px-5 py-3 text-sm font-bold transition-all ${
                                                isSelected 
                                                    ? 'text-[#006AFF] bg-[#F5FAFF]' 
                                                    : 'text-gray-600 hover:text-brand-navy hover:bg-gray-50'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Category Group Cards - Separate cards for each group */}
                {loading && (!displayData.isGrouped ? displayData.data?.length === 0 : displayData.flatData?.length === 0) ? (
                    <div className="mx-6 bg-white border border-gray-100 rounded-[28px] shadow-sm p-6 text-center text-gray-500">
                        <Loader2 className="h-8 w-8 animate-spin text-[#006AFF] mx-auto mb-4" />
                        Loading reports...
                    </div>
                ) : (!displayData.isGrouped ? displayData.data?.length === 0 : displayData.flatData?.length === 0) ? (
                    <div className="mx-6 bg-white border border-gray-100 rounded-[28px] shadow-sm p-6 text-center text-gray-500 font-bold">
                        No financial records found for this period.
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Rendering Grouped Categories */}
                        {displayData.isGrouped && displayData.groups && Object.entries(displayData.groups).map(([groupId, groupData]) => {
                            if (groupData.items.length === 0) return null;
                            
                            const progressPercent = groupData.totals.budgeted_amount > 0 ? (groupData.totals.total_amount / groupData.totals.budgeted_amount) * 100 : 0;
                            const change = getPercentageChange(groupData.totals.total_amount, groupData.totals.prev_total_amount);
                            const isExpanded = expandedGroups.has(groupId);

                            return (
                                <div key={`mob-group-${groupId}`} className="mx-6 bg-white border border-gray-100 rounded-[28px] shadow-md p-6 space-y-4">
                                    {/* Category Header - Clickable to collapse/expand card */}
                                    <div 
                                        onClick={() => toggleGroupExpand(groupId)}
                                        className="flex justify-between items-center pb-2 cursor-pointer"
                                    >
                                        <h3 className="font-extrabold text-sm text-brand-navy leading-tight flex items-center gap-1.5">
                                            {groupData.groupName}
                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                                {groupData.items.length}
                                            </span>
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-gray-900">
                                                K{groupData.totals.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <>
                                            {/* Category Progress and variance */}
                                            {groupData.totals.budgeted_amount > 0 && (
                                                <div className="space-y-2 pb-1">
                                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full transition-all duration-500 ${progressPercent > 100 ? 'bg-red-500' : 'bg-[#006AFF]'}`}
                                                            style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                                                        <span>
                                                            Budget: K{groupData.totals.budgeted_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </span>
                                                        <span className={`flex items-center text-[11px] font-bold ${
                                                            groupId === 'EXPENSE' || groupId === 'LIABILITY'
                                                                ? (change.isIncrease ? 'text-red-500' : 'text-emerald-500')
                                                                : (change.isIncrease ? 'text-emerald-500' : 'text-red-500')
                                                        }`}>
                                                            {change.isIncrease ? <ArrowUpRight size={11} className="mr-0.5" /> : <ArrowDownRight size={11} className="mr-0.5" />}
                                                            {change.value}%
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Subaccounts list */}
                                            <div className="space-y-1">
                                                {groupData.items.map((row: any) => {
                                                    const rowChange = getPercentageChange(row.total_amount, row.prev_total_amount);
                                                    const isRowExpanded = expandedAccount === row.account_id;

                                                    return (
                                                        <div key={`subacc-${row.account_id}`} className="py-2">
                                                            <div 
                                                                onClick={() => toggleExpand(row.account_id)}
                                                                className="cursor-pointer flex justify-between items-start"
                                                            >
                                                                <div className="pr-4">
                                                                    <h4 className="text-xs font-bold text-gray-700 flex items-center gap-1">
                                                                        {isRowExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                                                                        {row.account_name}
                                                                    </h4>
                                                                    <span className="text-[10px] text-gray-400 font-semibold block mt-0.5 pl-4.5">
                                                                        {row.budgeted_amount > 0 
                                                                            ? `${row.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}/ ${row.budgeted_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` 
                                                                            : `${row.transaction_count} transactions`
                                                                        }
                                                                    </span>
                                                                </div>
                                                                <div className="text-right flex-shrink-0">
                                                                    <span className="text-xs font-bold text-gray-900 block">
                                                                        K{row.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                    <span className={`text-[10px] font-bold mt-0.5 inline-block ${
                                                                        row.type === 'EXPENSE' || row.type === 'LIABILITY'
                                                                            ? (rowChange.isIncrease ? 'text-red-400' : 'text-emerald-500')
                                                                            : (rowChange.isIncrease ? 'text-emerald-500' : 'text-red-400')
                                                                    }`}>
                                                                        {rowChange.isIncrease ? '↗' : '↘'} {rowChange.value}%
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Transaction details cascade */}
                                                            {isRowExpanded && (
                                                                <div className="mt-3 bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                                                                    <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                                                                        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Transaction History</h5>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setSelectedAccountForBudget({ id: row.account_id, name: row.account_name });
                                                                                setIsBudgetModalOpen(true);
                                                                            }}
                                                                            className="text-[10px] font-black text-[#006AFF] hover:underline"
                                                                        >
                                                                            Set Budget
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    {itemsLoading ? (
                                                                        <div className="flex items-center text-xs text-gray-500 py-2">
                                                                            <Loader2 className="h-3 w-3 animate-spin mr-1.5 text-[#006AFF]" />
                                                                            Loading items...
                                                                        </div>
                                                                    ) : !accountItems[row.account_id]?.length ? (
                                                                        <div className="text-xs text-gray-400 py-1 italic">No transactions found for this period.</div>
                                                                    ) : (
                                                                        <div className="space-y-2">
                                                                            {accountItems[row.account_id].map(item => (
                                                                                <div key={item.id} className="text-xs flex justify-between items-start py-1 border-b border-gray-100 last:border-0 last:pb-0">
                                                                                    <div className="flex-1 pr-3">
                                                                                        <p className="font-bold text-gray-800 line-clamp-1">{item.description}</p>
                                                                                        <div className="flex items-center gap-1.5 text-[9px] text-gray-400 mt-0.5">
                                                                                            <span>{item.requisition_ref || 'N/A'}</span>
                                                                                            <span>•</span>
                                                                                            <span>{new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: 'numeric' })}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <span className="font-black text-gray-900 whitespace-nowrap">
                                                                                        K{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
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


}
