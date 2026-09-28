/**
 * Report aggregation — expenditures matched to the chart of accounts, budgets
 * merged in, and everything rolled up by account type with a prior-period
 * comparison.
 *
 * Moved out of apps/web/src/pages/Reporting.tsx's `displayData` useMemo. This
 * is exactly the kind of logic that must not be reimplemented per client: two
 * independent versions of "what does this org's profit figure mean" would be
 * a defect even if both looked reasonable in isolation.
 */

import type { ExpenditureAggregation } from '../services/report.service';
import type { Budget } from '../services/budget.service';
import type { Account } from '../services/account.service';

export type ReportView = 'PROFIT_LOSS' | 'NET_WORTH';

export interface ReportLineItem {
    account_id: string;
    account_name: string;
    type: string;
    total_amount: number;
    transaction_count: number;
    budgeted_amount: number;
    variance: number | null;
    variancePercentage: number | null;
    prev_total_amount: number;
}

export interface ReportGroup {
    groupName: string;
    items: ReportLineItem[];
    totals: {
        total_amount: number;
        budgeted_amount: number;
        prev_total_amount: number;
        variance: number | null;
    };
}

export type ReportGroups = Record<string, ReportGroup>;

const GROUP_LABELS: Record<ReportView, [string, string][]> = {
    PROFIT_LOSS: [['INCOME', 'Income'], ['EXPENSE', 'Expenses']],
    NET_WORTH: [['ASSET', 'Assets'], ['LIABILITY', 'Liabilities'], ['EQUITY', 'Equity']],
};

export interface BuildReportGroupsOptions {
    hiddenAccountIds?: Set<string>;
    excludeZeroSpend?: boolean;
    sortField?: 'name' | 'amount' | 'variance';
    sortDesc?: boolean;
}

/**
 * Matches accounts to expenditures (falling back to the raw expenditure row
 * when an account isn't in the chart of accounts — the web version handles
 * this the same way, since QuickBooks-synced accounts can lag), merges in
 * budgets for variance, and groups by account type for the given view.
 */
export function buildReportGroups(
    allAccounts: Account[],
    expenditures: ExpenditureAggregation[],
    budgets: Budget[],
    prevExpenditures: ExpenditureAggregation[],
    reportView: ReportView,
    options: BuildReportGroupsOptions = {},
): { groups: ReportGroups; flatData: ReportLineItem[] } {
    const activeTypes = reportView === 'PROFIT_LOSS' ? ['INCOME', 'EXPENSE'] : ['ASSET', 'LIABILITY', 'EQUITY'];

    const map = new Map<string, ReportLineItem>();
    for (const acc of allAccounts) {
        if (!activeTypes.includes(acc.type)) continue;
        map.set(acc.id, {
            account_id: acc.id,
            account_name: acc.name,
            type: acc.type,
            total_amount: 0,
            transaction_count: 0,
            budgeted_amount: 0,
            variance: null,
            variancePercentage: null,
            prev_total_amount: 0,
        });
    }

    for (const exp of expenditures) {
        const existing = map.get(exp.account_id);
        if (existing) {
            existing.total_amount = exp.total_amount;
            existing.transaction_count = exp.transaction_count;
            if (exp.account_name !== 'Uncategorized Expense') existing.account_name = exp.account_name;
        } else if (activeTypes.includes(exp.type)) {
            map.set(exp.account_id, {
                account_id: exp.account_id,
                account_name: exp.account_name,
                type: exp.type,
                total_amount: exp.total_amount,
                transaction_count: exp.transaction_count,
                budgeted_amount: 0,
                variance: null,
                variancePercentage: null,
                prev_total_amount: 0,
            });
        }
    }

    const integrated = Array.from(map.values()).map((item) => {
        const budget = budgets.find((b) => b.qb_account_id === item.account_id);
        const budgetedAmount = budget ? budget.amount : 0;
        const prevExp = prevExpenditures.find((p) => p.account_id === item.account_id);
        return {
            ...item,
            budgeted_amount: budgetedAmount,
            variance: budgetedAmount > 0 ? budgetedAmount - item.total_amount : null,
            variancePercentage: budgetedAmount > 0 ? (item.total_amount / budgetedAmount) * 100 : null,
            prev_total_amount: prevExp ? prevExp.total_amount : 0,
        };
    });

    const filtered = integrated.filter((item) => {
        if (options.hiddenAccountIds?.has(item.account_id)) return false;
        if (options.excludeZeroSpend && item.total_amount === 0) return false;
        return true;
    });

    const sortField = options.sortField ?? 'amount';
    const sortDesc = options.sortDesc ?? true;
    const sorted = [...filtered].sort((a, b) => {
        const valA = sortField === 'name' ? a.account_name : sortField === 'amount' ? a.total_amount : (a.variance ?? 0);
        const valB = sortField === 'name' ? b.account_name : sortField === 'amount' ? b.total_amount : (b.variance ?? 0);
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });

    const groups: ReportGroups = {};
    for (const [key, label] of GROUP_LABELS[reportView]) {
        groups[key] = { groupName: label, items: [], totals: { total_amount: 0, budgeted_amount: 0, prev_total_amount: 0, variance: null } };
    }
    for (const item of sorted) {
        const g = groups[item.type];
        if (!g) continue;
        g.items.push(item);
        g.totals.total_amount += item.total_amount;
        g.totals.budgeted_amount += item.budgeted_amount;
        g.totals.prev_total_amount += item.prev_total_amount;
    }
    for (const g of Object.values(groups)) {
        g.totals.variance = g.totals.budgeted_amount > 0 ? g.totals.budgeted_amount - g.totals.total_amount : null;
    }

    return { groups, flatData: sorted };
}

export interface PercentageChange {
    value: number;
    isIncrease: boolean;
}

export interface ReportTotals {
    totalRevenue: number;
    totalExpenses: number;
    totalProfit: number;
    prevTotalProfit: number;
    profitChange: PercentageChange;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    netWorth: number;
    prevNetWorth: number;
    netWorthChange: PercentageChange;
}

/**
 * Exact port of the web's getPercentageChange. Divides by the signed
 * `previous`, not its magnitude — a swing from a negative to a positive
 * figure (net worth going from a deficit to positive, say) reports
 * differently than an abs-value formula would, and this must match the web
 * app's number precisely rather than a formula that merely looks equivalent.
 */
export function getPercentageChange(current: number, previous: number): PercentageChange {
    if (previous === 0) {
        return current > 0 ? { value: 100, isIncrease: true } : { value: 0, isIncrease: false };
    }
    const pct = ((current - previous) / previous) * 100;
    return { value: Math.round(Math.abs(pct)), isIncrease: pct > 0 };
}

/** Headline figures both report views need at once, regardless of which is showing. */
export function computeReportTotals(groups: ReportGroups): ReportTotals {
    const totalRevenue = groups['INCOME']?.totals.total_amount ?? 0;
    const totalExpenses = groups['EXPENSE']?.totals.total_amount ?? 0;
    const totalProfit = totalRevenue - totalExpenses;

    const prevTotalRevenue = groups['INCOME']?.totals.prev_total_amount ?? 0;
    const prevTotalExpenses = groups['EXPENSE']?.totals.prev_total_amount ?? 0;
    const prevTotalProfit = prevTotalRevenue - prevTotalExpenses;

    const totalAssets = groups['ASSET']?.totals.total_amount ?? 0;
    const totalLiabilities = groups['LIABILITY']?.totals.total_amount ?? 0;
    const totalEquity = groups['EQUITY']?.totals.total_amount ?? 0;
    const netWorth = totalAssets - totalLiabilities;

    const prevTotalAssets = groups['ASSET']?.totals.prev_total_amount ?? 0;
    const prevTotalLiabilities = groups['LIABILITY']?.totals.prev_total_amount ?? 0;
    const prevNetWorth = prevTotalAssets - prevTotalLiabilities;

    return {
        totalRevenue, totalExpenses, totalProfit, prevTotalProfit,
        profitChange: getPercentageChange(totalProfit, prevTotalProfit),
        totalAssets, totalLiabilities, totalEquity, netWorth, prevNetWorth,
        netWorthChange: getPercentageChange(netWorth, prevNetWorth),
    };
}
