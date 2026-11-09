import { supabase } from '../lib/supabase';
import { QuickBooksService } from './quickbooks.service';
import { getMasterFeesIntegration, MasterFeesConfig, acquireMasterFeesLock, releaseMasterFeesLock, touchMasterFeesLock } from './masterfees.service';
import { NameCandidate } from './masterfees_qb/name_match';
import { buildCustomerMap, resolveStudentCustomer, CustomerMap } from './masterfees_qb/customer_map';
import { paymentInScope, bankReconciliationHold } from './masterfees_qb/payment_rules';
import { isWalletAccountType } from './ledgerCorrections/core';
import { buildMfNumberIndex, buildImpDocIndex, findQbInvoiceForItem, normDesc, qbTermOf, QbInvoiceLike } from './masterfees_qb/mf_qb_link';
import { chooseQbItem, resolveItemId } from './masterfees_qb/fee_mapping';

/**
 * Automatic QuickBooks posting for Master Fees invoices and payments.
 *
 * Master Fees is the reference. For each Master Fees INVOICE this makes sure a matching QuickBooks invoice exists
 * on the student's customer (linking to one that is already there, creating it only when it is certain it is absent).
 * For each MoneyWise payment it posts a QuickBooks PAYMENT on that customer, applied to that invoice, deposited to the
 * right bank account.
 *
 * It is deliberately conservative — anything ambiguous is parked as REVIEW with a plain-English reason and never posted:
 *   - customer must match EXACT or CONTAINED (no fuzzy / ambiguous / missing customer)
 *   - an invoice is created only if QuickBooks has no same-fee invoice for that student around that date
 *     (the bookkeeper bills some fees in monthly pieces; creating a whole-term invoice would double-bill)
 *   - a payment is posted only if the invoice has enough open balance (live check) and the customer has no unclaimed
 *     same-amount payment nearby (it may already have been entered from a bank statement)
 *
 * Gated per organisation by integrations.config.qbAutoPost { enabled, from, dryRun, maxPerTick, depositAccounts }.
 * Only items dated on/after `from` are touched — earlier history is reconciled separately.
 */

const VOID = ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'draft'];
const RETRY_REVIEW_MS = 6 * 3600_000;
const BACKLOG_PER_RUN = 25;                 // older (linkFrom-window) invoices examined per run
const BACKLOG_TIME_RESERVE_MS = 12_000;     // stop backlog work this long before the deadline, leaving time for payments
const AUDIT_NOTE = 'MoneyWise/MasterFees reconciliation. Ref: ';
const day = (d: string) => Math.round(new Date(String(d).slice(0, 10)).getTime() / 86400000);
const money = (n: number) => `K${Number(n).toLocaleString('en', { maximumFractionDigits: 2 })}`;

export interface AutoPostDecision { kind: 'INVOICE' | 'PAYMENT' | 'CUSTOMER'; id: string; label: string; outcome: string; reason?: string; qbId?: string }
export interface AutoPostResult {
    skipped?: string; dryRun: boolean;
    invoices: { linked: number; created: number; review: number; failed: number };
    payments: { posted: number; linked: number; review: number; waiting: number; failed: number };
    decisions: AutoPostDecision[];
}

const rosterCache = new Map<string, { at: number; roster: NameCandidate[] }>();
const itemsCache = new Map<string, { at: number; items: any[] }>();
async function getRoster(orgId: string): Promise<NameCandidate[]> {
    const c = rosterCache.get(orgId); if (c && Date.now() - c.at < 30 * 60_000) return c.roster;
    const roster = (await QuickBooksService.fetchCustomers(orgId)).filter(x => x.active).map(x => ({ id: x.id, name: x.displayName }));
    rosterCache.set(orgId, { at: Date.now(), roster }); return roster;
}
async function getItems(orgId: string): Promise<any[]> {
    const c = itemsCache.get(orgId); if (c && Date.now() - c.at < 60 * 60_000) return c.items;
    const items = await QuickBooksService.fetchItems(orgId); itemsCache.set(orgId, { at: Date.now(), items }); return items;
}

const famOf = (t: string) => /bus|transport|route|drop|zone|between|\bchs\d|\blsk\d|\bptc\d|\bcmb\d/i.test(t) ? 'transport' : /canteen|lunch|meal/i.test(t) ? 'canteen' : /uniform/i.test(t) ? 'uniform' : /tuition|grade|class|primary|school fee/i.test(t) ? 'tuition' : 'other';
const near = (qDate: string, ref: string) => { const x = day(qDate) - day(ref); return x >= -14 && x <= 60; };

export async function runQuickBooksAutoPost(
    organizationId: string,
    opts: { deadline?: number; maxItems?: number; dryRun?: boolean; from?: string; force?: boolean; depositAccounts?: Record<string, string>; only?: 'payments' | 'invoices'; createFrom?: string; linkFrom?: string } = {}
): Promise<AutoPostResult> {
    const result: AutoPostResult = { dryRun: !!opts.dryRun, invoices: { linked: 0, created: 0, review: 0, failed: 0 }, payments: { posted: 0, linked: 0, review: 0, waiting: 0, failed: 0 }, decisions: [] };
    const integ = await getMasterFeesIntegration(organizationId); const cfg = (integ?.config as MasterFeesConfig | undefined)?.qbAutoPost;
    if (!integ || (!opts.force && !cfg?.enabled)) { result.skipped = 'qbAutoPost not enabled'; return result; }
    const from = opts.from ?? cfg?.from; if (!from) { result.skipped = 'qbAutoPost.from not set'; return result; }
    const dryRun = opts.dryRun ?? !!cfg?.dryRun; result.dryRun = dryRun;
    const deadline = opts.deadline ?? Date.now() + 25_000; let budget = opts.maxItems ?? cfg?.maxPerTick ?? 8;
    // Payments get their OWN budget: invoice creation used to spend the whole per-run budget and starve payment posting for as long as an invoice backlog lasted.
    let payBudget = opts.maxItems ?? cfg?.maxPerTick ?? 8;
    const { data: qbInt } = await supabase.from('integrations').select('id').eq('organization_id', organizationId).eq('provider', 'QUICKBOOKS').maybeSingle();
    if (!qbInt) { result.skipped = 'QuickBooks not connected'; return result; }
    const depositAccounts = opts.depositAccounts ?? cfg?.depositAccounts ?? {};
    // Only invoices dated on/after createFrom may be CREATED in QuickBooks; older ones are link-only (history is reconciled, not re-invoiced).
    const createFrom = opts.createFrom ?? cfg?.createFrom ?? from;
    // Invoices dated between linkFrom and `from` are examined in LINK-ONLY mode: they can be tied to the QuickBooks invoice that already exists (Term 1 invoices were
    // imported FROM QuickBooks), but never created (they are older than createFrom). Payments are still limited to `from`, so this cannot post anything old.
    const linkFromCfg = opts.linkFrom ?? cfg?.linkFrom; const invFrom = [from, linkFromCfg, createFrom].filter((d): d is string => !!d).sort()[0];
    // Exclusive: never overlap a Master Fees sync, the cron's own posting pass, or another bulk run (double-posting).
    let locked = false;
    if (!dryRun) { locked = await acquireMasterFeesLock(integ.id); if (!locked) { result.skipped = 'another sync or posting run holds the lock'; return result; } }
    const beat = async () => { if (locked) await touchMasterFeesLock(integ.id); };
    try {

    const markInvoice = async (recId: string, patch: Record<string, any>, mfId?: string) => { if (dryRun && mfId && patch.qb_sync_status) dryState.set(mfId, { status: patch.qb_sync_status, ids: patch.qb_invoice_id ?? '' }); if (!dryRun) await supabase.from('masterfees_records').update({ ...patch, qb_sync_at: new Date().toISOString() }).eq('id', recId); };
    const dryState = new Map<string, { status: string; ids: string }>(); // dry run: carry invoice decisions to the payment stage
    const customerInvoices = new Map<string, QbInvoiceLike[]>(); // per-run cache
    const getCust = async (id: string): Promise<QbInvoiceLike[]> => { if (!customerInvoices.has(id)) customerInvoices.set(id, (await QuickBooksService.fetchInvoicesForCustomer(organizationId, id)) as QbInvoiceLike[]); return customerInvoices.get(id)!; };

    // QuickBooks payment ids already recorded against a MoneyWise entry (loaded once per run, kept current in memory).
    let claimedAll: Set<string> | null = null;
    const loadClaimed = async (): Promise<Set<string>> => {
        if (claimedAll) return claimedAll; const set = new Set<string>();
        for (const c of await pageAll((a, b) => supabase.from('cashbook_entries').select('qb_deposit_id').eq('organization_id', organizationId).like('qb_deposit_id', 'PMT:%').order('id').range(a, b))) for (const pid of String(c.qb_deposit_id).slice(4).split(';')) set.add(pid);
        for (const r of await pageAll((a, b) => supabase.from('masterfees_qb_payments').select('qb_payment_id').eq('organization_id', organizationId).order('id').range(a, b))) set.add(String(r.qb_payment_id));
        return (claimedAll = set);
    };
    const custPays = new Map<string, any[]>();
    const getPays = async (custId: string): Promise<any[]> => { if (!custPays.has(custId)) custPays.set(custId, await QuickBooksService.fetchPaymentsForCustomer(organizationId, custId, new Date((day(from) - 45) * 86400000).toISOString().slice(0, 10))); return custPays.get(custId)!; };

    // ───────────────────────────── INVOICES ─────────────────────────────
    // Page through ALL candidates (a fixed .limit() in arbitrary order silently hides pending work once history grows).
    const pageAll = async (build: (from: number, to: number) => any): Promise<any[]> => { const out: any[] = []; for (let k = 0; k < 20000; k += 1000) { const { data, error } = await build(k, k + 999); if (error) throw error; out.push(...(data ?? [])); if ((data ?? []).length < 1000) break; } return out; };
    // Master Fees "IMP-<n>-R<n>" payment references carry the QuickBooks DocNumber of the invoice they were imported from — the strongest link there is for
    // the invoices that came FROM QuickBooks. Built once per run from the payments MoneyWise already holds. (The poster used to ignore it, so ~950 Term 1
    // invoices that exist in QuickBooks were parked as "not in QuickBooks".)
    // Student -> QuickBooks customer, read before any name matching. If it cannot be read the poster falls back to names, as it did before the map existed.
    let custMapCache: CustomerMap | null = null;
    const getCustMap = async (): Promise<CustomerMap> => {
        if (custMapCache) return custMapCache;
        try { custMapCache = buildCustomerMap(await pageAll((a, b) => supabase.from('masterfees_qb_customer_map').select('student_id,qb_customer_id,qb_customer_name').eq('organization_id', organizationId).order('student_id').range(a, b))); }
        catch (e: any) { console.warn('[MasterFees→QB] customer map unavailable, using name matching only:', e?.message); custMapCache = buildCustomerMap([]); }
        return custMapCache;
    };
    let impIdxCache: Map<string, string> | null = null;
    const getImpIdx = async (): Promise<Map<string, string>> => {
        if (impIdxCache) return impIdxCache;
        const rows = await pageAll((a, b) => supabase.from('masterfees_records').select('mf_reference,mf_invoice_id').eq('organization_id', organizationId).eq('record_type', 'PAYMENT').like('mf_reference', 'IMP-%').not('mf_invoice_id', 'is', null).order('mf_id').range(a, b));
        return (impIdxCache = buildImpDocIndex(rows.map((r: any) => ({ reference: r.mf_reference, invoice_id: r.mf_invoice_id }))));
    };
    // One-off, owner-confirmed new students: qbAutoPost.createCustomers = [{ student_id, name }]. Creates the QuickBooks customer (or maps to an existing customer with exactly
    // that name — never a duplicate), records it in the student->customer map, then removes the entry from the config. Skipped in dry runs.
    const wantCustomers: Array<{ student_id: string; name: string }> = (cfg as any)?.createCustomers ?? [];
    if (!dryRun && wantCustomers.length) {
        const norm = (v: string) => String(v).toUpperCase().replace(/\s+/g, ' ').trim(); const done: string[] = []; const map0 = await getCustMap(); const roster0 = await getRoster(organizationId);
        for (const w of wantCustomers) {
            await beat();
            if (map0.byStudent.has(String(w.student_id))) { done.push(w.student_id); continue; }
            const existing = roster0.find(c => norm(c.name) === norm(w.name)); let id = existing?.id, name = existing?.name;
            if (!id) { const r = await QuickBooksService.createCustomer(organizationId, norm(w.name)); if (!r.success || !r.qbId) { result.decisions.push({ kind: 'CUSTOMER', id: w.student_id, label: w.name, outcome: 'FAILED', reason: JSON.stringify(r.error).slice(0, 200) }); continue; } id = String(r.qbId); name = norm(w.name); }
            const { error: me } = await supabase.from('masterfees_qb_customer_map').upsert({ organization_id: organizationId, student_id: String(w.student_id), student_name: w.name, qb_customer_id: id, qb_customer_name: name, source: existing ? 'MATCHED_EXISTING' : 'CREATED_BY_POSTER', confirmed_by: 'owner (chat 2026-11-06)' }, { onConflict: 'organization_id,student_id' });
            if (me) { result.decisions.push({ kind: 'CUSTOMER', id: w.student_id, label: w.name, outcome: 'FAILED', reason: `created ${id} but could not record the map: ${me.message}` }); continue; }
            result.decisions.push({ kind: 'CUSTOMER', id: w.student_id, label: w.name, outcome: existing ? 'MAPPED_EXISTING' : 'CREATED', qbId: id }); done.push(w.student_id);
        }
        custMapCache = null; rosterCache.delete(organizationId);
        if (done.length) { const fresh = await getMasterFeesIntegration(organizationId); const q: any = (fresh?.config as any)?.qbAutoPost; if (fresh && q) await supabase.from('integrations').update({ config: { ...fresh.config, qbAutoPost: { ...q, createCustomers: (q.createCustomers ?? []).filter((x: any) => !done.includes(x.student_id)) } }, updated_at: new Date().toISOString() }).eq('id', fresh.id); }
    }
    const invRecs = await pageAll((a, b) => supabase.from('masterfees_records')
        .select('id,mf_id,mf_reference,amount,mf_status,raw,qb_sync_status,qb_sync_at,qb_invoice_id,journal_entry_id')
        .eq('organization_id', organizationId).eq('record_type', 'INVOICE').not('journal_entry_id', 'is', null)
        .or('qb_sync_status.is.null,qb_sync_status.eq.REVIEW,qb_sync_status.eq.FAILED')
        .gte('raw->>due_date', invFrom).order('mf_id').range(a, b));
    const pendingInv = (invRecs).filter(r => {
        if (VOID.includes(String(r.mf_status || '').toLowerCase()) || r.qb_sync_status === 'SUCCESS') return false;
        const eff = String(r.raw?.date_issued || r.raw?.due_date || '').slice(0, 10); if (!eff || eff < invFrom) return false;
        return !r.qb_sync_at || Date.now() - new Date(r.qb_sync_at).getTime() > RETRY_REVIEW_MS;
    });
    // Resolve ONE Master Fees invoice against QuickBooks: link to an existing invoice, or (only when allowCreate) create it.
    const processInvoice = async (rec: any, allowCreate: boolean): Promise<void> => {
        await beat();
        const roster = await getRoster(organizationId);
            const inv = rec.raw ?? {}; const student = inv.student?.full_name || ''; const label = `${student} · ${money(Number(inv.total_amount))} · ${inv.date_issued || inv.due_date}`;
            const review = async (reason: string) => { result.invoices.review++; result.decisions.push({ kind: 'INVOICE', id: rec.mf_id, label, outcome: 'REVIEW', reason }); await markInvoice(rec.id, { qb_sync_status: 'REVIEW', qb_sync_error: reason }, rec.mf_id); };
            try {
                const m = resolveStudentCustomer(inv.student?.student_id, student, roster, await getCustMap());
                if (m.tier !== 'EXACT' && m.tier !== 'CONTAINED') { await review(`Customer match is ${m.tier}: ${m.detail}`); return; }
                const custInvs = await getCust(m.match!.id);
                const { data: claimedRows } = await supabase.from('masterfees_records').select('qb_invoice_id').eq('organization_id', organizationId).eq('record_type', 'INVOICE').neq('mf_id', rec.mf_id).not('qb_invoice_id', 'is', null).in('qb_invoice_id', custInvs.map(q => q.id));
                const claimed = new Set<string>(); for (const r of claimedRows ?? []) for (const x of String(r.qb_invoice_id).split(',')) claimed.add(x);
                const mfNum = String(inv.invoice_number || inv.invoice_id).trim(); const index = buildMfNumberIndex(custInvs);
                const impDoc = (await getImpIdx()).get(rec.mf_id) ?? null; const qbByDoc = new Map<string, QbInvoiceLike>(custInvs.filter(q => q.docNumber).map(q => [q.docNumber, q] as [string, QbInvoiceLike]));
                const items = (inv.items?.length ? inv.items : [{ description: mfNum, amount: inv.total_amount, category: '' }]).filter((i: any) => Number(i.amount) > 0);
                const ids: string[] = []; let created = 0; let blocked = '';
                // Master Fees discount / prize lines are negative. They reduce what is owed, so QuickBooks must carry the NET amount.
                const discounts = (inv.items ?? []).filter((i: any) => Number(i.amount) < 0); const discTotal = discounts.reduce((sx: number, i: any) => sx + Number(i.amount), 0);
                if (discTotal < 0 && items.length !== 1) { await review(`Invoice has a discount (${money(discTotal)}) across ${items.length} priced fee items — which item it reduces needs a person`); return; }
                for (const it of items) {
                    const gross = Number(it.amount); const amt = gross + (discTotal < 0 ? discTotal : 0);
                    const link = findQbInvoiceForItem(mfNum, it.description || '', amt, custInvs, index, claimed, { mfTerm: inv.term ?? null, mfYear: inv.year != null ? Number(inv.year) : null, impDocNumber: impDoc, qbByDoc });
                    if (link.tier !== 'NONE' && link.invoice) { ids.push(link.invoice.id); claimed.add(link.invoice.id); continue; }
                    if (link.impMismatch) { blocked = `The import reference points to QuickBooks invoice #${link.impMismatch.docNumber} for this student, but its total is ${money(link.impMismatch.qbTotal)} and Master Fees has "${it.description || 'this fee'}" at ${money(amt)} — not linking and not creating a second invoice; needs a person`; break; }
                    if (discTotal < 0) {
                        const g = findQbInvoiceForItem(mfNum, it.description || '', gross, custInvs, index, claimed, { mfTerm: inv.term ?? null, mfYear: inv.year != null ? Number(inv.year) : null, impDocNumber: impDoc, qbByDoc });
                        if (g.tier !== 'NONE' && g.invoice) { blocked = `QuickBooks has this fee at the full ${money(gross)} (invoice #${g.invoice.docNumber || g.invoice.id}) but Master Fees applied a ${money(discTotal)} discount (net ${money(amt)}) — the discount needs applying in QuickBooks; not changed automatically`; break; }
                    }
                    // not in QuickBooks — create only if nothing for the same fee exists around that date (monthly-pieces guard)
                    const fam = famOf(`${it.category || ''} ${it.description || ''}`); const issued = inv.date_issued || inv.due_date; const due = inv.due_date || issued;
                    const sameFee = custInvs.filter(q => (near(q.date, issued) || near(q.date, due)) && (qbTermOf(q) == null || inv.term == null || Number(qbTermOf(q)) === Number(inv.term))
                        && !(q.privateNote || '').includes(AUDIT_NOTE) && q.lines.some(l => famOf(`${l.itemName} ${l.description}`) === fam));
                    if (sameFee.length) { blocked = `QuickBooks already has ${fam} invoice(s) for this student around then (${sameFee.map(q => `#${q.docNumber || q.id} ${money(q.totalAmt)}`).join(', ')}) — not creating "${it.description}" ${money(amt)} to avoid double-billing`; break; }
                    if (!allowCreate) { blocked = `This invoice (${issued}) is older than the auto-post start date and is not in QuickBooks — needs reconciliation, not auto-creation`; break; }
                    const choice = chooseQbItem(it.description || '', it.category || '', inv.student?.grade || ''); const itemId = choice.itemName ? resolveItemId(choice.itemName, await getItems(organizationId)) : null;
                    if (!itemId) { blocked = `No QuickBooks item mapping for "${it.description}" (${it.category || 'no category'})`; break; }
                    if (dryRun) { ids.push('(would-create)'); created++; continue; }
                    const r = await QuickBooksService.createInvoice(organizationId, { customerId: m.match!.id, txnDate: String(issued).slice(0, 10), lines: [{ amount: amt, itemId, description: `${it.description || ''}${discTotal < 0 ? ` (net of ${discounts.map((d: any) => `${String(d.description || 'discount').slice(0, 40)} ${d.amount}`).join('; ')})` : ''}` }], privateNote: `${AUDIT_NOTE}${mfNum}` });
                    if (!r.success) { blocked = `QuickBooks rejected the invoice: ${JSON.stringify(r.error).slice(0, 200)}`; result.invoices.failed++; break; }
                    ids.push(String(r.qbId)); created++; budget--; customerInvoices.delete(m.match!.id); // the cached list is now stale
                }
                if (blocked) { if (ids.length && !dryRun) await markInvoice(rec.id, { qb_invoice_id: ids.join(',') }); await review(blocked); return; }
                if (created) result.invoices.created++; else result.invoices.linked++;
                result.decisions.push({ kind: 'INVOICE', id: rec.mf_id, label, outcome: created ? 'CREATED' : 'LINKED', qbId: ids.join(',') });
                await markInvoice(rec.id, { qb_sync_status: 'SUCCESS', qb_sync_error: null, qb_invoice_id: ids.join(',') }, rec.mf_id);
            } catch (err: any) { result.invoices.failed++; result.decisions.push({ kind: 'INVOICE', id: rec.mf_id, label, outcome: 'FAILED', reason: err.message }); await markInvoice(rec.id, { qb_sync_status: 'FAILED', qb_sync_error: String(err.message).slice(0, 300) }); }
    };
    // Current invoices first. Older ones (the linkFrom window) are a backlog: capped per run and stopped early, so they can never starve current invoices or the
    // payment stage below, which only runs if time is left.
    const invDay = (r: any) => String(r.raw?.date_issued || r.raw?.due_date || '').slice(0, 10);
    const currentInv = pendingInv.filter(r => invDay(r) >= from), backlogInv = pendingInv.filter(r => invDay(r) < from);
    if (opts.only !== 'payments') {
        for (const rec of currentInv) {
            if (Date.now() > (deadline - 4000) || budget <= 0) break;
            await processInvoice(rec, invDay(rec) >= createFrom);
        }
        let backlogDone = 0;
        for (const rec of backlogInv) {
            if (backlogDone >= (opts.maxItems ?? BACKLOG_PER_RUN) || Date.now() > (deadline - BACKLOG_TIME_RESERVE_MS) || budget <= 0) break;
            await processInvoice(rec, invDay(rec) >= createFrom); backlogDone++;
        }
    }

    // ───────────────────────────── PAYMENTS ─────────────────────────────
    if (opts.only !== 'invoices' && Date.now() < deadline - 4000 && payBudget > 0) {
        const payFrom = createFrom < from ? createFrom : from;
        const payRecs = await pageAll((a, b) => supabase.from('masterfees_records')
            .select('id,mf_id,amount,raw,cashbook_entry_id').eq('organization_id', organizationId).eq('record_type', 'PAYMENT').eq('mf_status', 'success')
                        .not('cashbook_entry_id', 'is', null).gte('raw->>completed_at', payFrom).order('mf_id').range(a, b));
        // Payments completed before `from` are only in scope when their invoice is in the creation window (see payment_rules.ts).
        const invDayById = new Map<string, string>();
        if (payFrom < from) {
            const need = [...new Set(payRecs.filter(r => String(r.raw?.completed_at || '').slice(0, 10) < from).map(r => r.raw?.invoice_id).filter(Boolean))] as string[];
            for (let i = 0; i < need.length; i += 150) { const { data } = await supabase.from('masterfees_records').select('mf_id,raw').eq('organization_id', organizationId).eq('record_type', 'INVOICE').in('mf_id', need.slice(i, i + 150)); for (const d of data ?? []) invDayById.set(d.mf_id, String(d.raw?.date_issued || d.raw?.due_date || '').slice(0, 10)); }
        }
        const scoped = payRecs.filter(r => paymentInScope(r.raw?.completed_at, invDayById.get(r.raw?.invoice_id) ?? null, from, createFrom));
        payRecs.length = 0; payRecs.push(...scoped);
        const ids = payRecs.map(r => r.cashbook_entry_id) as string[]; const cbs = new Map<string, any>();
        for (let i = 0; i < ids.length; i += 150) { const { data } = await supabase.from('cashbook_entries').select('id,date,debit,qb_sync_status,qb_sync_at,qb_sync_error,mf_payment_channel,external_reference,sender_name,verification_status,account_type').in('id', ids.slice(i, i + 150)); for (const c of data ?? []) cbs.set(c.id, c); }
        // Bank reconciliation: latest statement day per wallet that has a statement imported, and which entries are matched to a statement line.
        const stmtDay = new Map<string, string>(); const linkedEntries = new Set<string>();
        for (const w of [...new Set([...cbs.values()].map((c: any) => c.account_type).filter((t: any) => isWalletAccountType(t)))] as string[]) {
            const { data } = await supabase.from('bank_statement_lines').select('line_date').eq('external_wallet_id', w).order('line_date', { ascending: false }).limit(1); if (data?.[0]?.line_date) stmtDay.set(w, String(data[0].line_date).slice(0, 10));
        }
        if (stmtDay.size) for (let i = 0; i < ids.length; i += 150) { const { data } = await supabase.from('ledger_entry_statement_lines').select('ledger_entry_id').eq('organization_id', organizationId).in('ledger_entry_id', ids.slice(i, i + 150)); for (const d of data ?? []) linkedEntries.add(d.ledger_entry_id); }
        const pending = payRecs.filter(r => {
            const c = cbs.get(r.cashbook_entry_id); if (!c || c.qb_sync_status === 'SUCCESS') return false;
            if (c.verification_status === 'UNVERIFIED') return false;   // parked: no bank deposit behind it, never post it
            const waiting = String(c.qb_sync_error || '').startsWith('WAIT:'); // WAIT = depends on an invoice not in QuickBooks yet -> retry every tick
            return waiting || !c.qb_sync_at || Date.now() - new Date(c.qb_sync_at).getTime() > RETRY_REVIEW_MS;
        });
        for (const rec of pending) {
            if (Date.now() > deadline - 3000 || payBudget <= 0) break;
            await beat();
            const txn = rec.raw ?? {}; const cb = cbs.get(rec.cashbook_entry_id); const amount = Number(cb.debit);
            const label = `${txn.student?.full_name || cb.sender_name || ''} · ${money(amount)} · ${cb.date} · ${txn.reference || ''}`;
            const mark = async (patch: Record<string, any>) => { if (!dryRun) await supabase.from('cashbook_entries').update({ ...patch, qb_sync_at: new Date().toISOString() }).eq('id', cb.id); };
            const park = async (reason: string, waiting = false) => { waiting ? result.payments.waiting++ : result.payments.review++; result.decisions.push({ kind: 'PAYMENT', id: rec.mf_id, label, outcome: waiting ? 'WAITING' : 'REVIEW', reason }); await mark({ qb_sync_error: `${waiting ? 'WAIT' : 'REVIEW'}: ${reason}`.slice(0, 400) }); };
            try {
                const hold = bankReconciliationHold({ accountType: cb.account_type, date: cb.date, linked: linkedEntries.has(cb.id) }, stmtDay);
                if (hold) { await park(hold); continue; }
                const { data: audited } = await supabase.from('masterfees_qb_payments').select('qb_payment_id').eq('cashbook_entry_id', cb.id).maybeSingle();
                if (audited) { await mark({ qb_sync_status: 'SUCCESS', qb_sync_error: null, qb_deposit_id: `PMT:${audited.qb_payment_id}`, status: 'ACCOUNTED' }); continue; }
                const loadInv = async () => txn.invoice_id ? (await supabase.from('masterfees_records').select('id,mf_id,mf_reference,amount,mf_status,raw,qb_invoice_id,qb_sync_status,qb_sync_at,journal_entry_id').eq('organization_id', organizationId).eq('record_type', 'INVOICE').eq('mf_id', txn.invoice_id).maybeSingle()).data as any : null;
                let invRec = await loadInv();
                // An older invoice nobody has looked up yet: resolve it now (link-only unless it is itself on/after the start date).
                if (invRec && !dryState.has(txn.invoice_id) && !['SUCCESS', 'REVIEW'].includes(invRec.qb_sync_status || '') && invRec.journal_entry_id && Date.now() < deadline - 6000) {
                    const eff = String(invRec.raw?.date_issued || invRec.raw?.due_date || '').slice(0, 10);
                    await processInvoice(invRec, eff >= createFrom);
                    invRec = await loadInv();
                }
                if (invRec && dryRun && dryState.has(txn.invoice_id)) { const o = dryState.get(txn.invoice_id)!; (invRec as any).qb_sync_status = o.status; (invRec as any).qb_invoice_id = o.ids; }
                if (invRec && String((invRec as any).qb_invoice_id || '').includes('(would-create)')) { await park('Its QuickBooks invoice would be created first (dry run)', true); continue; }
                if (!invRec) { await park(txn.invoice_id ? 'Its Master Fees invoice has not reached MoneyWise yet' : 'Master Fees shows no invoice for this payment', !!txn.invoice_id); continue; }
                if (invRec.qb_sync_status !== 'SUCCESS' || !invRec.qb_invoice_id) { await park(`Its invoice is not in QuickBooks yet (${invRec.qb_sync_status || 'not processed'}${invRec.qb_invoice_id ? '' : ''})`, invRec.qb_sync_status !== 'REVIEW'); continue; }
                const channel = /^REF-/i.test(String(txn.reference || '')) ? 'LENCO' : (cb.mf_payment_channel || 'OTHER'); const deposit = depositAccounts[channel];
                if (!deposit) { await park(`No QuickBooks bank account is mapped for channel "${channel}"`); continue; }
                const qbIds = String(invRec.qb_invoice_id).split(',').filter(x => /^\d+$/.test(x)); const items = (invRec.raw?.items ?? []).filter((i: any) => Number(i.amount) > 0);
                if (qbIds.length !== items.length) { await park('QuickBooks invoice ids do not line up with the Master Fees fee items'); continue; }
                if (items.length > 1 && Math.abs(amount - Number(invRec.raw?.total_amount)) > 0.01) { await park('Part-payment of a multi-item invoice — which item it paid cannot be told automatically'); continue; }
                // customer = the customer who owns the linked QuickBooks invoice
                const roster = await getRoster(organizationId); const m = resolveStudentCustomer(invRec.raw?.student?.student_id, invRec.raw?.student?.full_name || '', roster, await getCustMap());
                if (m.tier !== 'EXACT' && m.tier !== 'CONTAINED') { await park(`Customer match is ${m.tier}`); continue; }
                let custInvs = await getCust(m.match!.id); const lines: Array<{ invoiceId: string; amount: number }> = [];
                // an invoice created earlier in this same run may not be in the cached list yet — refresh once before judging it missing
                if (qbIds.some(id => !custInvs.find(x => x.id === id))) { customerInvoices.delete(m.match!.id); custInvs = await getCust(m.match!.id); }
                // Is this payment already in QuickBooks (entered by hand / from the bank statement)? An UNCLAIMED same-amount payment for this
                // customer, applied to this very invoice, within 45 days, is that payment -> link it instead of posting a duplicate.
                const pays = await getPays(m.match!.id); const claimedSet = await loadClaimed();
                const sameAmt = pays.filter((p: any) => Math.abs(Number(p.TotalAmt) - amount) < 0.005 && Math.abs(day(p.TxnDate) - day(cb.date)) <= 45);
                const free = sameAmt.filter((p: any) => !claimedSet.has(String(p.Id)));
                const appliedTo = (p: any): string[] => (p.Line ?? []).flatMap((l: any) => (l.LinkedTxn ?? []).map((t: any) => String(t.TxnId)));
                const linkable = free.filter((p: any) => appliedTo(p).some(id => qbIds.includes(id))).sort((x: any, y: any) => Math.abs(day(x.TxnDate) - day(cb.date)) - Math.abs(day(y.TxnDate) - day(cb.date)));
                if (linkable.length) {
                    const lp = linkable[0]; claimedSet.add(String(lp.Id)); result.payments.linked++;
                    result.decisions.push({ kind: 'PAYMENT', id: rec.mf_id, label, outcome: dryRun ? 'WOULD_LINK' : 'LINKED', qbId: String(lp.Id), reason: `existing QuickBooks payment ${lp.Id} (${lp.TxnDate}) applied to this invoice` });
                    if (!dryRun) {
                        await supabase.from('masterfees_qb_payments').insert({ organization_id: organizationId, cashbook_entry_id: cb.id, qb_customer_id: m.match!.id, qb_customer_name: m.match!.name, qb_payment_id: String(lp.Id), amount, qb_invoice_ids: appliedTo(lp), origin: 'LINKED' });
                        await mark({ qb_sync_status: 'SUCCESS', qb_sync_error: null, qb_deposit_id: `PMT:${lp.Id}`, status: 'ACCOUNTED' });
                    }
                    continue;
                }
                let bad = '';
                items.forEach((it: any, idx: number) => { const q = custInvs.find(x => x.id === qbIds[idx]); const amt = items.length > 1 ? Number(it.amount) : amount; if (!q) bad = `QuickBooks invoice ${qbIds[idx]} was not found on ${m.match!.name}`; else if (q.balance + 0.01 < amt) bad = `QuickBooks invoice ${q.docNumber || q.id} has only ${money(q.balance)} open, payment is ${money(amt)}`; else lines.push({ invoiceId: q.id, amount: amt }); });
                if (bad) { await park(bad); continue; }
                if (free.length) { await park(`Customer has an unclaimed ${money(amount)} payment in QuickBooks nearby (payment ${free.map((p: any) => p.Id).join(', ')}) but it is not applied to this invoice — it may be this same payment`); continue; }
                if (dryRun) { result.payments.posted++; result.decisions.push({ kind: 'PAYMENT', id: rec.mf_id, label, outcome: 'WOULD_POST', reason: `deposit ${deposit}, invoices ${lines.map(l => l.invoiceId).join(',')}` }); continue; }
                const r = await QuickBooksService.createPayment(organizationId, { customerId: m.match!.id, txnDate: String(cb.date).slice(0, 10), depositToAccountId: deposit, lines, privateNote: `Master Fees payment via MoneyWise — ref ${cb.external_reference || cb.id}, ${channel} (MF txn ${rec.mf_id})` });
                if (!r.success) { result.payments.failed++; result.decisions.push({ kind: 'PAYMENT', id: rec.mf_id, label, outcome: 'FAILED', reason: JSON.stringify(r.error).slice(0, 200) }); await mark({ qb_sync_status: 'FAILED', qb_sync_error: JSON.stringify(r.error).slice(0, 300) }); continue; }
                payBudget--; result.payments.posted++; claimedSet.add(String(r.qbId)); custPays.delete(m.match!.id);
                await supabase.from('masterfees_qb_payments').insert({ organization_id: organizationId, cashbook_entry_id: cb.id, qb_customer_id: m.match!.id, qb_customer_name: m.match!.name, qb_payment_id: r.qbId, amount, qb_invoice_ids: lines.map(l => l.invoiceId), origin: 'POSTED' });
                await mark({ qb_sync_status: 'SUCCESS', qb_sync_error: null, qb_deposit_id: `PMT:${r.qbId}`, status: 'ACCOUNTED' });
                result.decisions.push({ kind: 'PAYMENT', id: rec.mf_id, label, outcome: 'POSTED', qbId: String(r.qbId) });
            } catch (err: any) { result.payments.failed++; result.decisions.push({ kind: 'PAYMENT', id: rec.mf_id, label, outcome: 'FAILED', reason: err.message }); await mark({ qb_sync_status: 'FAILED', qb_sync_error: String(err.message).slice(0, 300) }); }
        }
    }
        return result;
    } finally { if (locked) await releaseMasterFeesLock(integ.id); }
}
