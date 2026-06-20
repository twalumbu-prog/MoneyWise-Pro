import { Response } from 'express';
import { supabase } from '../lib/supabase';

/**
 * Match a requisition line item to an account. We match on the internal account_id, or
 * on qb_account_id only when the account actually has one. Without the null guard, two
 * accounts that both have a NULL qb_account_id would spuriously match every uncategorized
 * line item (null === null), inflating every account row to the same total/count and
 * breaking the balance sheet. (Orgs whose chart of accounts has no QuickBooks mapping —
 * e.g. BenchMark — have qb_account_id NULL on every account.)
 */
function lineItemMatchesAccount(item: any, acc: any): boolean {
    if (item.account_id && item.account_id === acc.id) return true;
    return acc.qb_account_id != null && item.qb_account_id === acc.qb_account_id;
}

/**
 * An org reads its reports from the double-entry GL only once its history is fully
 * posted (no cashbook entry is missing a journal entry). Until then it stays on the
 * legacy per-type computation, so partially-backfilled orgs never show a wrong
 * balance sheet. Backfilling an org flips it onto the GL automatically.
 */
async function isOrgFullyPosted(organizationId: string): Promise<boolean> {
    const { data: gaps, error } = await supabase.rpc('cashbook_entries_missing_journal', {
        p_organization_id: organizationId
    });
    if (error) {
        console.error('[Report] missing-journal check failed; using legacy path:', error.message);
        return false;
    }
    if ((gaps?.length ?? 0) > 0) return false;
    const { count } = await supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
    return (count ?? 0) > 0;
}

/**
 * Build the report rows from the GL trial balance, keeping the legacy response shape
 * ({account_id, account_name, total_amount, transaction_count, type}).
 *   - INCOME/EXPENSE: period [startDate, endDate] (P&L view)
 *   - ASSET/LIABILITY/EQUITY: cumulative <= endDate (balance sheet)
 *   - Retained Earnings: cumulative (income - expense) injected onto the equity row,
 *     so Assets - Liabilities == Total Equity always holds.
 */
async function buildFinancialsFromGL(organizationId: string, startDate: string, endDate: string) {
    const { data: rows, error } = await supabase.rpc('report_account_balances', {
        p_org: organizationId,
        p_start: startDate,
        p_end: endDate
    });
    if (error) throw error;

    let cumIncome = 0;
    let cumExpense = 0;
    for (const r of rows || []) {
        const cd = Number(r.cumulative_debit || 0);
        const cc = Number(r.cumulative_credit || 0);
        if (r.type === 'INCOME') cumIncome += cc - cd;
        else if (r.type === 'EXPENSE') cumExpense += cd - cc;
    }
    const retainedEarnings = cumIncome - cumExpense;

    let retainedSeen = false;
    const financials = (rows || []).map((r: any) => {
        const pd = Number(r.period_debit || 0);
        const pc = Number(r.period_credit || 0);
        const cd = Number(r.cumulative_debit || 0);
        const cc = Number(r.cumulative_credit || 0);
        let total = 0;
        let count = 0;
        switch (r.type) {
            case 'INCOME':    total = pc - pd; count = Number(r.period_n || 0); break;
            case 'EXPENSE':   total = pd - pc; count = Number(r.period_n || 0); break;
            case 'ASSET':     total = cd - cc; count = Number(r.cumulative_n || 0); break;
            case 'LIABILITY': total = cc - cd; count = Number(r.cumulative_n || 0); break;
            case 'EQUITY':
                total = cc - cd; count = Number(r.cumulative_n || 0);
                if (r.code === 'QB-73') { total += retainedEarnings; retainedSeen = true; }
                break;
        }
        return {
            account_id: r.account_id,
            account_name: r.account_name,
            total_amount: total,
            transaction_count: count,
            type: r.type
        };
    });

    // If the org has no Retained Earnings account, surface the figure as a synthetic row
    // so the balance sheet still balances.
    if (!retainedSeen && Math.abs(retainedEarnings) > 0.005) {
        financials.push({
            account_id: 'RETAINED_EARNINGS',
            account_name: 'Retained Earnings',
            total_amount: retainedEarnings,
            transaction_count: 0,
            type: 'EQUITY'
        });
    }

    return financials;
}

export const getExpenditure = async (req: any, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;
        const { startDate, endDate, mode = 'EXPENSE' } = req.query; 

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'start_date and end_date are required' });
        }

        // Double-entry GL path — used once an org's history is fully posted; otherwise
        // we fall through to the legacy per-type computation below (no regression).
        if (await isOrgFullyPosted(organization_id)) {
            const financials = await buildFinancialsFromGL(organization_id, startDate, endDate);
            return res.json(financials);
        }

        // 1. Fetch all active accounts for the organization
        const { data: accounts, error: accError } = await supabase
            .from('accounts')
            .select('*')
            .eq('organization_id', organization_id)
            .eq('is_active', true);

        if (accError) throw accError;

        // 2. Fetch all cashbook entries up to endDate
        const { data: cbEntries, error: cbError } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organization_id)
            .lte('date', endDate);

        if (cbError) throw cbError;

        // 3. Fetch all organization wallets
        const { data: wallets, error: wError } = await supabase
            .from('organization_wallets')
            .select('*')
            .eq('organization_id', organization_id);

        if (wError) throw wError;

        // 4. Fetch all line items of requisitions in allowed statuses
        const allowedStatuses = ['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];
        const { data: lineItems, error: liError } = await supabase
            .from('line_items')
            .select(`
                *,
                requisition:requisitions!inner(
                    id, 
                    status, 
                    created_at, 
                    updated_at, 
                    organization_id,
                    cashbook_entries(id, date, entry_type)
                )
            `)
            .eq('requisition.organization_id', organization_id)
            .in('requisition.status', allowedStatuses);

        if (liError) throw liError;

        // Date helper for line items
        const getLineItemDate = (item: any) => {
            const req = item.requisition;
            if (!req) return '';
            const cashbookEntries = req.cashbook_entries || [];
            const disbursement = cashbookEntries.find((c: any) => c.entry_type === 'DISBURSEMENT');
            if (disbursement) return disbursement.date;
            if (cashbookEntries.length > 0) return cashbookEntries[0].date;
            return req.updated_at || req.created_at || '';
        };

        // Aggregate calculations for each account
        const financials = [];

        for (const acc of (accounts || [])) {
            let totalAmount = 0;
            let txCount = 0;

            if (acc.type === 'EXPENSE') {
                // Periodic (between startDate and endDate)
                // Source A: Requisition line items matching this account within date range
                const matchingLIs = (lineItems || []).filter(item => {
                    const itemDate = getLineItemDate(item).split('T')[0];
                    const matchAcc = lineItemMatchesAccount(item, acc);
                    return matchAcc && itemDate >= startDate && itemDate <= endDate;
                });
                const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);

                // Source B: Non-requisition cashbook entries directly allocated to this account in the date range
                const matchingCBs = (cbEntries || []).filter(entry => {
                    const entryDate = entry.date;
                    return entry.account_id === acc.id && !entry.requisition_id && entryDate >= startDate && entryDate <= endDate;
                });
                // Expense is debit-normal, so cash outflow (credit) increases balance and cash inflow (debit) decreases it
                const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.credit || 0) - Number(entry.debit || 0)), 0);

                totalAmount = liSum + cbSum;
                txCount = matchingLIs.length + matchingCBs.length;

            } else if (acc.type === 'INCOME') {
                // Periodic (between startDate and endDate)
                const matchingCBs = (cbEntries || []).filter(entry => {
                    const entryDate = entry.date;
                    return entry.account_id === acc.id && entryDate >= startDate && entryDate <= endDate;
                });
                // Income is credit-normal, so cash inflow (debit) increases it and cash outflow (credit) decreases it
                totalAmount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
                txCount = matchingCBs.length;

            } else if (acc.type === 'ASSET') {
                // Cumulative (up to endDate)
                const nameLower = acc.name.toLowerCase();
                const isBankWalletOrCash = acc.subtype === 'Bank' || nameLower.includes('wallet') || nameLower.includes('cash') || nameLower.includes('bank');

                if (isBankWalletOrCash) {
                    if (nameLower.includes('main') || acc.code === 'QB-1150040000') {
                        // Main Wallet balance (debits - credits)
                        const matchingCBs = (cbEntries || []).filter(entry => entry.account_type === 'MONEYWISE_WALLET');
                        totalAmount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
                        txCount = matchingCBs.length;
                    } else {
                        // Matches a specific subwallet
                        const matchedWallet = (wallets || []).find(w => w.name === acc.name || (acc.qb_account_id != null && w.qb_account_id === acc.qb_account_id));
                        if (matchedWallet) {
                            const matchingCBs = (cbEntries || []).filter(entry => entry.wallet_id === matchedWallet.id);
                            totalAmount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
                            txCount = matchingCBs.length;
                        } else if (nameLower.includes('cash')) {
                            // Physical Cash account
                            const matchingCBs = (cbEntries || []).filter(entry => entry.account_type === 'CASH');
                            totalAmount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
                            txCount = matchingCBs.length;
                        } else {
                            // General Bank Account
                            const matchingCBs = (cbEntries || []).filter(entry => entry.account_id === acc.id);
                            const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.credit || 0) - Number(entry.debit || 0)), 0);
                            const matchingLIs = (lineItems || []).filter(item => lineItemMatchesAccount(item, acc));
                            const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
                            totalAmount = cbSum + liSum;
                            txCount = matchingCBs.length + matchingLIs.length;
                        }
                    }
                } else {
                    // Other Asset
                    const matchingCBs = (cbEntries || []).filter(entry => entry.account_id === acc.id);
                    const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.credit || 0) - Number(entry.debit || 0)), 0);
                    const matchingLIs = (lineItems || []).filter(item => lineItemMatchesAccount(item, acc));
                    const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
                    totalAmount = cbSum + liSum;
                    txCount = matchingCBs.length + matchingLIs.length;
                }

            } else if (acc.type === 'LIABILITY' || acc.type === 'EQUITY') {
                // Cumulative (up to endDate)
                const matchingCBs = (cbEntries || []).filter(entry => entry.account_id === acc.id);
                const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
                const matchingLIs = (lineItems || []).filter(item => lineItemMatchesAccount(item, acc));
                const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);

                totalAmount = cbSum - liSum;
                txCount = matchingCBs.length + matchingLIs.length;
            }

            financials.push({
                account_id: acc.id,
                account_name: acc.name,
                total_amount: totalAmount,
                transaction_count: txCount,
                type: acc.type
            });
        }

        // Retained Earnings: roll cumulative (income - expense) up to endDate onto the
        // Retained Earnings equity row, mirroring the GL path (buildFinancialsFromGL).
        // Without this the legacy balance sheet never reflects accumulated profit/loss, so
        // Equity stays flat and Assets - Liabilities != Total Equity. Income increases it,
        // expense decreases it — keeping the accounting equation satisfied from day one.
        let cumIncome = 0;
        let cumExpense = 0;
        for (const acc of (accounts || [])) {
            if (acc.type === 'INCOME') {
                const cbs = (cbEntries || []).filter(e => e.account_id === acc.id && e.date <= endDate);
                cumIncome += cbs.reduce((sum, e) => sum + (Number(e.debit || 0) - Number(e.credit || 0)), 0);
            } else if (acc.type === 'EXPENSE') {
                const lis = (lineItems || []).filter(item =>
                    lineItemMatchesAccount(item, acc) && getLineItemDate(item).split('T')[0] <= endDate);
                cumExpense += lis.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
                const cbs = (cbEntries || []).filter(e => e.account_id === acc.id && !e.requisition_id && e.date <= endDate);
                cumExpense += cbs.reduce((sum, e) => sum + (Number(e.credit || 0) - Number(e.debit || 0)), 0);
            }
        }
        const retainedEarnings = cumIncome - cumExpense;

        const isRetainedAccount = (acc: any) => acc.type === 'EQUITY' && (
            acc.subtype === 'Retained Earnings' ||
            acc.code === 'QB-73' ||
            /retained earnings/i.test(acc.name || '')
        );
        const reAccount = (accounts || []).find(isRetainedAccount);
        const reRow = reAccount ? financials.find(f => f.account_id === reAccount.id) : undefined;
        if (reRow) {
            reRow.total_amount += retainedEarnings;
        } else if (Math.abs(retainedEarnings) > 0.005) {
            // Org has no Retained Earnings account — surface a synthetic row so the
            // balance sheet still balances.
            financials.push({
                account_id: 'RETAINED_EARNINGS',
                account_name: 'Retained Earnings',
                total_amount: retainedEarnings,
                transaction_count: 0,
                type: 'EQUITY'
            });
        }

        res.json(financials);
    } catch (error: any) {
        console.error('Error fetching expenditures:', error);
        res.status(500).json({ error: 'Failed to fetch expenditures', details: error.message });
    }
};

/**
 * Drill-down items for one account read from the GL (used for fully-posted orgs).
 * Mirrors the GL reporting windows: INCOME/EXPENSE over [start,end], balance-sheet
 * accounts cumulative <= end. The synthetic Retained Earnings row expands into the
 * underlying income/expense postings that compose it.
 */
async function buildItemsFromGL(
    organizationId: string,
    accountId: string,
    account: any,
    startDate: string,
    endDate: string
) {
    const isRetained = accountId === 'RETAINED_EARNINGS' || account?.code === 'QB-73';

    // Which accounts' postings to list, and the date window.
    let accountIds: string[] = [];
    let periodWindow = false; // true => [start,end], false => cumulative <= end
    let signMode: 'DEBIT_NORMAL' | 'CREDIT_NORMAL' = 'DEBIT_NORMAL';

    if (isRetained) {
        const { data: pnlAccts } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', organizationId)
            .in('type', ['INCOME', 'EXPENSE']);
        accountIds = (pnlAccts || []).map((a: any) => a.id);
        periodWindow = false;      // balance-sheet RE is cumulative
        signMode = 'CREDIT_NORMAL'; // income(credit-debit) + (-(expense)) both = credit-debit
    } else {
        if (!account) return [];
        accountIds = [accountId];
        periodWindow = account.type === 'INCOME' || account.type === 'EXPENSE';
        signMode = (account.type === 'ASSET' || account.type === 'EXPENSE') ? 'DEBIT_NORMAL' : 'CREDIT_NORMAL';
    }

    if (accountIds.length === 0) return [];

    let q = supabase
        .from('journal_lines')
        .select(`
            id, debit, credit,
            journal_entries!inner ( organization_id, entry_date, description, reference_number, created_by )
        `)
        .in('account_id', accountIds)
        .eq('journal_entries.organization_id', organizationId)
        .lte('journal_entries.entry_date', endDate);

    if (periodWindow && startDate) {
        q = q.gte('journal_entries.entry_date', startDate);
    }

    const { data: lines, error } = await q;
    if (error) throw error;

    const items = (lines || []).map((l: any) => {
        const je = l.journal_entries;
        const debit = Number(l.debit || 0);
        const credit = Number(l.credit || 0);
        const amount = signMode === 'DEBIT_NORMAL' ? debit - credit : credit - debit;
        return {
            id: l.id,
            description: je.description || 'Ledger posting',
            amount,
            date: je.entry_date,
            requisition_id: null,
            requisition_ref: je.reference_number || 'LEDGER',
            requisition_desc: je.description || '',
            requestor_name: 'Ledger'
        };
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
}

export const getExpenditureItems = async (req: any, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;
        const { accountId } = req.params;
        const { startDate, endDate, mode = 'EXPENSE' } = req.query;

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        // Fetch account to verify type
        let account: any = null;
        if (accountId !== 'UNCATEGORIZED') {
            const { data: acc } = await supabase
                .from('accounts')
                .select('*')
                .eq('id', accountId)
                .single();
            account = acc;
        }

        // GL drill-down for fully-posted orgs (mirrors the GL reporting path). Covers the
        // new equity rows (Suspense, Retained Earnings) and every other account.
        if (accountId !== 'UNCATEGORIZED' && await isOrgFullyPosted(organization_id)) {
            const glItems = await buildItemsFromGL(organization_id, accountId, account, String(startDate || ''), String(endDate || ''));
            return res.json(glItems);
        }

        const accountType = account?.type || 'EXPENSE';
        const items = [];

        // 1. Fetch requisition line items if they apply
        if (accountType === 'EXPENSE' || accountType === 'ASSET' || accountType === 'LIABILITY' || accountType === 'EQUITY') {
            const allowedStatuses = ['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId);

            let query = supabase
                .from('line_items')
                .select(`
                    *,
                    requisition:requisitions!inner(
                        id, 
                        reference_number, 
                        status, 
                        description, 
                        created_at, 
                        updated_at, 
                        requestor_id, 
                        requestor:users!requestor_id(name),
                        cashbook_entries(id, date, entry_type)
                    ),
                    accounts(id, name, code)
                `)
                .eq('requisition.organization_id', organization_id)
                .in('requisition.status', allowedStatuses);

            if (accountId === 'UNCATEGORIZED') {
                query = query.is('qb_account_id', null).is('account_id', null);
            } else if (isUuid) {
                query = query.or(`qb_account_id.eq.${accountId},account_id.eq.${accountId}`);
            } else {
                query = query.eq('qb_account_id', accountId);
            }

            const { data: lineItemsData, error: liError } = await query;
            if (liError) throw liError;

            for (const item of (lineItemsData || [])) {
                const req = item.requisition;
                if (!req) continue;

                const cashbookEntries = req.cashbook_entries || [];
                const disbursement = cashbookEntries.find((c: any) => c.entry_type === 'DISBURSEMENT');
                
                let itemDateStr = '';
                if (disbursement) {
                    itemDateStr = disbursement.date;
                } else if (cashbookEntries.length > 0) {
                    itemDateStr = cashbookEntries[0].date;
                } else {
                    itemDateStr = req.updated_at || req.created_at;
                }

                const formattedDate = itemDateStr.split('T')[0];

                // For balance sheet accounts we check <= endDate (cumulative), for expenses we check date range
                if (accountType === 'EXPENSE') {
                    if (startDate && formattedDate < startDate) continue;
                }
                if (endDate && formattedDate > endDate) continue;

                items.push({
                    id: item.id,
                    description: item.description,
                    amount: Number(item.actual_amount || item.estimated_amount || 0),
                    date: itemDateStr,
                    requisition_id: req.id,
                    requisition_ref: req.reference_number,
                    requisition_desc: req.description,
                    requestor_name: req.requestor?.name || 'Unknown'
                });
            }
        }

        // 2. Fetch cashbook entries if they apply
        // Cashbook entries directly apply to all accounts (except UNCATEGORIZED)
        if (accountId !== 'UNCATEGORIZED') {
            let cbQuery = supabase
                .from('cashbook_entries')
                .select(`
                    id,
                    description,
                    debit,
                    credit,
                    date,
                    requisition_id,
                    created_by,
                    creator:users!created_by(name)
                `)
                .eq('organization_id', organization_id);

            // Special check: bank/wallet/cash accounts are represented by wallet_id or account_type,
            // rather than account_id field in cashbook_entries
            const nameLower = account?.name?.toLowerCase() || '';
            const isBankWalletOrCash = account?.subtype === 'Bank' || nameLower.includes('wallet') || nameLower.includes('cash') || nameLower.includes('bank');

            if (isBankWalletOrCash && accountType === 'ASSET') {
                if (nameLower.includes('main') || account?.code === 'QB-1150040000') {
                    cbQuery = cbQuery.eq('account_type', 'MONEYWISE_WALLET');
                } else if (nameLower.includes('cash')) {
                    cbQuery = cbQuery.eq('account_type', 'CASH');
                } else {
                    // Specific wallet
                    const { data: wallets } = await supabase
                        .from('organization_wallets')
                        .select('id')
                        .eq('organization_id', organization_id)
                        .or(`name.eq."${account?.name}",qb_account_id.eq."${account?.qb_account_id}"`);

                    if (wallets && wallets.length > 0) {
                        cbQuery = cbQuery.eq('wallet_id', wallets[0].id);
                    } else {
                        cbQuery = cbQuery.eq('account_id', accountId);
                    }
                }
            } else {
                cbQuery = cbQuery.eq('account_id', accountId);
            }

            // Date filtering
            if (accountType === 'EXPENSE' || accountType === 'INCOME') {
                if (startDate) cbQuery = cbQuery.gte('date', startDate);
            }
            if (endDate) cbQuery = cbQuery.lte('date', endDate);

            const { data: cbData, error: cbError } = await cbQuery;
            if (cbError) throw cbError;

            for (const entry of (cbData || [])) {
                // If it is linked to a requisition and we are in EXPENSE, we already loaded it via line_items.
                // Avoid double-counting requisition entries.
                if (entry.requisition_id && accountType === 'EXPENSE') continue;

                // Amount direction depends on account type
                let amt = 0;
                if (accountType === 'EXPENSE' || accountType === 'ASSET') {
                    amt = Number(entry.credit || 0) - Number(entry.debit || 0);
                    // For Asset wallets, positive change is debit (money in), negative is credit (money out)
                    if (isBankWalletOrCash && accountType === 'ASSET') {
                        amt = Number(entry.debit || 0) - Number(entry.credit || 0);
                    }
                } else {
                    // INCOME, LIABILITY, EQUITY
                    amt = Number(entry.debit || 0) - Number(entry.credit || 0);
                }

                items.push({
                    id: entry.id,
                    description: entry.description,
                    amount: Math.abs(amt), // Show absolute amount in list
                    date: entry.date,
                    requisition_id: entry.requisition_id,
                    requisition_ref: entry.requisition_id ? 'REQ' : 'LEDGER',
                    requisition_desc: entry.description,
                    requestor_name: (entry as any).creator?.name || 'System'
                });
            }
        }

        // Sort items by date descending
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(items);
    } catch (error: any) {
        console.error('Error fetching expenditure items:', error);
        res.status(500).json({ error: 'Failed to fetch expenditure items', details: error.message });
    }
};
