/**
 * Everyday inventory for any business that tracks stock (a salon's colours of extensions, a shop's sizes), without needing suppliers or bills:
 *  - useStock: take stock out because it was used up ("3 packs of maroon"), by option, with a note and an optional appointment;
 *  - restock: put stock in with the quantity and what it cost, so spending can be seen;
 *  - lowStock: everything that is running low or out, by option;
 *  - spending: what was spent on stock, by month and by item, from the purchase history (bills and restocks alike);
 *  - alertIfLow: tells the owner when an item runs low or out (called wherever stock goes down).
 * Every change is a row in stock_movements. The accounting entries are posted only for businesses that have accounting (Enterprise); the
 * rest keep the stock history without a ledger they can't see.
 */
import { supabase } from '../lib/supabase';
import { getEntitlements } from './entitlements.service';
import { alertIfLow } from './stockAlerts.service';
import { PurchasingError, applyStock, stockOf, variantsOf, ensureAccount, inventoryAcct, adjustmentAcct, lossFields, postJournal, text, r2, today } from './purchasing.service';

const COLS = 'id, name, track_stock, stock_quantity, low_stock_threshold, variants, cost_price';

async function loadProduct(orgId: string, productId: unknown) {
    const { data: p } = await supabase.from('products').select(COLS).eq('organization_id', orgId).eq('id', String(productId ?? '')).maybeSingle();
    if (!p) throw new PurchasingError('Product not found.', 404);
    if (!p.track_stock) throw new PurchasingError('Turn on stock tracking for this product first.');
    return p;
}
/** With options (colours, sizes) the option must be named; without, there is just the one count. */
function chosenVariant(p: any, variantId: unknown): string | null {
    const vs = variantsOf(p);
    if (!vs.length) return null;
    const id = String(variantId ?? '');
    if (!vs.some((v) => v.id === id)) throw new PurchasingError('Choose which option (colour or size) this is for.');
    return id;
}
const wholeQty = (v: unknown) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n <= 0) throw new PurchasingError('Enter how many, as a whole number above zero.');
    if (n > 1_000_000) throw new PurchasingError('That quantity is too large.');
    return n;
};

async function hasAccounting(orgId: string): Promise<boolean> {
    try { return (await getEntitlements(orgId)).isEnterprise; } catch { return false; }
}

export async function useStock(orgId: string, userId: string, body: any) {
    const p = await loadProduct(orgId, body?.productId);
    const variantId = chosenVariant(p, body?.variantId);
    const qty = wholeQty(body?.quantity);
    const before = stockOf(p, variantId);
    if (before < qty) throw new PurchasingError(`Only ${before} in stock, so ${qty} can’t be used.`);
    const cost = Number(p.cost_price) || 0;
    const appointmentId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body?.appointmentId ?? '')) ? String(body.appointmentId) : null;

    await applyStock(p, variantId, -qty);
    const after = before - qty;
    const { data: mv, error } = await supabase.from('stock_movements').insert({
        organization_id: orgId, product_id: p.id, variant_id: variantId, quantity_change: -qty, unit_cost: cost || null, reason: 'USED',
        ref_type: appointmentId ? 'APPOINTMENT' : null, ref_id: appointmentId, note: text(body?.note, 300), balance_after: after, created_by: userId,
    }).select('*').single();
    if (error || !mv) { await applyStock(p, variantId, qty); throw new PurchasingError(error?.message ?? 'Could not record the use of stock.', 500); }

    const value = r2(qty * cost);
    if (value > 0 && (await hasAccounting(orgId))) {
        try {
            const inv = await inventoryAcct(orgId);
            const used = await ensureAccount(orgId, 'SUPPLIES-USED', 'Supplies used', 'EXPENSE', 'Expense');
            await postJournal(orgId, userId, today(), `Stock used: ${p.name}`, `USE-${mv.id.slice(0, 8)}`, 'STOCK_ADJUSTMENT', mv.id, [
                { accountId: used, debit: value, credit: 0 }, { accountId: inv, debit: 0, credit: value },
            ]);
        } catch (e) { console.error('[Stock] use not posted to the ledger:', (e as Error).message); }
    }
    void alertIfLow(orgId, p, variantId, before, after);
    return { ...mv, productName: p.name, variantName: variantId ? variantsOf(p).find((v) => v.id === variantId)?.name ?? null : null, valuePosted: value };
}

export async function restock(orgId: string, userId: string, body: any) {
    const p = await loadProduct(orgId, body?.productId);
    const variantId = chosenVariant(p, body?.variantId);
    const qty = wholeQty(body?.quantity);
    // The cost is optional: adding stock without one leaves the average cost as it was.
    const hasCost = body?.unitCost !== undefined && body?.unitCost !== null && String(body.unitCost).trim() !== '';
    const oldCostNow = Number(p.cost_price) || 0;
    const unitCost = hasCost ? Number(body.unitCost) : oldCostNow;
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new PurchasingError('Enter what each one cost (zero if it was free).');
    if (unitCost > 10_000_000) throw new PurchasingError('That cost is too large.');
    const supplier = text(body?.supplier, 80);
    const note = [supplier ? `From ${supplier}` : null, text(body?.note, 200)].filter(Boolean).join('. ') || null;

    // The average cost moves with the new stock, the same way a purchase bill moves it.
    const total = variantsOf(p).length ? variantsOf(p).reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0) : Math.max(0, Number(p.stock_quantity) || 0);
    const oldCost = Number(p.cost_price) || 0;
    const avg = r2(total > 0 && oldCost > 0 ? (total * oldCost + qty * unitCost) / (total + qty) : unitCost);
    await applyStock(p, variantId, qty);
    await supabase.from('products').update({ cost_price: avg }).eq('id', p.id);
    const row = {
        organization_id: orgId, product_id: p.id, variant_id: variantId, quantity_change: qty, unit_cost: hasCost ? unitCost : null, reason: 'PURCHASE', ref_type: 'RESTOCK', note,
        balance_after: stockOf(p, variantId), created_by: userId,
    };
    // The supplier is also kept on its own (supplier_name); a database that doesn't have that column yet still saves the purchase without it.
    let ins = await supabase.from('stock_movements').insert({ ...row, supplier_name: supplier }).select('*').single();
    if (ins.error && /supplier_name/i.test(ins.error.message)) ins = await supabase.from('stock_movements').insert(row).select('*').single();
    const { data: mv, error } = ins;
    if (error || !mv) { await applyStock(p, variantId, -qty); throw new PurchasingError(error?.message ?? 'Could not record the purchase.', 500); }
    return { ...mv, productName: p.name, spent: hasCost ? r2(qty * unitCost) : 0 };
}

/** Every option (or product) that is running low or out, worst first. */
export async function lowStock(orgId: string) {
    const { data, error } = await supabase.from('products').select(COLS).eq('organization_id', orgId).eq('track_stock', true).eq('is_active', true).range(0, 4999);
    if (error) throw new PurchasingError(error.message, 500);
    const rows: { productId: string; name: string; variantId: string | null; variantName: string | null; stock: number; threshold: number; out: boolean }[] = [];
    for (const p of (data ?? []) as any[]) {
        const threshold = Math.max(0, Number(p.low_stock_threshold ?? 5) || 0);
        const vs = variantsOf(p);
        const items = vs.length ? vs.map((v: any) => ({ id: v.id as string, name: v.name as string, stock: Math.max(0, Number(v.stock) || 0) })) : [{ id: null as any, name: null as any, stock: Math.max(0, Number(p.stock_quantity) || 0) }];
        for (const it of items) if (it.stock <= threshold) rows.push({ productId: p.id, name: p.name, variantId: it.id, variantName: it.name, stock: it.stock, threshold, out: it.stock <= 0 });
    }
    rows.sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
    return { rows, out: rows.filter((r) => r.out).length, low: rows.filter((r) => !r.out).length };
}

/** What was spent on stock: every purchase (a bill's lines or a restock) minus any that were cancelled. */
export async function spending(orgId: string, from?: string, to?: string) {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    let q = supabase.from('stock_movements').select('product_id, variant_id, quantity_change, unit_cost, reason, ref_type, note, created_at').eq('organization_id', orgId).in('reason', ['PURCHASE', 'VOID']).order('created_at', { ascending: false }).range(0, 9999);
    if (from && day.test(from)) q = q.gte('created_at', from);
    if (to && day.test(to)) q = q.lt('created_at', to);
    const { data, error } = await q;
    if (error) throw new PurchasingError(error.message, 500);
    // The names come from the products themselves (there is no direct link between the two tables to join on).
    const ids = [...new Set((data ?? []).map((m: any) => m.product_id))];
    const { data: prods } = ids.length ? await supabase.from('products').select('id, name, variants').in('id', ids) : { data: [] as any[] };
    const productById = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));

    const byMonth = new Map<string, { month: string; spent: number; quantity: number }>();
    const byItem = new Map<string, { productId: string; name: string; variantId: string | null; variantName: string | null; quantity: number; spent: number }>();
    const purchases: any[] = [];
    let total = 0;
    for (const m of (data ?? []) as any[]) {
        // A purchase adds stock (positive); a cancelled bill takes it back out (negative), so the sum is net of cancellations.
        const amount = r2(Number(m.quantity_change) * (Number(m.unit_cost) || 0));
        const qty = Number(m.quantity_change) || 0;
        total = r2(total + amount);
        const month = String(m.created_at).slice(0, 7);
        const mo = byMonth.get(month) ?? { month, spent: 0, quantity: 0 };
        mo.spent = r2(mo.spent + amount); mo.quantity += qty; byMonth.set(month, mo);
        const key = `${m.product_id}|${m.variant_id ?? ''}`;
        const prod = productById.get(m.product_id);
        const vName = m.variant_id ? variantsOf(prod).find((v: any) => v.id === m.variant_id)?.name ?? null : null;
        const it = byItem.get(key) ?? { productId: m.product_id, name: prod?.name ?? 'Product', variantId: m.variant_id ?? null, variantName: vName, quantity: 0, spent: 0 };
        it.quantity += qty; it.spent = r2(it.spent + amount); byItem.set(key, it);
        if (m.reason === 'PURCHASE' && purchases.length < 100) purchases.push({ at: m.created_at, name: prod?.name ?? 'Product', variantName: vName, quantity: qty, unitCost: Number(m.unit_cost) || 0, spent: amount, source: m.ref_type === 'PURCHASE_BILL' ? 'Bill' : 'Restock', note: m.note });
    }
    return {
        total,
        byMonth: [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)),
        byItem: [...byItem.values()].sort((a, b) => b.spent - a.spent),
        purchases,
    };
}

/**
 * Stock that was lost, not used: damaged, lost, stolen, expired or miscounted. Takes it out of stock, says why, and records who was in charge of
 * it, so a shop can see where stock goes missing. Valued at the product's cost; posted to the books as an inventory adjustment when the
 * business has accounting and the cost is known.
 */
export async function writeOff(orgId: string, userId: string, body: any) {
    const p = await loadProduct(orgId, body?.productId);
    const variantId = chosenVariant(p, body?.variantId);
    const qty = wholeQty(body?.quantity);
    const before = stockOf(p, variantId);
    if (before < qty) throw new PurchasingError(`Only ${before} in stock, so ${qty} can’t be written off.`);
    const fields = await lossFields(orgId, body);
    if (!fields.loss_kind) fields.loss_kind = 'OTHER';
    const cost = Number(p.cost_price) || 0;

    await applyStock(p, variantId, -qty);
    const after = before - qty;
    const { data: mv, error } = await supabase.from('stock_movements').insert({
        organization_id: orgId, product_id: p.id, variant_id: variantId, quantity_change: -qty, unit_cost: cost || null, reason: 'ADJUSTMENT',
        note: text(body?.note, 300), balance_after: after, created_by: userId, ...fields,
    }).select('*').single();
    if (error || !mv) { await applyStock(p, variantId, qty); throw new PurchasingError(error?.message ?? 'Could not record the loss.', 500); }

    const value = r2(qty * cost);
    if (value > 0 && (await hasAccounting(orgId))) {
        try {
            const inv = await inventoryAcct(orgId), adj = await adjustmentAcct(orgId);
            await postJournal(orgId, userId, today(), `Stock write-off: ${p.name}`, `STK-${mv.id.slice(0, 8)}`, 'STOCK_ADJUSTMENT', mv.id, [
                { accountId: adj, debit: value, credit: 0 }, { accountId: inv, debit: 0, credit: value },
            ]);
        } catch (e) { console.error('[Stock] write-off not posted to the ledger:', (e as Error).message); }
    }
    void alertIfLow(orgId, p, variantId, before, after);
    return { ...mv, productName: p.name, valuePosted: value };
}

/** Every recorded loss, newest first, with who was in charge and who recorded it, plus the totals by person and by kind. */
export async function lossLog(orgId: string) {
    const { data, error } = await supabase.from('stock_movements').select('id, product_id, variant_id, quantity_change, unit_cost, loss_kind, in_charge_name, in_charge_staff_id, note, created_by, created_at')
        .eq('organization_id', orgId).not('loss_kind', 'is', null).order('created_at', { ascending: false }).range(0, 999);
    if (error) throw new PurchasingError(error.message, 500);
    const rows = (data ?? []) as any[];
    const pids = [...new Set(rows.map((r) => r.product_id))], uids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
    const [{ data: prods }, { data: users }] = await Promise.all([
        pids.length ? supabase.from('products').select('id, name, variants').in('id', pids) : Promise.resolve({ data: [] as any[] }),
        uids.length ? supabase.from('users').select('id, name').in('id', uids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const pm = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p])), um = new Map<string, string>((users ?? []).map((u: any) => [u.id, u.name]));
    const items = rows.map((r) => {
        const p = pm.get(r.product_id);
        const units = Math.abs(Number(r.quantity_change) || 0);
        return {
            id: r.id as string, at: r.created_at as string, product: p?.name ?? 'Product', option: r.variant_id ? (variantsOf(p ?? {}).find((v: any) => v.id === r.variant_id)?.name ?? null) : null,
            units, kind: r.loss_kind as string, inCharge: (r.in_charge_name as string | null) ?? null, inChargeStaffId: (r.in_charge_staff_id as string | null) ?? null,
            recordedBy: um.get(r.created_by) ?? null, note: (r.note as string | null) ?? null, value: r2(units * (Number(r.unit_cost) || 0)),
        };
    });
    const byPerson = new Map<string, { name: string; count: number; units: number; value: number }>();
    for (const i of items) {
        const k = i.inCharge ?? 'Nobody named';
        const e = byPerson.get(k) ?? { name: k, count: 0, units: 0, value: 0 };
        e.count++; e.units += i.units; e.value = r2(e.value + i.value); byPerson.set(k, e);
    }
    return { items, totalUnits: items.reduce((s, i) => s + i.units, 0), totalValue: r2(items.reduce((s, i) => s + i.value, 0)), byPerson: [...byPerson.values()].sort((a, b) => b.units - a.units) };
}
