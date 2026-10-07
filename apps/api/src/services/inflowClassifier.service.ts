/**
 * inflowClassifier.service.ts — AI auto-categorisation of money received, for personal accounts.
 *
 * A business sorts its inflows (sales, fees…) by hand or by product; a personal account is one
 * person with no accountant, so every deposit that lands is categorised for them straight away
 * (Salary, Gift, Refund…) through the same decisionRouter the manual entries and requisitions use.
 * Entries the AI isn't confident about are left uncategorised for the user to pick.
 *
 * Skipped on purpose: movements of the user's own money that aren't income — savings pots,
 * cash→wallet transfers, investment deposits and requisition change returns.
 */
import { supabase } from '../lib/supabase';

const NOT_INCOME = /^(savings:|transfer to moneywise|investment deposit|requisition change|wallet to wallet)/i;
const NOT_INCOME_REF = /^(CHG-|SAV|INV)/i;
const MIN_CONFIDENCE = 0.5;

async function isPersonalOrg(organizationId: string): Promise<boolean> {
    const { data } = await supabase.from('organizations').select('name, is_personal').eq('id', organizationId).maybeSingle();
    if (!data) return false;
    if ((data as any).is_personal === true) return true;
    const n = String((data as any).name || '').toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual') || n.includes('private');
}

export async function classifyPersonalInflow(organizationId: string, entry: any): Promise<boolean> {
    try {
        if (!entry?.id || entry.entry_type !== 'INFLOW' || Number(entry.debit) <= 0) return false;
        if (entry.account_id || entry.status === 'PENDING') return false;
        const description = String(entry.description || '').replace(/^PENDING_INTENT:\s*/i, '').split(' | Ref:')[0].trim();
        if (description.length < 2 || NOT_INCOME.test(description)) return false;
        if (NOT_INCOME_REF.test(String(entry.external_reference || ''))) return false;
        if (!(await isPersonalOrg(organizationId))) return false;

        if (entry.wallet_id) {
            const { data: w } = await supabase.from('organization_wallets').select('name').eq('id', entry.wallet_id).maybeSingle();
            if (/\(savings\)$/i.test(String((w as any)?.name || ''))) return false;
        }

        const { data: accounts } = await supabase
            .from('accounts')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .eq('type', 'INCOME');
        const candidates = accounts || [];
        if (candidates.length === 0) return false;

        const { decisionRouter } = await import('./ai/decision.router');
        const decision = await decisionRouter.classify(candidates, { description, amount: Number(entry.debit) }, organizationId);
        const byCode = new Map(candidates.map((a: any) => [String(a.code || '').toLowerCase(), a]));
        const match: any = decision.account_code ? byCode.get(String(decision.account_code).toLowerCase()) : null;
        if (!match || decision.confidence < MIN_CONFIDENCE) return false;

        const { data: updated } = await supabase
            .from('cashbook_entries')
            .update({ account_id: match.id, status: 'ACCOUNTED' })
            .eq('id', entry.id)
            .eq('organization_id', organizationId)
            .is('account_id', null)
            .select('id')
            .maybeSingle();
        if (!updated) return false;

        const { ledgerService } = await import('./ledger.service');
        await ledgerService.repostForCashbookEntry(entry.id).catch((e: any) =>
            console.error(`[InflowClassifier] repost failed for ${entry.id}:`, e?.message));
        console.log(`[InflowClassifier] ${entry.id} "${description}" → ${match.name} (${Math.round(decision.confidence * 100)}%)`);
        return true;
    } catch (e: any) {
        console.error('[InflowClassifier] failed (entry left uncategorised):', e?.message);
        return false;
    }
}

/** Catch-up for personal inflows that landed uncategorised (AI was slow/down, or arrived another way). */
export async function classifyRecentPersonalInflows(organizationId: string, budgetMs = 9000): Promise<number> {
    if (!(await isPersonalOrg(organizationId))) return 0;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
        .from('cashbook_entries')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('entry_type', 'INFLOW')
        .is('account_id', null)
        .gt('debit', 0)
        .neq('status', 'PENDING')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(8);
    const started = Date.now();
    let done = 0;
    for (const e of data || []) {
        if (Date.now() - started > budgetMs) break;
        if (await classifyPersonalInflow(organizationId, e)) done++;
    }
    return done;
}

export interface ClassifyOneResult {
    classified: boolean;
    account?: { id: string; code: string | null; name: string };
    confidence?: number;
    reasoning?: string | null;
    message?: string;
}

/**
 * User-triggered "Auto Classify" on a single ledger entry (deposit or payment, any account type).
 * Unlike the automatic personal-inflow pass this has no skip rules or confidence cut-off beyond
 * "the AI must name one of the org's own accounts": the user asked, so they get the best match
 * (and the reasoning) rather than silence. Money in → INCOME accounts, money out → EXPENSE accounts.
 */
export async function classifyOneEntry(organizationId: string, entryId: string): Promise<ClassifyOneResult> {
    const { data: entry } = await supabase
        .from('cashbook_entries')
        .select('*')
        .eq('id', entryId)
        .eq('organization_id', organizationId)
        .maybeSingle();
    if (!entry) return { classified: false, message: 'Transaction not found.' };

    const isIn = Number(entry.debit) > 0;
    const description = String(entry.description || '').replace(/^PENDING_INTENT:\s*/i, '').split(' | Ref:')[0].trim();
    const amount = Number(isIn ? entry.debit : entry.credit);
    if (description.length < 2) return { classified: false, message: 'This transaction has no description to classify.' };

    const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .eq('type', isIn ? 'INCOME' : 'EXPENSE');
    const candidates = accounts || [];
    if (candidates.length === 0) {
        return { classified: false, message: `There are no ${isIn ? 'income' : 'expense'} accounts in your chart of accounts yet.` };
    }

    const { decisionRouter } = await import('./ai/decision.router');
    const decision = await decisionRouter.classify(candidates, { description, amount }, organizationId);
    const byCode = new Map(candidates.map((a: any) => [String(a.code || '').toLowerCase(), a]));
    const match: any = decision.account_code ? byCode.get(String(decision.account_code).toLowerCase()) : null;
    if (!match) {
        return { classified: false, message: 'The AI couldn’t find a confident match. Please choose an account yourself.', reasoning: decision.reasoning };
    }

    await supabase
        .from('cashbook_entries')
        .update({ account_id: match.id, status: entry.status === 'COMPLETED' ? 'ACCOUNTED' : entry.status })
        .eq('id', entryId)
        .eq('organization_id', organizationId);
    const { ledgerService } = await import('./ledger.service');
    await ledgerService.repostForCashbookEntry(entryId).catch((e: any) =>
        console.error(`[InflowClassifier] repost failed for ${entryId}:`, e?.message));

    return { classified: true, account: { id: match.id, code: match.code ?? null, name: match.name }, confidence: decision.confidence, reasoning: decision.reasoning };
}


/**
 * Savings entries are deterministic: money moving in or out of a savings pot has a known source and
 * destination, so it is classified straight to the org's "Savings Transfers" account — no AI, no
 * confidence threshold. Covers entries created before this existed and deposits that arrive from
 * outside (Lenco / mobile money) through the webhook or the sync.
 */
async function isSavingsWallet(walletId: string | null | undefined): Promise<boolean> {
    if (!walletId) return false;
    const { data } = await supabase.from('organization_wallets').select('name').eq('id', walletId).maybeSingle();
    return /\(savings\)$/i.test(String((data as any)?.name || ''));
}

export async function classifySavingsEntry(organizationId: string, entry: any): Promise<boolean> {
    try {
        if (!entry?.id || entry.account_id || entry.status === 'PENDING') return false;
        if (Math.abs(Number(entry.debit || 0) - Number(entry.credit || 0)) < 0.005) return false; // opening / zero markers
        if (!(await isSavingsWallet(entry.wallet_id))) return false;

        const { ensureSavingsTransferAccount } = await import('./ledger.service');
        const accountId = await ensureSavingsTransferAccount(organizationId);
        if (!accountId) return false;

        const { data: updated } = await supabase
            .from('cashbook_entries')
            .update({ account_id: accountId, status: entry.status === 'COMPLETED' ? 'ACCOUNTED' : entry.status })
            .eq('id', entry.id)
            .eq('organization_id', organizationId)
            .is('account_id', null)
            .select('id')
            .maybeSingle();
        if (!updated) return false;

        const { ledgerService } = await import('./ledger.service');
        await ledgerService.repostForCashbookEntry(entry.id).catch((e: any) =>
            console.error(`[InflowClassifier] savings repost failed for ${entry.id}:`, e?.message));
        return true;
    } catch (e: any) {
        console.error('[InflowClassifier] savings classify failed:', e?.message);
        return false;
    }
}

/** Catch-up: classify any savings-wallet entry that is still unassigned. Two cheap queries when there is nothing to do. */
export async function classifyRecentSavingsEntries(organizationId: string, limit = 40): Promise<number> {
    try {
        const { data: wallets } = await supabase
            .from('organization_wallets')
            .select('id')
            .eq('organization_id', organizationId)
            .ilike('name', '%(Savings)');
        const ids = (wallets || []).map((w: any) => w.id);
        if (ids.length === 0) return 0;

        const { data } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organizationId)
            .in('wallet_id', ids)
            .is('account_id', null)
            .neq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(limit);
        let done = 0;
        for (const e of data || []) if (await classifySavingsEntry(organizationId, e)) done++;
        return done;
    } catch { return 0; }
}
