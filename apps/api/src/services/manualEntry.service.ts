/**
 * manualEntry.service.ts — money that moved OUTSIDE MoneyWise (cash in hand, another bank, a personal mobile-money number),
 * recorded by hand against one of the person's external accounts. Shared by the app's "New manual entry" screen and the
 * Assistant ("I spent K10 cash on tomatoes"), so both book exactly the same way.
 */
import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { decisionRouter } from './ai/decision.router';

export class ManualEntryError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

export interface ExternalWallet { id: string; name: string; provider_type: string; provider_name: string | null }

export async function listExternalWallets(orgId: string): Promise<ExternalWallet[]> {
    const { data } = await supabase.from('external_wallets').select('id, name, provider_type, provider_name').eq('organization_id', orgId).order('name');
    return (data ?? []) as ExternalWallet[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const CASH_WORDS = ['cash', 'cashinhand', 'pettycash', 'pocket', 'wallet'];

/** Finds an external account by what the person called it ("cash", "my FNB", "airtel"). */
export function matchExternalWallet(wallets: ExternalWallet[], said: string): ExternalWallet | null {
    const q = norm(said || '');
    if (!q) return null;
    return wallets.find((w) => norm(w.name) === q)
        ?? wallets.find((w) => norm(w.name).includes(q) || q.includes(norm(w.name)))
        ?? wallets.find((w) => w.provider_name && (norm(w.provider_name).includes(q) || q.includes(norm(w.provider_name))))
        ?? null;
}

export const meansCash = (said: string) => CASH_WORDS.includes(norm(said || ''));

/** A "Cash" external account, created the first time someone records cash. */
export async function ensureCashWallet(orgId: string): Promise<ExternalWallet> {
    const existing = matchExternalWallet(await listExternalWallets(orgId), 'cash');
    if (existing) return existing;
    const { data, error } = await supabase.from('external_wallets')
        .insert({ organization_id: orgId, name: 'Cash', provider_type: 'CUSTOM', provider_name: null })
        .select('id, name, provider_type, provider_name').single();
    if (error || !data) {
        const again = matchExternalWallet(await listExternalWallets(orgId), 'cash');
        if (again) return again;
        throw new ManualEntryError(`Could not create a Cash account: ${error?.message}`, 500);
    }
    return data as ExternalWallet;
}

/** Categories that fit a direction: expense accounts for money out, income accounts for money in. */
export async function categoriesFor(orgId: string, direction: 'IN' | 'OUT'): Promise<any[]> {
    const { data } = await supabase.from('accounts').select('*').eq('organization_id', orgId).eq('is_active', true).eq('type', direction === 'IN' ? 'INCOME' : 'EXPENSE');
    return data ?? [];
}

/** The organisation's own categorisation (learned memory → rules → AI), the same one the app uses. */
export async function suggestCategory(orgId: string, direction: 'IN' | 'OUT', description: string, amount: number) {
    const candidates = await categoriesFor(orgId, direction);
    if (candidates.length === 0) return null;
    try {
        const decision = await decisionRouter.classify(candidates, { description, amount }, orgId);
        const byCode = new Map(candidates.map((a: any) => [String(a.code || '').toLowerCase(), a]));
        const match = decision.account_code ? byCode.get(String(decision.account_code).toLowerCase()) : null;
        if (match && decision.confidence >= 0.5) return { account: match, reasoning: decision.reasoning as string | null, confidence: decision.confidence as number };
    } catch (e: any) {
        console.error('[Manual entry] AI categorisation failed:', e.message);
    }
    return null;
}

export interface ManualEntryInput {
    orgId: string; userId: string; direction: 'IN' | 'OUT'; amount: number; description: string; date?: string;
    externalWalletId: string; accountId?: string | null;
    /** false = book it uncategorised rather than asking the AI (the Assistant always passes the category it showed). */
    autoCategorize?: boolean;
}

export async function recordManualEntry(p: ManualEntryInput) {
    if (p.direction !== 'IN' && p.direction !== 'OUT') throw new ManualEntryError('direction must be IN or OUT');
    const value = Math.round(Number(p.amount) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0) throw new ManualEntryError('Enter an amount greater than zero');
    const details = typeof p.description === 'string' ? p.description.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
    if (details.length < 2) throw new ManualEntryError('Add a short description of the transaction');
    const entryDate = typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : new Date().toISOString().split('T')[0];
    if (entryDate > new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0]) throw new ManualEntryError('The date cannot be in the future');

    const { data: wallet } = await supabase.from('external_wallets').select('id, name').eq('id', p.externalWalletId).eq('organization_id', p.orgId).maybeSingle();
    if (!wallet) throw new ManualEntryError('Choose one of your external accounts', 404);

    let chosen: any = null;
    let source: 'USER' | 'AI' | null = null;
    let reasoning: string | null = null;
    let confidence: number | null = null;
    if (p.accountId) {
        chosen = (await categoriesFor(p.orgId, p.direction)).find((a: any) => a.id === p.accountId) || null;
        if (!chosen) throw new ManualEntryError('That category is not valid for this kind of entry');
        source = 'USER';
    } else if (p.autoCategorize !== false) {
        const s = await suggestCategory(p.orgId, p.direction, details, value);
        if (s) { chosen = s.account; source = 'AI'; reasoning = s.reasoning; confidence = s.confidence; }
    }

    const reference = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = await cashbookService.createEntry(p.orgId, {
        entry_type: p.direction === 'IN' ? 'INFLOW' : 'EXPENSE',
        description: details,
        debit: p.direction === 'IN' ? value : 0,
        credit: p.direction === 'OUT' ? value : 0,
        date: entryDate,
        created_by: p.userId,
        account_type: wallet.id,          // external accounts are keyed by their own id
        account_id: chosen?.id ?? null,
        status: chosen ? 'ACCOUNTED' : 'COMPLETED',
        external_reference: reference,
    } as any);

    return {
        entryId: (entry as any).id,
        referenceNumber: (entry as any).reference_number ?? null,
        direction: p.direction,
        amount: value,
        date: entryDate,
        externalWallet: { id: wallet.id, name: wallet.name },
        category: chosen ? { id: chosen.id, code: chosen.code, name: chosen.name, emoji: chosen.emoji ?? null, source, reasoning, confidence } : null,
    };
}
