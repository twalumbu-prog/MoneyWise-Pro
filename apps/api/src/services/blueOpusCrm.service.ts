import { supabase } from '../lib/supabase';

/**
 * Blue Opus Software owns MoneyWise and Project Genius, so its CRM also carries the customers of those two
 * products as distinct rows, tagged by `customers.external_source`:
 *   - MONEYWISE        one per active MoneyWise account (organization); external_id = organization id.
 *   - PROJECT_GENIUS   one per Project Genius user; external_id = the user's id in Project Genius.
 *                      Project Genius runs on its own backend, so it pushes its users to POST /v1/crm/project-genius/users.
 * This is cross-tenant data: everything here is gated to the Blue Opus organization on the server.
 */
export const BLUE_OPUS_ORG_ID = 'fa99669d-6160-44fd-94ac-8ff1f065003f';

export type CrmProduct = 'MONEYWISE' | 'PROJECT_GENIUS';
export const CRM_PRODUCTS: { value: CrmProduct; label: string }[] = [
    { value: 'MONEYWISE', label: 'MoneyWise' },
    { value: 'PROJECT_GENIUS', label: 'Project Genius' },
];

export const isBlueOpus = (organizationId?: string | null) => organizationId === BLUE_OPUS_ORG_ID;
export const isProductSource = (source?: string | null): source is CrmProduct => source === 'MONEYWISE' || source === 'PROJECT_GENIUS';
export const productLabel = (source?: string | null) => CRM_PRODUCTS.find(p => p.value === source)?.label ?? null;

const SYNC_MIN_INTERVAL_MS = 10 * 60_000;
const PAGE = 1000;
let lastSyncAt = 0;
let metadataColumn: boolean | null = null;

const clean = (v: unknown, max = 200): string | null => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s ? s.slice(0, max) : null;
};

async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
    const out: T[] = [];
    for (let o = 0; ; o += PAGE) {
        const { data, error } = await build(o, o + PAGE - 1);
        if (error) throw new Error(error.message);
        out.push(...(data ?? []));
        if ((data ?? []).length < PAGE) break;
    }
    return out;
}

/** `customers.metadata` comes from an optional migration; without it the CRM still works, minus the extra fields. */
async function hasMetadataColumn(): Promise<boolean> {
    if (metadataColumn !== null) return metadataColumn;
    const { error } = await supabase.from('customers').select('metadata').limit(1);
    metadataColumn = !error;
    return metadataColumn;
}

// ── MoneyWise accounts ───────────────────────────────────────────────────────

export interface CustomerRow {
    external_source: CrmProduct;
    external_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    metadata: Record<string, any>;
    created_at?: string;
}

/** Pure: turn organizations + their users + subscriptions into the CRM rows for MoneyWise accounts. */
export function buildMoneyWiseRows(orgs: any[], users: any[], subs: any[]): CustomerRow[] {
    const usersByOrg = new Map<string, any[]>();
    for (const u of users) (usersByOrg.get(u.organization_id) || usersByOrg.set(u.organization_id, []).get(u.organization_id)!).push(u);
    const planByOrg = new Map<string, string>(subs.map(s => [s.organization_id, s.plan_id]));

    const rows: CustomerRow[] = [];
    for (const org of orgs) {
        if (org.id === BLUE_OPUS_ORG_ID) continue; // Blue Opus is not its own customer
        const members = usersByOrg.get(org.id) || [];
        const active = members.filter(u => u.status === 'ACTIVE');
        // An account is "active" when someone can still sign in to it.
        const admin = active.find(u => u.role === 'ADMIN') || active[0] || members.find(u => u.role === 'ADMIN') || members[0];
        const name = clean(org.name);
        if (!name) continue;
        const plan = planByOrg.get(org.id) || 'free';
        rows.push({
            external_source: 'MONEYWISE',
            external_id: org.id,
            name,
            email: clean(org.email) || clean(admin?.email),
            phone: clean(org.phone, 40),
            notes: `MoneyWise account · ${plan} plan · ${active.length} active member${active.length === 1 ? '' : 's'}${admin?.name ? ` · admin ${clean(admin.name)}` : ''}`,
            status: active.length > 0 ? 'ACTIVE' : 'INACTIVE',
            metadata: { organization_id: org.id, plan, active_members: active.length, admin_name: clean(admin?.name), is_personal: !!org.is_personal },
            created_at: org.created_at,
        });
    }
    return rows;
}

/** Idempotent upsert of one product's rows, keyed (organization, source, external_id). Never touches rows other sources own. */
async function upsertProductRows(rows: CustomerRow[], source: CrmProduct) {
    const withMeta = await hasMetadataColumn();
    const existing = new Map<string, any>();
    const have = await fetchAll((f, t) => supabase.from('customers')
        .select(withMeta ? 'id, external_id, name, email, phone, notes, status, metadata' : 'id, external_id, name, email, phone, notes, status')
        .eq('organization_id', BLUE_OPUS_ORG_ID).eq('external_source', source).order('id').range(f, t));
    have.forEach(r => existing.set(r.external_id, r));

    const out = { created: 0, updated: 0, unchanged: 0, deactivated: 0 };
    const inserts: any[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        if (seen.has(r.external_id)) continue;
        seen.add(r.external_id);
        const body: any = { name: r.name, email: r.email, phone: r.phone, notes: r.notes, status: r.status };
        if (withMeta) body.metadata = r.metadata;
        const prior = existing.get(r.external_id);
        if (!prior) {
            inserts.push({ ...body, organization_id: BLUE_OPUS_ORG_ID, external_source: source, external_id: r.external_id, ...(r.created_at ? { created_at: r.created_at } : {}) });
            continue;
        }
        // A hand-edited email/phone in the CRM wins over the synced one.
        const patch: any = { ...body, email: prior.email ?? body.email, phone: prior.phone ?? body.phone };
        const same = ['name', 'email', 'phone', 'notes', 'status'].every(k => (prior[k] ?? null) === (patch[k] ?? null))
            && (!withMeta || JSON.stringify(prior.metadata ?? {}) === JSON.stringify(patch.metadata ?? {}));
        if (same) { out.unchanged++; continue; }
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from('customers').update(patch).eq('id', prior.id);
        if (error) throw new Error(error.message);
        out.updated++;
    }
    for (let i = 0; i < inserts.length; i += 200) {
        const { error } = await supabase.from('customers').insert(inserts.slice(i, i + 200));
        if (error) throw new Error(error.message);
        out.created += Math.min(200, inserts.length - i);
    }
    return { out, existing, seen };
}

export async function syncMoneyWiseCustomers() {
    const [orgs, users, subs] = await Promise.all([
        fetchAll((f, t) => supabase.from('organizations').select('id, name, email, phone, is_personal, created_at').order('id').range(f, t)),
        fetchAll((f, t) => supabase.from('users').select('organization_id, name, email, role, status').order('id').range(f, t)),
        fetchAll((f, t) => supabase.from('organization_subscriptions').select('organization_id, plan_id').order('id').range(f, t)),
    ]);
    const rows = buildMoneyWiseRows(orgs, users, subs);
    const { out, existing, seen } = await upsertProductRows(rows, 'MONEYWISE');
    // An account that has disappeared (org deleted) is archived, not removed, so its history stays on the customer.
    for (const [extId, prior] of existing) {
        if (seen.has(extId) || prior.status === 'INACTIVE') continue;
        await supabase.from('customers').update({ status: 'INACTIVE', updated_at: new Date().toISOString() }).eq('id', prior.id);
        out.deactivated++;
    }
    return out;
}

/** One account's row, for the moment it signs up or changes; never archives anything. */
export async function syncMoneyWiseCustomerForOrg(organizationId: string) {
    if (organizationId === BLUE_OPUS_ORG_ID) return null;
    const [{ data: org }, { data: users }, { data: subs }] = await Promise.all([
        supabase.from('organizations').select('id, name, email, phone, is_personal, created_at').eq('id', organizationId).maybeSingle(),
        supabase.from('users').select('organization_id, name, email, role, status').eq('organization_id', organizationId),
        supabase.from('organization_subscriptions').select('organization_id, plan_id').eq('organization_id', organizationId),
    ]);
    if (!org) return null;
    const rows = buildMoneyWiseRows([org], users ?? [], subs ?? []);
    return (await upsertProductRows(rows, 'MONEYWISE')).out;
}

// ── Project Genius users (pushed in by Project Genius) ───────────────────────

/** Pure: validate one pushed Project Genius user; returns null when it can't be keyed. */
export function normalizeProjectGeniusUser(u: any): CustomerRow | null {
    const id = clean(u?.id ?? u?.user_id ?? u?.external_id, 120);
    if (!id) return null;
    const email = clean(u?.email, 200)?.toLowerCase() ?? null;
    const name = clean(u?.name ?? u?.full_name) || email || `Project Genius user ${id.slice(0, 8)}`;
    const role = clean(u?.role, 40);
    const school = clean(u?.school ?? u?.organization ?? u?.school_name);
    const refs = (Array.isArray(u?.payment_references) ? u.payment_references : [])
        .map((r: any) => clean(r, 80)).filter(Boolean).slice(0, 50) as string[];
    const createdAt = u?.created_at && Number.isFinite(Date.parse(u.created_at)) ? new Date(u.created_at).toISOString() : undefined;
    return {
        external_source: 'PROJECT_GENIUS',
        external_id: id,
        name,
        email,
        phone: clean(u?.phone, 40),
        notes: `Project Genius${role ? ` ${role}` : ' user'}${school ? ` · ${school}` : ''}`,
        status: ['INACTIVE', 'DISABLED', 'SUSPENDED', 'DELETED'].includes(String(u?.status || '').toUpperCase()) ? 'INACTIVE' : 'ACTIVE',
        metadata: { role, school, payment_references: refs },
        created_at: createdAt,
    };
}

export async function ingestProjectGeniusUsers(users: any[]) {
    const rows: CustomerRow[] = [];
    let rejected = 0;
    for (const u of users) {
        const r = normalizeProjectGeniusUser(u);
        if (r) rows.push(r); else rejected++;
    }
    const { out } = await upsertProductRows(rows, 'PROJECT_GENIUS');
    return { ...out, rejected, metadata_supported: await hasMetadataColumn() };
}

// ── Orchestration ────────────────────────────────────────────────────────────

/** Sync MoneyWise accounts into Blue Opus's CRM. Project Genius users arrive by push, so there's nothing to pull. */
export async function syncBlueOpusSubscribers() {
    lastSyncAt = Date.now();
    return { moneywise: await syncMoneyWiseCustomers() };
}

/** Lazy, throttled freshness for new signups; never lets a sync failure break the CRM. */
export async function ensureBlueOpusSubscribersFresh() {
    if (Date.now() - lastSyncAt < SYNC_MIN_INTERVAL_MS) return;
    lastSyncAt = Date.now();
    try { await syncMoneyWiseCustomers(); }
    catch (e: any) { console.warn('[BlueOpusCRM] subscriber sync failed:', e?.message); lastSyncAt = 0; }
}

// ── Subscription payments → transaction history & loyalty ────────────────────

export interface SubscriptionPayment {
    id: string;
    customerId: string;
    kind: 'INVOICE' | 'RECEIPT';
    date: string;
    description: string;
    amount: number;
    status: 'PAID' | 'OWING' | 'VOID';
    reference?: string;
    paid: boolean;
}

const PG_SUB_REF = /PG-SUB-\d+-[A-Za-z0-9]+/i;
const refOf = (e: any): string => String(e.external_reference || '').match(PG_SUB_REF)?.[0]
    || String(e.description || '').match(PG_SUB_REF)?.[0] || '';

/**
 * Pure: attribute subscription invoices and Blue Opus PG-SUB- cashbook receipts to product customers.
 *  - MoneyWise: invoices belong to the customer whose external_id is the invoice's organization; a paid invoice and the cashbook
 *    receipt carrying its lenco_reference are ONE payment (the receipt is shown once, as the invoice's settlement).
 *  - Project Genius: a receipt whose PG-SUB reference is listed in a user's `payment_references` (full reference or its trailing
 *    id) belongs to that user. Receipts nobody claims stay unattributed.
 */
export function attributeSubscriptionPayments(
    customers: { id: string; external_source?: string | null; external_id?: string | null; metadata?: any }[],
    invoices: any[],
    receipts: any[],
): SubscriptionPayment[] {
    const mw = new Map<string, string>(); // organization id → customer id
    const pgRefs = new Map<string, string>(); // reference or trailing id → customer id
    for (const c of customers) {
        if (c.external_source === 'MONEYWISE' && c.external_id) mw.set(c.external_id, c.id);
        if (c.external_source === 'PROJECT_GENIUS') {
            for (const r of (c.metadata?.payment_references ?? []) as string[]) {
                pgRefs.set(r.toLowerCase(), c.id);
                const tail = r.split('-').pop();
                if (tail && !/^\d+$/.test(tail) && !pgRefs.has(tail.toLowerCase())) pgRefs.set(tail.toLowerCase(), c.id);
            }
        }
    }

    const byRef = new Map<string, any>();
    for (const e of receipts) { const r = refOf(e); if (r) byRef.set(r.toLowerCase(), e); }
    const claimed = new Set<string>();
    const out: SubscriptionPayment[] = [];

    for (const inv of invoices) {
        const customerId = mw.get(inv.organization_id);
        if (!customerId) continue;
        const ref = inv.lenco_reference ? String(inv.lenco_reference) : '';
        const receipt = ref ? byRef.get(ref.toLowerCase()) : undefined;
        if (receipt) claimed.add(receipt.id);
        const paid = String(inv.status).toLowerCase() === 'paid';
        const status = paid ? 'PAID' : String(inv.status).toLowerCase() === 'void' ? 'VOID' : 'OWING';
        out.push({
            id: inv.id,
            customerId,
            kind: 'INVOICE',
            date: paid ? (inv.paid_at || receipt?.created_at || inv.created_at) : inv.created_at,
            description: `MoneyWise subscription ${inv.invoice_number} (${inv.period_start} → ${inv.period_end})`,
            amount: Number(inv.net_zmw ?? inv.gross_zmw) || 0,
            status,
            reference: ref || inv.invoice_number,
            paid,
        });
    }

    for (const e of receipts) {
        if (claimed.has(e.id)) continue;
        const ref = refOf(e);
        const key = ref ? ref.toLowerCase() : '';
        const customerId = pgRefs.get(key) || pgRefs.get(key.split('-').pop() || '');
        if (!customerId) continue;
        out.push({
            id: e.id,
            customerId,
            kind: 'RECEIPT',
            date: e.created_at || e.date,
            description: e.description || 'Project Genius subscription payment',
            amount: Number(e.debit) || 0,
            status: 'PAID',
            reference: ref,
            paid: true,
        });
    }
    return out;
}

/** Loads Blue Opus's subscription invoices + PG-SUB receipts and attributes them to the given product customers. */
export async function loadSubscriptionPayments(organizationId: string, customers: any[]): Promise<SubscriptionPayment[]> {
    if (!isBlueOpus(organizationId) || !customers.some(c => isProductSource(c.external_source))) return [];
    const [invoices, receipts] = await Promise.all([
        fetchAll((f, t) => supabase.from('subscription_invoices').select('*').order('id').range(f, t)),
        fetchAll((f, t) => supabase.from('cashbook_entries')
            .select('id, description, debit, entry_type, external_reference, created_at, date')
            .eq('organization_id', BLUE_OPUS_ORG_ID).eq('entry_type', 'INFLOW')
            .or('external_reference.like.PG-SUB-%,description.ilike.%PG-SUB-%').order('id').range(f, t)),
    ]);
    return attributeSubscriptionPayments(customers, invoices, receipts);
}

export const subscriptionProductItem = (source?: string | null) =>
    source === 'PROJECT_GENIUS'
        ? { key: 'project-genius-subscription', name: 'Project Genius subscription' }
        : { key: 'moneywise-subscription', name: 'MoneyWise subscription' };

/** Per-product customer counts for the CRM header. */
export async function productSummary() {
    const rows = await fetchAll((f, t) => supabase.from('customers').select('external_source, status')
        .eq('organization_id', BLUE_OPUS_ORG_ID).in('external_source', ['MONEYWISE', 'PROJECT_GENIUS']).order('id').range(f, t));
    return CRM_PRODUCTS.map(p => {
        const mine = rows.filter(r => r.external_source === p.value);
        return { product: p.value, label: p.label, total: mine.length, active: mine.filter(r => r.status === 'ACTIVE').length };
    });
}
