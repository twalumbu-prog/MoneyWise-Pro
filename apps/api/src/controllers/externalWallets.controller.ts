/**
 * External accounts (banks, mobile money) and the bank statements imported for them.
 *
 *   GET    /v1/external-wallets                              list, with ledger balance and statement summary
 *   GET    /v1/external-wallets/:id                          one account
 *   GET    /v1/external-wallets/:id/statement-lines          the imported statement, line by line
 *   POST   /v1/external-wallets/:id/statement-lines          import statement lines (idempotent)
 *   DELETE /v1/external-wallets/:id/statement-imports/:batchId   undo one import
 *
 * Statement lines are evidence to reconcile against, kept apart from the accounting ledger.
 */
import { createHash, randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { CURRENCY, DATE_RE, UUID_RE, clampLimit, fail, loadExternalWallets } from './publicApiShared';

const MAX_LINES_PER_IMPORT = 500;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const money = (v: unknown): number | null => {
    if (v === undefined || v === null || v === '') return 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const ownedWallet = async (orgId: string, id: string) => {
    if (!UUID_RE.test(id)) return { error: 'Invalid external wallet id', status: 400 as const };
    const { data, error } = await supabase.from('external_wallets').select('id, name').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (error) return { error: 'Failed to load external wallet', status: 500 as const, cause: error };
    if (!data) return { error: 'External wallet not found', status: 404 as const };
    return { wallet: data };
};

export const listExternalWallets = async (req: any, res: any) => {
    try {
        const data = await loadExternalWallets(req.user.organization_id);
        res.json({ data, count: data.length });
    } catch (err: any) {
        fail(res, 500, 'Failed to fetch external wallets', err);
    }
};

export const getExternalWallet = async (req: any, res: any) => {
    const found = await ownedWallet(req.user.organization_id, req.params.id);
    if (!found.wallet) return fail(res, found.status, found.error, (found as any).cause);
    try {
        const [one] = await loadExternalWallets(req.user.organization_id, found.wallet.id);
        res.json(one);
    } catch (err: any) {
        fail(res, 500, 'Failed to fetch external wallet', err);
    }
};

// ── Statement lines ──────────────────────────────────────────────────────────

const encodeCursor = (r: { line_date: string; seq: number | string }) => Buffer.from(`${r.line_date}|${r.seq}`).toString('base64url');
const decodeCursor = (c: string) => {
    const [date, seq] = Buffer.from(c, 'base64url').toString().split('|');
    return date && DATE_RE.test(date) && /^\d+$/.test(seq ?? '') ? { date, seq } : null;
};

export const getStatementLines = async (req: any, res: any) => {
    const found = await ownedWallet(req.user.organization_id, req.params.id);
    if (!found.wallet) return fail(res, found.status, found.error, (found as any).cause);

    const { start_date, end_date, cursor } = req.query as Record<string, string>;
    const limit = clampLimit(req.query.limit);
    if (start_date && !DATE_RE.test(start_date)) return fail(res, 400, '`start_date` must be YYYY-MM-DD');
    if (end_date && !DATE_RE.test(end_date)) return fail(res, 400, '`end_date` must be YYYY-MM-DD');

    let query = supabase
        .from('bank_statement_lines')
        .select('id, seq, line_date, description, reference, money_in, money_out, balance, import_batch_id, created_at')
        .eq('external_wallet_id', found.wallet.id)
        .order('line_date', { ascending: false })
        .order('seq', { ascending: false })
        .limit(limit + 1);
    if (start_date) query = query.gte('line_date', start_date);
    if (end_date) query = query.lte('line_date', end_date);
    if (cursor) {
        const c = decodeCursor(cursor);
        if (!c) return fail(res, 400, 'Invalid `cursor`');
        query = query.or(`line_date.lt.${c.date},and(line_date.eq.${c.date},seq.lt.${c.seq})`);
    }

    const { data, error } = await query;
    if (error) return fail(res, 500, 'Failed to fetch statement lines', error);

    const rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    res.json({
        data: page.map(r => ({
            id: r.id,
            date: r.line_date,
            description: r.description,
            reference: r.reference,
            money_in: Number(r.money_in),
            money_out: Number(r.money_out),
            balance: r.balance != null ? Number(r.balance) : null,
            currency: CURRENCY,
            import_batch_id: r.import_batch_id,
            imported_at: r.created_at,
        })),
        count: page.length,
        next_cursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    });
};

export const importStatementLines = async (req: any, res: any) => {
    const found = await ownedWallet(req.user.organization_id, req.params.id);
    if (!found.wallet) return fail(res, found.status, found.error, (found as any).cause);

    const lines = req.body?.lines;
    if (!Array.isArray(lines) || lines.length === 0) return fail(res, 400, '`lines` must be a non-empty array');
    if (lines.length > MAX_LINES_PER_IMPORT) return fail(res, 400, `Send at most ${MAX_LINES_PER_IMPORT} lines per request; split larger statements into several requests`);

    const batchId = randomUUID();
    const seen = new Map<string, number>();
    const rows: any[] = [];

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i] ?? {};
        const where = `lines[${i}]`;
        if (typeof l.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(l.date) || Number.isNaN(Date.parse(l.date))) return fail(res, 400, `${where}.date must be YYYY-MM-DD`);
        const description = l.description === undefined || l.description === null ? '' : String(l.description).trim();
        if (description.length > 300) return fail(res, 400, `${where}.description is longer than 300 characters`);
        const reference = l.reference === undefined || l.reference === null || l.reference === '' ? null : String(l.reference).trim();
        if (reference && reference.length > 100) return fail(res, 400, `${where}.reference is longer than 100 characters`);
        const moneyIn = money(l.money_in), moneyOut = money(l.money_out);
        if (moneyIn === null || moneyOut === null || moneyIn < 0 || moneyOut < 0) return fail(res, 400, `${where}.money_in and money_out must be non-negative numbers`);
        if (moneyIn === 0 && moneyOut === 0) return fail(res, 400, `${where} has neither money_in nor money_out`);
        if (moneyIn > 0 && moneyOut > 0) return fail(res, 400, `${where} has both money_in and money_out; send one line per movement`);
        const balance = l.balance === undefined || l.balance === null || l.balance === '' ? null : money(l.balance);
        if (l.balance !== undefined && l.balance !== null && l.balance !== '' && balance === null) return fail(res, 400, `${where}.balance must be a number`);

        // Re-sending the same statement must be a no-op, yet two genuinely identical lines on one day
        // are legitimate, so identical lines are told apart by their order within the request. A caller
        // can pin identity explicitly with `external_id` instead.
        let hash: string;
        if (l.external_id !== undefined && l.external_id !== null && String(l.external_id).trim()) {
            hash = sha256(`${found.wallet.id}|ext|${String(l.external_id).trim()}`);
        } else {
            const base = [found.wallet.id, l.date, description, moneyIn, moneyOut, balance ?? '', reference ?? ''].join('|');
            const n = (seen.get(base) ?? 0) + 1;
            seen.set(base, n);
            hash = sha256(`${base}|${n}`);
        }
        rows.push({
            organization_id: req.user.organization_id,
            external_wallet_id: found.wallet.id,
            line_date: l.date,
            description,
            reference,
            money_in: moneyIn,
            money_out: moneyOut,
            balance,
            line_hash: hash,
            import_batch_id: batchId,
        });
    }

    const { data, error } = await supabase
        .from('bank_statement_lines')
        .upsert(rows, { onConflict: 'external_wallet_id,line_hash', ignoreDuplicates: true })
        .select('id');
    if (error) return fail(res, 500, 'Failed to import statement lines', error);

    const imported = (data ?? []).length;
    res.status(imported > 0 ? 201 : 200).json({
        import_batch_id: batchId,
        received: rows.length,
        imported,
        duplicates_skipped: rows.length - imported,
    });
};

export const deleteStatementImport = async (req: any, res: any) => {
    const found = await ownedWallet(req.user.organization_id, req.params.id);
    if (!found.wallet) return fail(res, found.status, found.error, (found as any).cause);
    if (!UUID_RE.test(req.params.batchId)) return fail(res, 400, 'Invalid import batch id');

    const { data, error } = await supabase
        .from('bank_statement_lines')
        .delete()
        .eq('external_wallet_id', found.wallet.id)
        .eq('import_batch_id', req.params.batchId)
        .select('id');
    if (error) return fail(res, 500, 'Failed to delete import', error);
    if ((data ?? []).length === 0) return fail(res, 404, 'No lines found for that import batch');
    res.json({ deleted: (data ?? []).length });
};
