/**
 * read.tools.ts — Everything the agent can look at.
 *
 * Rules for every handler in here:
 *   • Scope by `ctx.organizationId` on the first query, always.
 *   • Return trimmed rows. Tool output goes straight into the context window,
 *     so ids and audit columns the model can't use are dropped.
 *   • Cap result counts. An unbounded select is a runaway token bill.
 */

import { supabase } from '../../../lib/supabase';
import { riskClassifier } from '../../ai/risk.classifier';
import { resolveEntryAccounting } from './accounting.util';
import { AgentContext, ToolDefinition } from '../types';

const MAX_ROWS = 200;

const money = (n: any) => Number(n ?? 0);

/**
 * Live balance for every wallet in one round trip.
 *
 * cashbookService.getCurrentBalance() issues a query per wallet, which is an
 * N+1 against a database on another continent — 3.6s for this app's 26 wallets,
 * paid on the orientation tool the model tends to call first. A wallet's
 * balance is the balance_after of its most recent non-pending entry, so one
 * ordered fetch plus a reduce gives the identical answer.
 */
async function walletBalances(ctx: AgentContext): Promise<Array<{ id: string; name: string; is_main: boolean; balance: number }>> {
    const [walletRes, entryRes] = await Promise.all([
        supabase
            .from('organization_wallets')
            .select('id, name, is_main')
            .eq('organization_id', ctx.organizationId),
        supabase
            .from('cashbook_entries')
            .select('wallet_id, balance_after, date, created_at')
            .eq('organization_id', ctx.organizationId)
            .eq('account_type', 'MONEYWISE_WALLET')
            .neq('status', 'PENDING')
            .not('wallet_id', 'is', null)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20_000),
    ]);

    // Rows arrive newest-first, so the first sighting of a wallet is its latest.
    const latest = new Map<string, number>();
    for (const row of entryRes.data ?? []) {
        if (row.wallet_id && !latest.has(row.wallet_id)) {
            latest.set(row.wallet_id, money(row.balance_after));
        }
    }

    return (walletRes.data ?? []).map(w => ({
        id: w.id,
        name: w.name,
        is_main: w.is_main,
        balance: latest.get(w.id) ?? 0,
    }));
}

/** Shared date-range params so every tool speaks the same dialect. */
const dateRangeProps = {
    startDate: { type: 'string', description: 'Inclusive ISO date, e.g. 2026-07-01. Omit for all time.' },
    endDate: { type: 'string', description: 'Inclusive ISO date, e.g. 2026-07-31. Omit for up to today.' },
};

// ─── Organisation shape ──────────────────────────────────────────────────────

const getOrgOverview: ToolDefinition = {
    name: 'get_org_overview',
    description:
        'Orientation tool. Returns the departments and requisition types actually in use and ' +
        'the valid status values, so you can filter on real values instead of guessing. ' +
        'Cheap and fast. For balances and totals use get_financial_position instead.',
    effect: 'read',
    parameters: { type: 'object', properties: {} },
    handler: async (ctx: AgentContext) => {
        // Deliberately one query. This tool is the model's first move on most
        // questions, so its cost is paid before the user sees anything — and
        // every extra round trip here is dead air on a link to another
        // continent. The org name is already in the system prompt, and balances
        // belong to get_financial_position.
        const { data, error } = await supabase
            .from('requisitions')
            .select('department, type')
            .eq('organization_id', ctx.organizationId)
            .limit(1000);
        if (error) throw new Error(error.message);

        const rows = data ?? [];
        return {
            currency: 'ZMW',
            today: ctx.today,
            departments_in_use: [...new Set(rows.map(r => r.department).filter(Boolean))],
            requisition_types_in_use: [...new Set(rows.map(r => r.type).filter(Boolean))],
            requisition_statuses: [
                'DRAFT', 'SUBMITTED', 'AUTHORISED', 'RECEIVED',
                'CHANGE_SUBMITTED', 'DISBURSED', 'COMPLETED', 'REJECTED',
            ],
        };
    },
};

// ─── Requisitions ────────────────────────────────────────────────────────────

const searchRequisitions: ToolDefinition = {
    name: 'search_requisitions',
    description:
        'Find requisitions by free text, status, department, requester or date range. ' +
        'Returns headers only — follow up with get_requisition_details for line items.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Text matched against the requisition description.' },
            status: { type: 'string', description: 'Exact status, e.g. COMPLETED.' },
            department: { type: 'string', description: 'Department name, partial match allowed.' },
            staffName: { type: 'string', description: 'Requester name, partial match allowed.' },
            minAmount: { type: 'number', description: 'Only requisitions at or above this total.' },
            ...dateRangeProps,
            limit: { type: 'number', description: 'Max rows, default 25, hard cap 200.' },
        },
    },
    handler: async (ctx, args) => {
        let q = supabase
            .from('requisitions')
            .select('id, reference_number, description, department, type, status, staff_name, estimated_total, actual_total, created_at')
            .eq('organization_id', ctx.organizationId)
            .order('created_at', { ascending: false })
            .limit(Math.min(args.limit ?? 25, MAX_ROWS));

        if (args.status) q = q.eq('status', args.status);
        if (args.query) q = q.ilike('description', `%${args.query}%`);
        if (args.department) q = q.ilike('department', `%${args.department}%`);
        if (args.staffName) q = q.ilike('staff_name', `%${args.staffName}%`);
        if (args.startDate) q = q.gte('created_at', args.startDate);
        if (args.endDate) q = q.lte('created_at', `${args.endDate}T23:59:59`);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        const rows = (data ?? []).filter(r =>
            args.minAmount == null || money(r.actual_total ?? r.estimated_total) >= args.minAmount
        );

        return {
            count: rows.length,
            note: rows.length >= (args.limit ?? 25) ? 'Result set was truncated — narrow the filters for a complete picture.' : undefined,
            results: rows,
        };
    },
};

const getRequisitionDetails: ToolDefinition = {
    name: 'get_requisition_details',
    description:
        'Full detail for one or more requisitions, including every line item with its ' +
        'quantity, unit price, actual amount, expense account, and its own id — the id a ' +
        'line item needs is here, not on search_transactions\' results. accounted: false on a ' +
        'line item means categorize_requisition_expense can classify it. Pass several ' +
        'requisition ids at once rather than calling this repeatedly.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            requisitionIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Requisition UUIDs, from search_requisitions. Max 25.',
            },
        },
        required: ['requisitionIds'],
    },
    handler: async (ctx, args) => {
        const ids: string[] = (args.requisitionIds ?? []).slice(0, 25);
        if (!ids.length) return { requisitions: [] };

        // Org filter on the header query is what scopes the line items too:
        // items are only returned for headers that survived this filter.
        const { data: reqs, error } = await supabase
            .from('requisitions')
            .select('id, reference_number, description, department, type, status, staff_name, estimated_total, actual_total, payment_method, created_at')
            .in('id', ids)
            .eq('organization_id', ctx.organizationId);
        if (error) throw new Error(error.message);

        const ownedIds = (reqs ?? []).map(r => r.id);
        if (!ownedIds.length) return { requisitions: [] };

        const { data: items } = await supabase
            .from('line_items')
            .select('id, requisition_id, description, quantity, unit_price, estimated_amount, actual_amount, account_id, qb_account_name, payment_method, accounts(name)')
            .in('requisition_id', ownedIds);

        return {
            requisitions: (reqs ?? []).map(r => ({
                ...r,
                line_items: (items ?? [])
                    .filter(i => i.requisition_id === r.id)
                    .map(({ requisition_id, account_id, accounts, qb_account_name, ...rest }: any) => ({
                        ...rest,
                        account: accounts?.name ?? qb_account_name ?? null,
                        accounted: !!account_id,
                    })),
            })),
        };
    },
};

// ─── Ledger / cashbook ───────────────────────────────────────────────────────

const searchTransactions: ToolDefinition = {
    name: 'search_transactions',
    description:
        'Search the cashbook ledger — every money-in and money-out entry. Use this for ' +
        'questions about payments received, spending, specific vendors or bank activity. ' +
        'debit = money in, credit = money out. Every result includes its entry id and its ' +
        'true accounted status, resolved from the posted general ledger (not just whether the ' +
        'entry itself carries an account — a requisition-driven expense is classified through ' +
        'its line items, not the transaction row, and this correctly recognises that) — pass ' +
        'unaccountedOnly to find the ones still genuinely needing classification. Check ' +
        'requisition_id before picking a write tool: null → categorize_transaction with the ' +
        'entry id; set → get_requisition_details with that id, then categorize_requisition_expense ' +
        'on whichever line items come back with accounted: false.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Text matched against the entry description.' },
            direction: { type: 'string', enum: ['in', 'out', 'both'], description: 'Default both.' },
            walletName: { type: 'string', description: 'Restrict to one wallet by name, e.g. "Main Wallet".' },
            status: {
                type: 'string',
                enum: ['PENDING', 'COMPLETED', 'DISBURSED', 'UNACCOUNTED'],
                description: 'Exact ledger status. Omit to see everything except PENDING (the default view).',
            },
            unaccountedOnly: {
                type: 'boolean',
                description: 'Only entries whose posted journal still has an amount sitting in Suspense — i.e. genuinely not fully classified yet.',
            },
            minAmount: { type: 'number' },
            ...dateRangeProps,
            limit: { type: 'number', description: 'Max rows, default 50, hard cap 200.' },
        },
    },
    handler: async (ctx, args) => {
        let walletId: string | undefined;
        if (args.walletName) {
            const { data: w } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', ctx.organizationId)
                .ilike('name', `%${args.walletName}%`)
                .maybeSingle();
            walletId = w?.id;
        }

        let q = supabase
            .from('cashbook_entries')
            .select('id, date, description, debit, credit, balance_after, entry_type, reference_number, status, requisition_id')
            .eq('organization_id', ctx.organizationId)
            .order('date', { ascending: false })
            .limit(Math.min(args.limit ?? 50, MAX_ROWS));

        // An explicit status is a deliberate filter; otherwise PENDING (not yet
        // finalized) is hidden as noise the user didn't ask about.
        if (args.status) q = q.eq('status', args.status);
        else q = q.neq('status', 'PENDING');

        if (walletId) q = q.eq('wallet_id', walletId);
        if (args.query) q = q.ilike('description', `%${args.query}%`);
        if (args.startDate) q = q.gte('date', args.startDate);
        if (args.endDate) q = q.lte('date', args.endDate);
        if (args.direction === 'in') q = q.gt('debit', 0);
        if (args.direction === 'out') q = q.gt('credit', 0);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        let candidates = (data ?? []).filter(r =>
            args.minAmount == null || Math.max(money(r.debit), money(r.credit)) >= args.minAmount
        );

        // Resolved from the posted journal, not from cashbook_entries.account_id
        // directly — see accounting.util.ts for why that column alone is wrong
        // for any entry with a requisition attached.
        const accounting = await resolveEntryAccounting(ctx.organizationId, candidates.map(r => r.id));

        if (args.unaccountedOnly) {
            candidates = candidates.filter(r => !(accounting.get(r.id)?.accounted ?? false));
        }

        const rows = candidates.map((r: any) => {
            const status = accounting.get(r.id);
            return {
                id: r.id,
                date: r.date,
                description: r.description,
                debit: r.debit,
                credit: r.credit,
                balance_after: r.balance_after,
                entry_type: r.entry_type,
                reference_number: r.reference_number,
                status: r.status,
                account: status?.dominantAccountName ?? null,
                accounted: status?.accounted ?? false,
                // When set, categorize_transaction will refuse this entry — use
                // get_requisition_details + categorize_requisition_expense
                // instead. Checking this avoids a wasted round trip finding out.
                requisition_id: r.requisition_id ?? null,
            };
        });

        return {
            count: rows.length,
            total_in: rows.reduce((s, r) => s + money(r.debit), 0),
            total_out: rows.reduce((s, r) => s + money(r.credit), 0),
            results: rows,
        };
    },
};

const aggregateSpending: ToolDefinition = {
    name: 'aggregate_spending',
    description:
        'Group and total ledger activity without pulling every row. Use this for "how much ' +
        'did we spend on X", month-over-month trends, or any figure you would otherwise add ' +
        'up by hand — the arithmetic happens here, not in your head.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            groupBy: {
                type: 'string',
                enum: ['month', 'week', 'day', 'account', 'department', 'wallet'],
                description: 'Dimension to group by.',
            },
            direction: { type: 'string', enum: ['in', 'out', 'both'], description: 'Default out (spending).' },
            ...dateRangeProps,
        },
        required: ['groupBy'],
    },
    handler: async (ctx, args) => {
        const direction = args.direction ?? 'out';

        // Department isn't on the ledger — it lives on the requisition, so that
        // breakdown is sourced from requisitions instead.
        if (args.groupBy === 'department') {
            let q = supabase
                .from('requisitions')
                .select('department, estimated_total, actual_total, created_at')
                .eq('organization_id', ctx.organizationId);
            if (args.startDate) q = q.gte('created_at', args.startDate);
            if (args.endDate) q = q.lte('created_at', `${args.endDate}T23:59:59`);

            const { data, error } = await q;
            if (error) throw new Error(error.message);

            const buckets = new Map<string, { total: number; count: number }>();
            for (const r of data ?? []) {
                const key = r.department || 'Unassigned';
                const cur = buckets.get(key) ?? { total: 0, count: 0 };
                cur.total += money(r.actual_total ?? r.estimated_total);
                cur.count += 1;
                buckets.set(key, cur);
            }
            return {
                group_by: 'department',
                source: 'requisitions',
                groups: [...buckets.entries()]
                    .map(([label, v]) => ({ label, total: Number(v.total.toFixed(2)), count: v.count }))
                    .sort((a, b) => b.total - a.total),
            };
        }

        // Account grouping reads the posted general ledger (journal_lines),
        // not cashbook_entries.account_id — that column is only ever set for
        // entries with no requisition attached (see accounting.util.ts). A
        // requisition-driven expense's real classification is split across
        // its journal lines instead, and journal_lines already has that
        // computed correctly, including a single cashbook entry landing
        // partly in a real account and partly in Suspense. Reading it here
        // instead of re-deriving it is what makes this match reality rather
        // than inflating "Uncategorised" with spend that's actually classified.
        if (args.groupBy === 'account') {
            let jq = supabase
                .from('journal_lines')
                .select('debit, credit, accounts(name, type), journal_entries!inner(entry_date, organization_id, source_type)')
                .eq('journal_entries.organization_id', ctx.organizationId)
                .eq('journal_entries.source_type', 'CASHBOOK')
                .limit(20000);
            if (args.startDate) jq = jq.gte('journal_entries.entry_date', args.startDate);
            if (args.endDate) jq = jq.lte('journal_entries.entry_date', args.endDate);

            const { data: lines, error: jErr } = await jq;
            if (jErr) throw new Error(jErr.message);

            const jBuckets = new Map<string, { total: number; count: number }>();
            for (const l of (lines ?? []) as any[]) {
                // The cash/wallet leg of every entry is an ASSET account —
                // excluding it is what keeps this a spend/income breakdown
                // rather than double-counting the cash movement itself.
                if (l.accounts?.type === 'ASSET') continue;

                const amount =
                    direction === 'in' ? money(l.credit)
                    : direction === 'out' ? money(l.debit)
                    : money(l.debit) + money(l.credit);
                if (amount === 0) continue;

                const label = l.accounts?.name ?? 'Uncategorised';
                const cur = jBuckets.get(label) ?? { total: 0, count: 0 };
                cur.total += amount;
                cur.count += 1;
                jBuckets.set(label, cur);
            }

            const groups = [...jBuckets.entries()]
                .map(([label, v]) => ({ label, total: Number(v.total.toFixed(2)), count: v.count }))
                .sort((a, b) => b.total - a.total);

            return {
                group_by: 'account',
                source: 'journal_lines (the posted ledger, not the raw cashbook row)',
                direction,
                period: { startDate: args.startDate, endDate: args.endDate },
                grand_total: Number(groups.reduce((s, g) => s + g.total, 0).toFixed(2)),
                groups,
            };
        }

        let q = supabase
            .from('cashbook_entries')
            .select('date, debit, credit, wallet_id')
            .eq('organization_id', ctx.organizationId)
            .neq('status', 'PENDING')
            .limit(10000);
        if (args.startDate) q = q.gte('date', args.startDate);
        if (args.endDate) q = q.lte('date', args.endDate);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        // Resolve ids to names once, up front, so groups come back readable.
        const labelFor = await buildLabelResolver(ctx, args.groupBy);

        const buckets = new Map<string, { total: number; count: number }>();
        for (const r of data ?? []) {
            const amount =
                direction === 'in' ? money(r.debit)
                : direction === 'out' ? money(r.credit)
                : money(r.debit) + money(r.credit);
            if (amount === 0) continue;

            const key = bucketKey(args.groupBy, r, labelFor);
            const cur = buckets.get(key) ?? { total: 0, count: 0 };
            cur.total += amount;
            cur.count += 1;
            buckets.set(key, cur);
        }

        const groups = [...buckets.entries()].map(([label, v]) => ({
            label,
            total: Number(v.total.toFixed(2)),
            count: v.count,
        }));

        // Time buckets read best chronologically; categorical ones by size.
        const chronological = ['month', 'week', 'day'].includes(args.groupBy);
        groups.sort(chronological ? (a, b) => a.label.localeCompare(b.label) : (a, b) => b.total - a.total);

        return {
            group_by: args.groupBy,
            direction,
            period: { startDate: args.startDate, endDate: args.endDate },
            grand_total: Number(groups.reduce((s, g) => s + g.total, 0).toFixed(2)),
            groups,
        };
    },
};

// 'account' is handled separately, above (reads journal_lines, not this
// resolver) — this only ever runs for 'wallet' now.
async function buildLabelResolver(ctx: AgentContext, groupBy: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (groupBy === 'wallet') {
        const { data } = await supabase
            .from('organization_wallets')
            .select('id, name')
            .eq('organization_id', ctx.organizationId);
        for (const w of data ?? []) map.set(w.id, w.name);
    }
    return map;
}

function bucketKey(groupBy: string, row: any, labels: Map<string, string>): string {
    const date: string = row.date ?? '';
    switch (groupBy) {
        case 'month': return date.slice(0, 7);
        case 'day': return date.slice(0, 10);
        case 'week': {
            const d = new Date(date);
            // ISO-ish week anchor: back up to Monday.
            const day = (d.getUTCDay() + 6) % 7;
            d.setUTCDate(d.getUTCDate() - day);
            return d.toISOString().slice(0, 10);
        }
        case 'wallet': return labels.get(row.wallet_id) ?? 'Main';
        default: return 'All';
    }
}

const getFinancialPosition: ToolDefinition = {
    name: 'get_financial_position',
    description:
        'Headline numbers for a period: money in, money out, net movement, closing wallet ' +
        'balances and requisition volume. The right first call for "how are we doing".',
    effect: 'read',
    parameters: { type: 'object', properties: { ...dateRangeProps } },
    handler: async (ctx, args) => {
        let ledger = supabase
            .from('cashbook_entries')
            .select('debit, credit')
            .eq('organization_id', ctx.organizationId)
            .neq('status', 'PENDING')
            .limit(10000);
        if (args.startDate) ledger = ledger.gte('date', args.startDate);
        if (args.endDate) ledger = ledger.lte('date', args.endDate);

        let reqs = supabase
            .from('requisitions')
            .select('status, estimated_total, actual_total')
            .eq('organization_id', ctx.organizationId)
            .limit(5000);
        if (args.startDate) reqs = reqs.gte('created_at', args.startDate);
        if (args.endDate) reqs = reqs.lte('created_at', `${args.endDate}T23:59:59`);

        const [ledgerRes, reqRes, allWallets] = await Promise.all([
            ledger,
            reqs,
            walletBalances(ctx),
        ]);

        const totalIn = (ledgerRes.data ?? []).reduce((s, r) => s + money(r.debit), 0);
        const totalOut = (ledgerRes.data ?? []).reduce((s, r) => s + money(r.credit), 0);

        const wallets = allWallets.map(({ name, balance }) => ({ name, balance }));

        const byStatus: Record<string, number> = {};
        for (const r of reqRes.data ?? []) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

        return {
            period: { startDate: args.startDate ?? 'all time', endDate: args.endDate ?? ctx.today },
            money_in: Number(totalIn.toFixed(2)),
            money_out: Number(totalOut.toFixed(2)),
            net_movement: Number((totalIn - totalOut).toFixed(2)),
            wallets,
            total_wallet_balance: Number(wallets.reduce((s, w) => s + w.balance, 0).toFixed(2)),
            requisitions: {
                count: reqRes.data?.length ?? 0,
                by_status: byStatus,
                total_value: Number(
                    (reqRes.data ?? []).reduce((s, r) => s + money(r.actual_total ?? r.estimated_total), 0).toFixed(2)
                ),
            },
        };
    },
};

const flagRiskyTransactions: ToolDefinition = {
    name: 'flag_risky_transactions',
    description:
        'Screen cashbook entries in a period for ones worth a closer look: high value, ' +
        'sensitive accounts (payroll, tax, transfers, loans), or barely-described entries. ' +
        'Use this for "audit our spending", "find suspicious transactions" or "what should ' +
        'we review". This is a heuristic screen, not a definitive finding — say so, and ' +
        'suggest what to check on anything it surfaces.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            ...dateRangeProps,
            minLevel: {
                type: 'string',
                enum: ['MEDIUM', 'HIGH'],
                description: 'Lowest risk level to include. Default MEDIUM (i.e. everything worth a look).',
            },
            limit: { type: 'number', description: 'Max rows, default 30, hard cap 100.' },
        },
    },
    handler: async (ctx, args) => {
        let q = supabase
            .from('cashbook_entries')
            .select('id, date, description, debit, credit, reference_number')
            .eq('organization_id', ctx.organizationId)
            .neq('status', 'PENDING')
            .order('date', { ascending: false })
            .limit(5000);
        if (args.startDate) q = q.gte('date', args.startDate);
        if (args.endDate) q = q.lte('date', args.endDate);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        // Resolved from the posted journal (see accounting.util.ts) — a plain
        // accounts(name) join on cashbook_entries.account_id misses every
        // requisition-driven entry, which would silently drop the "sensitive
        // account name" signal (payroll, transfer, capital…) for most of an
        // org's actual expense transactions.
        const accounting = await resolveEntryAccounting(ctx.organizationId, (data ?? []).map(r => r.id));

        const minLevel = args.minLevel ?? 'MEDIUM';
        const rank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

        const flagged = (data ?? [])
            .map((r: any) => {
                const amount = Math.max(money(r.debit), money(r.credit));
                const accountName = accounting.get(r.id)?.dominantAccountName ?? undefined;
                const assessment = riskClassifier.assess({
                    description: r.description ?? '',
                    amount,
                    accountName,
                });
                return { row: r, amount, assessment, accountName };
            })
            .filter(x => rank[x.assessment.riskLevel] >= rank[minLevel])
            .sort((a, b) => rank[b.assessment.riskLevel] - rank[a.assessment.riskLevel] || b.amount - a.amount)
            .slice(0, Math.min(args.limit ?? 30, 100))
            .map(x => ({
                id: x.row.id,
                date: x.row.date,
                description: x.row.description,
                amount: x.amount,
                direction: money(x.row.debit) > 0 ? 'in' : 'out',
                account: x.accountName ?? 'Unclassified',
                reference_number: x.row.reference_number,
                risk_level: x.assessment.riskLevel,
                reasons: x.assessment.reasons,
            }));

        return {
            method: 'Heuristic screen: transaction value, sensitive-account keywords, description ' +
                'ambiguity. Not a substitute for a full audit — treat flags as a starting point.',
            period: { startDate: args.startDate ?? 'all time', endDate: args.endDate ?? ctx.today },
            scanned: data?.length ?? 0,
            flagged_count: flagged.length,
            flagged,
        };
    },
};

// ─── Schedules, accounts, sales ──────────────────────────────────────────────

const listScheduledItems: ToolDefinition = {
    name: 'list_scheduled_items',
    description:
        'The recurring expense schedule — bills, subscriptions, loan repayments and ' +
        'investments, with their cadence and next due date.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            category: {
                type: 'string',
                enum: ['BILLS', 'SUBSCRIPTIONS', 'INVESTMENTS', 'LOAN_REPAYMENTS', 'GENERAL_EXPENSES'],
            },
            status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'], description: 'Default ACTIVE.' },
            dueBefore: { type: 'string', description: 'ISO date — only items due on or before this.' },
        },
    },
    handler: async (ctx, args) => {
        let q = supabase
            .from('scheduled_items')
            .select('id, title, amount, category, cadence, next_due_date, description, status, payment_method, recipient_name')
            .eq('organization_id', ctx.organizationId)
            .eq('status', args.status ?? 'ACTIVE')
            .order('next_due_date', { ascending: true })
            .limit(MAX_ROWS);

        if (args.category) q = q.eq('category', args.category);
        if (args.dueBefore) q = q.lte('next_due_date', args.dueBefore);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        return {
            count: data?.length ?? 0,
            monthly_equivalent: Number(
                (data ?? []).reduce((s, i) => s + monthlyEquivalent(money(i.amount), i.cadence), 0).toFixed(2)
            ),
            items: data ?? [],
        };
    },
};

/** Normalises any cadence to a monthly run-rate so totals are comparable. */
function monthlyEquivalent(amount: number, cadence: string): number {
    switch (cadence) {
        case 'DAILY': return amount * 30;
        case 'WEEKLY': return amount * 4.345;
        case 'BIWEEKLY': return amount * 2.17;
        case 'QUARTERLY': return amount / 3;
        default: return amount;
    }
}

const listAccounts: ToolDefinition = {
    name: 'list_accounts',
    description:
        'The chart of accounts — the expense, income, asset and liability categories this ' +
        'organisation books against. Use it to resolve an account name before filtering.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            type: { type: 'string', description: 'Filter by account type, e.g. EXPENSE, INCOME, ASSET.' },
            query: { type: 'string', description: 'Partial account name match.' },
        },
    },
    handler: async (ctx, args) => {
        let q = supabase
            .from('accounts')
            .select('code, name, type, category, subtype')
            .eq('organization_id', ctx.organizationId)
            .eq('is_active', true)
            .order('code')
            .limit(MAX_ROWS);
        if (args.type) q = q.ilike('type', args.type);
        if (args.query) q = q.ilike('name', `%${args.query}%`);

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { count: data?.length ?? 0, accounts: data ?? [] };
    },
};

const getSalesSummary: ToolDefinition = {
    name: 'get_sales_summary',
    description:
        'Product sales and payment-link revenue for a period, broken down by product. ' +
        'Use for income-side questions rather than search_transactions.',
    effect: 'read',
    parameters: { type: 'object', properties: { ...dateRangeProps } },
    handler: async (ctx, args) => {
        let q = supabase
            .from('product_sales')
            .select('product_id, quantity, amount_paid, created_at, status')
            .eq('organization_id', ctx.organizationId)
            .limit(5000);
        if (args.startDate) q = q.gte('created_at', args.startDate);
        if (args.endDate) q = q.lte('created_at', `${args.endDate}T23:59:59`);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        const { data: products } = await supabase
            .from('products')
            .select('id, name')
            .eq('organization_id', ctx.organizationId);
        const nameFor = new Map((products ?? []).map(p => [p.id, p.name]));

        const buckets = new Map<string, { revenue: number; units: number; orders: number }>();
        for (const s of data ?? []) {
            const key = nameFor.get(s.product_id) ?? 'Unknown product';
            const cur = buckets.get(key) ?? { revenue: 0, units: 0, orders: 0 };
            cur.revenue += money(s.amount_paid);
            cur.units += Number(s.quantity ?? 1);
            cur.orders += 1;
            buckets.set(key, cur);
        }

        const byProduct = [...buckets.entries()]
            .map(([product, v]) => ({ product, revenue: Number(v.revenue.toFixed(2)), units: v.units, orders: v.orders }))
            .sort((a, b) => b.revenue - a.revenue);

        return {
            period: { startDate: args.startDate ?? 'all time', endDate: args.endDate ?? ctx.today },
            total_revenue: Number(byProduct.reduce((s, p) => s + p.revenue, 0).toFixed(2)),
            total_orders: byProduct.reduce((s, p) => s + p.orders, 0),
            by_product: byProduct,
        };
    },
};

export const readTools: ToolDefinition[] = [
    getOrgOverview,
    searchRequisitions,
    getRequisitionDetails,
    searchTransactions,
    aggregateSpending,
    flagRiskyTransactions,
    getFinancialPosition,
    listScheduledItems,
    listAccounts,
    getSalesSummary,
];
