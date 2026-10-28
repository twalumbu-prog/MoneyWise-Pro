/**
 * sendSummary.service.ts — what the person sees right after sending money from a personal account: which account the payment was
 * filed under, how much has been spent on that account this month (before and after), and what is left of its budget.
 *
 * The payment is categorised live (personalRequisitionClassifier), which can take a few seconds when the AI has to decide. This
 * waits for that — nudging it along if it hasn't started — then reads the numbers from the same report the Reporting page uses,
 * so the figures always agree with it.
 */
import { supabase } from '../lib/supabase';
import { maybeAutoCategorizePersonal } from './personalRequisitionClassifier.service';
import { getExpenditure } from '../controllers/report.controller';
import { callHandler } from './agent/internalCall';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SendSummaryError extends Error { constructor(message: string, public httpStatus = 400) { super(message); } }

export interface SendSummary {
    status: 'ready' | 'pending';
    requisitionId: string;
    /** This payment, in kwacha. */
    amount: number;
    description: string | null;
    account: { id: string; name: string; code: string | null } | null;
    /** This month's spending on that account, before this payment and including it. */
    spentBefore: number | null;
    spentAfter: number | null;
    /** This month's budget for the account (null when none is set). */
    budget: { amount: number; remaining: number; over: boolean; percentUsed: number } | null;
    month: string;
}

const monthRange = (now = new Date()) => {
    const y = now.getFullYear(), m = now.getMonth();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)), label: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
};

export async function getSendSummary(orgId: string, userId: string, requisitionId: string, waitMs = 14_000): Promise<SendSummary> {
    const { data: req } = await supabase.from('requisitions').select('id, organization_id, description, estimated_total').eq('id', requisitionId).maybeSingle();
    if (!req || (req as any).organization_id !== orgId) throw new SendSummaryError('Payment not found.', 404);

    const month = monthRange();
    const base: SendSummary = {
        status: 'pending', requisitionId, amount: round2(Number((req as any).estimated_total) || 0), description: (req as any).description ?? null,
        account: null, spentBefore: null, spentAfter: null, budget: null, month: month.label,
    };

    // Wait for the line item(s) to be filed under an account, starting the categorisation if nothing has.
    const deadline = Date.now() + waitMs;
    let items: any[] = [];
    let nudged = false;
    for (;;) {
        const { data } = await supabase.from('line_items').select('account_id, estimated_amount, actual_amount').eq('requisition_id', requisitionId);
        items = (data ?? []) as any[];
        if (items.some((i) => i.account_id)) break;
        if (Date.now() >= deadline) return base;
        if (!nudged) { nudged = true; void maybeAutoCategorizePersonal(requisitionId, orgId, userId).catch(() => undefined); }
        await sleep(1000);
    }

    // The account that took the most of this payment.
    const byAccount = new Map<string, number>();
    for (const i of items) if (i.account_id) byAccount.set(i.account_id, (byAccount.get(i.account_id) ?? 0) + Number(i.actual_amount ?? i.estimated_amount ?? 0));
    const [accountId, accountAmount] = [...byAccount.entries()].sort((a, b) => b[1] - a[1])[0];
    const { data: acc } = await supabase.from('accounts').select('id, name, code').eq('id', accountId).maybeSingle();
    if (!acc) return base;

    const spend = await callHandler(getExpenditure, { organizationId: orgId, userId, role: 'ADMIN', today: month.start } as any, { query: { startDate: month.start, endDate: month.end, mode: 'EXPENSE' } });
    const row = (Array.isArray(spend.body) ? spend.body : []).find((r: any) => String(r.account_id) === String(accountId));
    const spentAfter = round2(Number(row?.total_amount) || 0);
    const payment = round2(accountAmount);
    const spentBefore = round2(Math.max(0, spentAfter - payment));

    const { data: b } = await supabase.from('budgets').select('amount').eq('organization_id', orgId).eq('qb_account_id', accountId).eq('period_type', 'MONTHLY').eq('start_date', month.start).maybeSingle();
    const budgetAmount = b ? round2(Number((b as any).amount)) : null;

    return {
        ...base, status: 'ready', amount: round2(base.amount || payment),
        account: { id: (acc as any).id, name: (acc as any).name, code: (acc as any).code ?? null },
        spentBefore, spentAfter,
        budget: budgetAmount && budgetAmount > 0
            ? { amount: budgetAmount, remaining: round2(budgetAmount - spentAfter), over: spentAfter > budgetAmount, percentUsed: Math.round((spentAfter / budgetAmount) * 100) }
            : null,
    };
}
