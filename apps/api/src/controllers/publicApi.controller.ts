/**
 * Public API v1 controllers.
 * Each handler is intentionally thin: resolve the org from req.user, query a
 * narrow column set, and return a stable JSON shape. List endpoints all return
 * { data, count } (transactions add next_cursor). Internal error text is
 * logged, never returned.
 */
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { getFrontendUrl } from '../utils/frontendUrl';

const CURRENCY = 'ZMW';
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clampLimit = (raw: unknown, def = 50, max = 200) => {
    const n = parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
};

const fail = (res: any, status: number, message: string, err?: { message?: string }) => {
    if (err) console.error(`[PublicAPI] ${message}:`, err.message);
    return res.status(status).json({ error: message });
};

// ── Organisation ─────────────────────────────────────────────────────────────

export const getOrganization = async (req: any, res: any) => {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, email, phone, website, created_at')
        .eq('id', req.user.organization_id)
        .maybeSingle();

    if (error) return fail(res, 500, 'Failed to fetch organization', error);
    if (!data) return fail(res, 404, 'Organization not found');

    res.json({ ...data, currency: CURRENCY });
};

// ── Wallets ───────────────────────────────────────────────────────────────────

const loadWalletsWithBalances = async (orgId: string) => {
    const { data: wallets, error } = await supabase
        .from('organization_wallets')
        .select('id, name, is_main, created_at')
        .eq('organization_id', orgId)
        .order('is_main', { ascending: false })
        .order('created_at', { ascending: true });

    if (error) throw error;

    // Balance = latest settled ledger row per wallet (same rule the app uses).
    return Promise.all(
        (wallets ?? []).map(async w => ({
            id: w.id,
            name: w.name,
            is_main: w.is_main,
            balance: await cashbookService.getCurrentBalance(orgId, 'MONEYWISE_WALLET', w.id),
            currency: CURRENCY,
            created_at: w.created_at,
        }))
    );
};

export const getWallets = async (req: any, res: any) => {
    try {
        const data = await loadWalletsWithBalances(req.user.organization_id);
        res.json({ data, count: data.length });
    } catch (err: any) {
        fail(res, 500, 'Failed to fetch wallets', err);
    }
};

export const getBalanceSummary = async (req: any, res: any) => {
    try {
        const wallets = await loadWalletsWithBalances(req.user.organization_id);
        const total = wallets.reduce((sum, w) => sum + w.balance, 0);
        res.json({
            total_balance: Math.round(total * 100) / 100,
            currency: CURRENCY,
            wallets: wallets.map(w => ({ id: w.id, name: w.name, balance: w.balance })),
        });
    } catch (err: any) {
        fail(res, 500, 'Failed to fetch balance', err);
    }
};

// ── Transactions (cashbook entries) ──────────────────────────────────────────

const encodeCursor = (row: { date: string; created_at: string; id: string }) =>
    Buffer.from(`${row.date}|${row.created_at}|${row.id}`).toString('base64url');

const decodeCursor = (cursor: string) => {
    const [date, created_at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    if (!date || !created_at || !id || !DATE_RE.test(date) || !UUID_RE.test(id)) return null;
    if (Number.isNaN(Date.parse(created_at))) return null;
    return { date, created_at, id };
};

export const getTransactions = async (req: any, res: any) => {
    const orgId = req.user.organization_id;
    const { start_date, end_date, type, wallet_id, account_id, status, cursor } = req.query as Record<string, string>;
    const accountType = (req.query.ledger as string) || 'MONEYWISE_WALLET';
    const limit = clampLimit(req.query.limit);

    if (start_date && !DATE_RE.test(start_date)) return fail(res, 400, '`start_date` must be YYYY-MM-DD');
    if (end_date && !DATE_RE.test(end_date)) return fail(res, 400, '`end_date` must be YYYY-MM-DD');
    if (wallet_id && !UUID_RE.test(wallet_id)) return fail(res, 400, '`wallet_id` must be a UUID');
    if (account_id && !UUID_RE.test(account_id)) return fail(res, 400, '`account_id` must be a UUID');

    let query = supabase
        .from('cashbook_entries')
        .select('id, date, created_at, description, debit, credit, balance_after, entry_type, status, account_type, wallet_id, reference_number, external_reference, accounts!account_id(id, code, name)')
        .eq('organization_id', orgId)
        .eq('account_type', accountType)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);

    if (start_date) query = query.gte('date', start_date);
    if (end_date) query = query.lte('date', end_date);
    if (type) query = query.eq('entry_type', type);
    if (status) query = query.eq('status', status.toUpperCase());
    if (wallet_id) query = query.eq('wallet_id', wallet_id);
    if (account_id) query = query.eq('account_id', account_id);

    if (cursor) {
        const c = decodeCursor(cursor);
        if (!c) return fail(res, 400, 'Invalid `cursor`');
        query = query.or(
            `date.lt.${c.date},and(date.eq.${c.date},created_at.lt.${c.created_at}),and(date.eq.${c.date},created_at.eq.${c.created_at},id.lt.${c.id})`
        );
    }

    const { data, error } = await query;
    if (error) return fail(res, 500, 'Failed to fetch transactions', error);

    const rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const shaped = page.map(e => ({
        id: e.id,
        date: e.date,
        description: (e.description as string | null)?.split(' | Ref:')[0] ?? null,
        debit: Number(e.debit ?? 0),
        credit: Number(e.credit ?? 0),
        balance_after: Number(e.balance_after ?? 0),
        type: e.entry_type,
        status: e.status,
        ledger: e.account_type,
        account: e.accounts ? { id: e.accounts.id, code: e.accounts.code, name: e.accounts.name } : null,
        wallet_id: e.wallet_id ?? null,
        reference: e.reference_number ?? e.external_reference ?? null,
        created_at: e.created_at,
    }));

    res.json({
        data: shaped,
        count: shaped.length,
        next_cursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    });
};

// ── Accounts (Chart of Accounts) ─────────────────────────────────────────────

export const getAccounts = async (req: any, res: any) => {
    const { type } = req.query as Record<string, string>;

    let query = supabase
        .from('accounts')
        .select('id, code, name, type, is_active, created_at')
        .eq('organization_id', req.user.organization_id)
        .order('code', { ascending: true });

    if (type) query = query.eq('type', type.toUpperCase());

    const { data, error } = await query;
    if (error) return fail(res, 500, 'Failed to fetch accounts', error);

    res.json({ data: data ?? [], count: (data ?? []).length });
};

// ── Requisitions ──────────────────────────────────────────────────────────────

export const getRequisitions = async (req: any, res: any) => {
    const { status, start_date, end_date } = req.query as Record<string, string>;
    const limit = clampLimit(req.query.limit);

    if (start_date && !DATE_RE.test(start_date)) return fail(res, 400, '`start_date` must be YYYY-MM-DD');
    if (end_date && !DATE_RE.test(end_date)) return fail(res, 400, '`end_date` must be YYYY-MM-DD');

    let query = supabase
        .from('requisitions')
        .select('id, reference_number, description, type, status, actual_total, estimated_total, department, created_at, updated_at')
        .eq('organization_id', req.user.organization_id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) query = query.eq('status', status.toUpperCase());
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    const { data, error } = await query;
    if (error) return fail(res, 500, 'Failed to fetch requisitions', error);

    res.json({ data: data ?? [], count: (data ?? []).length });
};

export const getRequisitionById = async (req: any, res: any) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return fail(res, 400, 'Invalid requisition id');

    const { data, error } = await supabase
        .from('requisitions')
        .select('id, reference_number, description, type, status, actual_total, estimated_total, department, payment_method, created_at, updated_at, line_items(id, description, quantity, unit_price, estimated_amount, actual_amount)')
        .eq('id', id)
        .eq('organization_id', req.user.organization_id)
        .maybeSingle();

    if (error) return fail(res, 500, 'Failed to fetch requisition', error);
    if (!data) return fail(res, 404, 'Requisition not found');

    res.json(data);
};

// ── Products ──────────────────────────────────────────────────────────────────

export const getProducts = async (req: any, res: any) => {
    const { type } = req.query as Record<string, string>;
    const limit = clampLimit(req.query.limit);

    let query = supabase
        .from('products')
        .select('id, name, description, price, product_type, category, image_url, is_active, created_at')
        .eq('organization_id', req.user.organization_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (type) query = query.eq('product_type', type.toUpperCase());

    const { data, error } = await query;
    if (error) return fail(res, 500, 'Failed to fetch products', error);

    const shaped = (data ?? []).map(({ product_type, ...p }) => ({ ...p, type: product_type, currency: CURRENCY }));
    res.json({ data: shaped, count: shaped.length });
};

// ── Payment Links ─────────────────────────────────────────────────────────────

const LINK_COLUMNS = 'id, token, product_id, customer_name, customer_phone, customer_email, amount, status, reference, created_at, paid_at';

const shapeLink = (l: any, baseUrl: string) => ({
    ...l,
    amount: Number(l.amount),
    currency: CURRENCY,
    url: `${baseUrl}/pl/${l.token}`,
});

export const getPaymentLinks = async (req: any, res: any) => {
    const { status, product_id } = req.query as Record<string, string>;
    const limit = clampLimit(req.query.limit);

    if (product_id && !UUID_RE.test(product_id)) return fail(res, 400, '`product_id` must be a UUID');
    if (status && !['ACTIVE', 'PAID', 'CANCELLED'].includes(status.toUpperCase())) {
        return fail(res, 400, '`status` must be one of ACTIVE, PAID, CANCELLED');
    }

    let query = supabase
        .from('payment_links')
        .select(LINK_COLUMNS)
        .eq('organization_id', req.user.organization_id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) query = query.eq('status', status.toUpperCase());
    if (product_id) query = query.eq('product_id', product_id);

    const { data, error } = await query;
    if (error) return fail(res, 500, 'Failed to fetch payment links', error);

    const base = getFrontendUrl();
    const shaped = (data ?? []).map(l => shapeLink(l, base));
    res.json({ data: shaped, count: shaped.length });
};

export const createPaymentLink = async (req: any, res: any) => {
    const orgId = req.user.organization_id;
    const { product_id, customer_name, customer_phone, customer_email, amount } = req.body ?? {};

    if (!product_id || !UUID_RE.test(String(product_id))) return fail(res, 400, '`product_id` (UUID) is required');
    if (typeof customer_name !== 'string' || !customer_name.trim()) return fail(res, 400, '`customer_name` is required');
    if (typeof customer_phone !== 'string' || !customer_phone.trim()) return fail(res, 400, '`customer_phone` is required');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return fail(res, 400, '`amount` must be a positive number');
    }
    if (customer_email !== undefined && (typeof customer_email !== 'string' || !/^\S+@\S+\.\S+$/.test(customer_email))) {
        return fail(res, 400, '`customer_email` must be a valid email address');
    }

    const { data: product, error: productError } = await supabase
        .from('products')
        .select('organization_id, wallet_id, is_active')
        .eq('id', product_id)
        .maybeSingle();

    if (productError) return fail(res, 500, 'Failed to create payment link', productError);
    if (!product || product.organization_id !== orgId) return fail(res, 404, 'Product not found');
    if (!product.is_active) return fail(res, 400, 'Product is not active');

    // Same routing as the app: product's mapped wallet, else the org's main wallet.
    let walletId: string | null = product.wallet_id || null;
    if (!walletId) {
        const { data: mainWallet } = await supabase
            .from('organization_wallets')
            .select('id')
            .eq('organization_id', orgId)
            .eq('is_main', true)
            .maybeSingle();
        walletId = mainWallet?.id ?? null;
    }

    const token = randomBytes(24).toString('base64url');

    const { data, error } = await supabase
        .from('payment_links')
        .insert({
            organization_id: orgId,
            product_id,
            token,
            customer_name: customer_name.trim(),
            customer_phone: customer_phone.trim(),
            customer_email: customer_email?.trim() ?? null,
            amount,
            wallet_id: walletId,
            status: 'ACTIVE',
            created_by: null,
        })
        .select(LINK_COLUMNS)
        .single();

    if (error) return fail(res, 500, 'Failed to create payment link', error);

    res.status(201).json(shapeLink(data, getFrontendUrl()));
};
