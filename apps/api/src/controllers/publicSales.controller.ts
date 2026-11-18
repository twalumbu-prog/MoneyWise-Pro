/**
 * Public API v1 — sales already paid for outside MoneyWise (cash, mobile money, bank), e.g. Kaizen OS posting
 * receipts after Finance approves a day. Books through services/manualSale.service.ts, the same code as the staff
 * New Sale → Manual screen.
 *
 * Idempotent on the caller's `external_reference` (per organization): an api_sales row is claimed before anything is
 * booked, and its unique (organization_id, external_reference) constraint means only one request can ever book a
 * given reference. Repeats answer 200 with the existing sale and "created": false.
 */
import { supabase } from '../lib/supabase';
import { recordManualSale, ManualSaleError } from '../services/manualSale.service';
import { METHOD_LABELS, parseSaleBody, resolveIncomeAccount, toCartItems, IncomeAccount } from '../services/publicSaleInput';
import { fail } from './publicApiShared';

const SALE_COLUMNS = 'id, organization_id, external_reference, status, sale_date, amount, account_type, receipt_number, entry_ids, created_at';
// A PENDING claim older than this belongs to a request that died mid-way (the API's own time limit is far shorter).
const STALE_CLAIM_MS = 2 * 60_000;
// Upper bound on income groups per sale (= items per sale), for finding a sale's `::gN` entries.
const MAX_GROUPS = 100;

const shapeSale = (row: any) => ({
    id: row.id,
    receipt_number: row.receipt_number ?? null,
    external_reference: row.external_reference,
    amount: Number(row.amount),
    date: row.sale_date,
    account_type: row.account_type,
    entry_ids: row.entry_ids ?? [],
});

/** Where the request came from, for api_sales.api_key_id / oauth_grant_id (req.user.id is `api-key:<id>` or `oauth:<grant>`). */
const callerColumns = (userId: string) => ({
    api_key_id: userId.startsWith('api-key:') ? userId.slice('api-key:'.length) : null,
    oauth_grant_id: userId.startsWith('oauth:') ? userId.slice('oauth:'.length) : null,
});

const groupRef = (ref: string, n: number) => (n === 1 ? ref : `${ref}::g${n}`);

/**
 * The cashbook INFLOWs a sale booked under `ref` (primary + `::g2`, `::g3`, …), primary first. Groups are numbered
 * contiguously, so look them up a page at a time and stop at the first page that isn't full.
 */
const loadSaleEntries = async (orgId: string, ref: string) => {
    const PAGE = 20;
    const rows: any[] = [];
    for (let from = 1; from <= MAX_GROUPS; from += PAGE) {
        const refs = Array.from({ length: PAGE }, (_, i) => groupRef(ref, from + i));
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('id, external_reference, reference_number, debit, date, account_type')
            .eq('organization_id', orgId)
            .eq('entry_type', 'INFLOW')
            .in('external_reference', refs);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < PAGE) break;
    }
    const groupNo = (r: any) => (r.external_reference === ref ? 1 : Number(String(r.external_reference).split('::g').pop()));
    return rows.sort((a, b) => groupNo(a) - groupNo(b));
};

/**
 * A claim left PENDING by a request that died: if its entries were booked, finish the claim from them (the sale
 * exists); otherwise hand the claim to this request. Returns the completed row, 'retry' (we own the claim now), or
 * null (someone else got there first — re-read).
 */
const recoverStaleClaim = async (claim: any): Promise<any | 'retry' | null> => {
    const entries = await loadSaleEntries(claim.organization_id, claim.external_reference);
    if (entries.length > 0) {
        const primary = entries[0];
        const { data } = await supabase
            .from('api_sales')
            .update({
                status: 'COMPLETED',
                receipt_number: primary.reference_number ?? null,
                entry_ids: entries.map(e => e.id),
                amount: Math.round(entries.reduce((s, e) => s + Number(e.debit ?? 0), 0) * 100) / 100,
                sale_date: primary.date,
                account_type: primary.account_type,
                completed_at: new Date().toISOString(),
            })
            .eq('id', claim.id)
            .eq('status', 'PENDING')
            .select(SALE_COLUMNS)
            .maybeSingle();
        console.warn(`[PublicAPI] Recovered stale sale claim ${claim.id} (${claim.external_reference}) from ${entries.length} booked entries`);
        return data ?? null;
    }
    // Nothing was booked: take the claim over (optimistically, so only one retry wins).
    const { data } = await supabase
        .from('api_sales')
        .update({ created_at: new Date().toISOString() })
        .eq('id', claim.id)
        .eq('status', 'PENDING')
        .eq('created_at', claim.created_at)
        .select('id')
        .maybeSingle();
    return data ? 'retry' : null;
};

/** Answers a request whose reference is already claimed. Returns true when a response was sent. */
const answerExisting = async (res: any, claim: any): Promise<boolean | 'retry'> => {
    if (claim.status === 'COMPLETED') {
        res.status(200).json({ data: shapeSale(claim), created: false });
        return true;
    }
    if (claim.status === 'FAILED') {
        fail(res, 500, 'A previous attempt to record this sale failed part-way and needs review in MoneyWise; it was not recorded again');
        return true;
    }
    if (Date.now() - Date.parse(claim.created_at) > STALE_CLAIM_MS) {
        const recovered = await recoverStaleClaim(claim);
        if (recovered === 'retry') return 'retry';
        if (recovered) {
            res.status(200).json({ data: shapeSale(recovered), created: false });
            return true;
        }
    }
    res.set('Retry-After', '5');
    fail(res, 503, 'This sale is still being recorded by another request; retry shortly');
    return true;
};

/** POST /v1/sales — see docs/api.md. */
export const createSale = async (req: any, res: any) => {
    const orgId = req.user.organization_id;
    const parsed = parseSaleBody(req.body);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    const sale = parsed.sale;

    try {
        // Repeat of a sale we already know about: answer before validating references (they may have changed since).
        const { data: existing, error: existingErr } = await supabase
            .from('api_sales').select(SALE_COLUMNS).eq('organization_id', orgId).eq('external_reference', sale.external_reference).maybeSingle();
        if (existingErr) return fail(res, 500, 'Failed to record sale', existingErr);
        let ownsClaim = false;
        if (existing) {
            const answered = await answerExisting(res, existing);
            if (answered !== 'retry') return;
            ownsClaim = true;
        }
        // Validation failures after taking over a dead request's claim must release it again.
        const reject = async (status: number, message: string, err?: { message?: string }) => {
            if (ownsClaim) await supabase.from('api_sales').delete().eq('id', existing!.id).eq('status', 'PENDING');
            return fail(res, status, message, err);
        };

        // Catalogue products must be this organization's.
        const productIds = [...new Set(sale.items.flatMap(i => (i.kind === 'product' ? [i.product_id] : [])))];
        if (productIds.length) {
            const { data: prods, error } = await supabase.from('products').select('id').eq('organization_id', orgId).in('id', productIds);
            if (error) return reject(500, 'Failed to record sale', error);
            const found = new Set((prods ?? []).map((p: any) => p.id));
            const missing = productIds.filter(id => !found.has(id));
            if (missing.length) return reject(400, `Product not found in your organization: ${missing.join(', ')}`);
        }

        // Free-text items post to an income account given by id / code / name, else the org's accommodation income.
        const customs = sale.items.filter(i => i.kind === 'custom');
        const incomeIds = new Map<object, string>();
        if (customs.length) {
            const { data: accts, error } = await supabase.from('accounts').select('id, code, name, is_active').eq('organization_id', orgId).eq('type', 'INCOME');
            if (error) return reject(500, 'Failed to record sale', error);
            for (const item of customs) {
                const acct = resolveIncomeAccount((accts ?? []) as IncomeAccount[], item.income_account);
                if (!acct) {
                    return reject(400, item.income_account
                        ? `Income account "${item.income_account}" was not found, and your organization has no income account named like "Accommodation" to fall back to`
                        : 'Give an `income_account` for items without a product_id (your organization has no income account named like "Accommodation" to fall back to)');
                }
                incomeIds.set(item, acct.id);
            }
        }

        // cashbook_entries.external_reference is unique for INFLOWs across ALL organizations; a reference already
        // used there (by another org or another kind of transaction) can't be booked.
        if (!ownsClaim) {
            const { data: taken, error } = await supabase
                .from('cashbook_entries').select('id').eq('entry_type', 'INFLOW').eq('external_reference', sale.external_reference).limit(1);
            if (error) return reject(500, 'Failed to record sale', error);
            if (taken && taken.length) return reject(400, '`external_reference` is already used by another MoneyWise transaction; use a different reference');
        }

        // Claim the reference. Losing the race means another request has (or is booking) this sale.
        let claimId = ownsClaim ? existing!.id as string : '';
        if (!ownsClaim) {
            const { data: claim, error: claimErr } = await supabase
                .from('api_sales')
                .insert({ organization_id: orgId, external_reference: sale.external_reference, status: 'PENDING', ...callerColumns(String(req.user.id)) })
                .select('id')
                .single();
            if (claimErr) {
                if (claimErr.code === '23505') {
                    const { data: winner } = await supabase.from('api_sales').select(SALE_COLUMNS).eq('organization_id', orgId).eq('external_reference', sale.external_reference).maybeSingle();
                    if (winner) {
                        const answered = await answerExisting(res, winner);
                        if (answered !== 'retry') return;
                        claimId = winner.id; // took over a dead request's empty claim
                    }
                }
                if (!claimId) return fail(res, 500, 'Failed to record sale', claimErr);
            } else {
                claimId = claim.id;
            }
        }

        let result;
        try {
            result = await recordManualSale({
                organizationId: orgId,
                userId: null, // cashbook_entries.created_by is a users.id; the API key / OAuth client is on api_sales
                items: toCartItems(sale.items, item => incomeIds.get(item)!),
                amount: sale.amount,
                paymentDate: sale.date,
                accountType: sale.account_type,
                methodLabel: METHOD_LABELS[sale.account_type],
                customerName: sale.customer_name,
                customerPhone: sale.customer_phone,
                reference: sale.external_reference,
            });
        } catch (err: any) {
            // Nothing booked → release the claim so the caller can fix and retry. Booked part-way → keep it, flagged.
            const booked = await loadSaleEntries(orgId, sale.external_reference).catch(() => [{}] as any[]);
            if (booked.length === 0) {
                await supabase.from('api_sales').delete().eq('id', claimId);
            } else {
                await supabase.from('api_sales').update({ status: 'FAILED', error: String(err?.message ?? err).slice(0, 500), entry_ids: booked.map((e: any) => e.id).filter(Boolean) }).eq('id', claimId);
            }
            if (err instanceof ManualSaleError) return fail(res, err.httpStatus, err.message);
            return fail(res, 500, 'Failed to record sale', err);
        }

        const row = {
            id: claimId,
            external_reference: sale.external_reference,
            receipt_number: result.referenceNumber,
            amount: result.amount,
            sale_date: result.date,
            account_type: result.accountType,
            entry_ids: result.entryIds,
        };
        const { error: doneErr } = await supabase
            .from('api_sales')
            .update({ status: 'COMPLETED', receipt_number: row.receipt_number, amount: row.amount, sale_date: row.sale_date, account_type: row.account_type, entry_ids: row.entry_ids, completed_at: new Date().toISOString() })
            .eq('id', claimId);
        // The sale is booked either way; a stale PENDING claim is completed from its entries on the next repeat.
        if (doneErr) console.error('[PublicAPI] Failed to complete sale claim', claimId, doneErr.message);

        res.status(201).json({ data: shapeSale(row), created: true });
    } catch (err: any) {
        fail(res, 500, 'Failed to record sale', err);
    }
};

/** GET /v1/sales?external_reference=… — a sale recorded through POST /v1/sales. */
export const getSaleByExternalReference = async (req: any, res: any) => {
    const ref = typeof req.query.external_reference === 'string' ? req.query.external_reference.trim() : '';
    if (!ref || ref.length > 120) return fail(res, 400, '`external_reference` (1–120 characters) is required');
    const { data, error } = await supabase
        .from('api_sales')
        .select(SALE_COLUMNS)
        .eq('organization_id', req.user.organization_id)
        .eq('external_reference', ref)
        .eq('status', 'COMPLETED')
        .maybeSingle();
    if (error) return fail(res, 500, 'Failed to fetch sale', error);
    if (!data) return fail(res, 404, 'Sale not found');
    res.json({ data: shapeSale(data) });
};
