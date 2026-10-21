/** Helpers shared by the public API controllers. */
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';

export const CURRENCY = 'ZMW';
export const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const clampLimit = (raw: unknown, def = 50, max = 200) => {
    const n = parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
};

export const fail = (res: any, status: number, message: string, err?: { message?: string }) => {
    if (err) console.error(`[PublicAPI] ${message}:`, err.message);
    return res.status(status).json({ error: message });
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ExternalWalletSummary {
    id: string;
    name: string;
    provider_type: string;
    provider_name: string | null;
    currency: string;
    // What MoneyWise has recorded against this account: a running total of the payments booked to it.
    // It is NOT the bank's own balance; compare it with `statement` once a statement has been imported.
    ledger_balance: number;
    ledger_entries: number;
    last_entry_date: string | null;
    statement: {
        lines: number;
        latest_date: string | null;
        latest_balance: number | null;
        // latest_balance - ledger_balance. null until a statement with a balance has been imported.
        difference: number | null;
    };
}

const summarise = async (orgId: string, w: any): Promise<ExternalWalletSummary> => {
    const [balance, entries, lastEntry, lines, lastLine] = await Promise.all([
        cashbookService.getCurrentBalance(orgId, w.id),
        supabase.from('cashbook_entries').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('account_type', w.id),
        supabase.from('cashbook_entries').select('date').eq('organization_id', orgId).eq('account_type', w.id).order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('bank_statement_lines').select('id', { count: 'exact', head: true }).eq('external_wallet_id', w.id),
        supabase.from('bank_statement_lines').select('line_date, balance').eq('external_wallet_id', w.id).not('balance', 'is', null)
            .order('line_date', { ascending: false }).order('seq', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const latestBalance = lastLine.data?.balance != null ? Number(lastLine.data.balance) : null;
    return {
        id: w.id,
        name: w.name,
        provider_type: w.provider_type,
        provider_name: w.provider_name ?? null,
        currency: CURRENCY,
        ledger_balance: round2(balance),
        ledger_entries: entries.count ?? 0,
        last_entry_date: lastEntry.data?.date ?? null,
        statement: {
            lines: lines.count ?? 0,
            latest_date: lastLine.data?.line_date ?? null,
            latest_balance: latestBalance,
            difference: latestBalance != null ? round2(latestBalance - balance) : null,
        },
    };
};

/** The organisation's external accounts (banks, mobile money, custom), optionally just one of them. */
export const loadExternalWallets = async (orgId: string, onlyId?: string): Promise<ExternalWalletSummary[]> => {
    let query = supabase
        .from('external_wallets')
        .select('id, name, provider_type, provider_name, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });
    if (onlyId) query = query.eq('id', onlyId);
    const { data, error } = await query;
    if (error) throw error;
    return Promise.all((data ?? []).map(w => summarise(orgId, w)));
};
