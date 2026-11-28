/**
 * The cost ledger: one row in usage_events for every billable thing done for a business (an AI call, a message sent, a payment fee), priced
 * against cost_rates. A separate system pulls from these tables (see the export endpoint) to work out what serving each client costs.
 *
 * Recording never gets in the way: it is fire-and-forget, never throws, and a failure only logs. Which business an event belongs to is taken
 * from the request that caused it (so call sites don't pass it around); background jobs name the business with runForOrg().
 */
import { AsyncLocalStorage } from 'async_hooks';
import { supabase } from '../lib/supabase';

interface Ctx { req?: any; orgId?: string | null; userId?: string | null }
const als = new AsyncLocalStorage<Ctx>();

/** Express middleware: remembers the request for the rest of its life, so the signed-in business can be read when an event is recorded. */
export const usageContext = (req: any, _res: any, next: () => void) => als.run({ req }, () => next());
/** The request that started the work in progress, if any (webhooks, jobs and pollers have none). */
export const currentRequest = (): any => als.getStore()?.req ?? null;
/** Names the business the rest of this piece of work is for (used where the business is known but there is no signed-in request). */
export function attributeTo(orgId: string | null | undefined): void {
    const c = als.getStore();
    if (c) c.orgId = orgId ?? null; else als.enterWith({ orgId: orgId ?? null });
}
/** For work with no request (a scheduled job, a webhook): everything inside is attributed to this business. */
export const runForOrg = <T>(orgId: string | null | undefined, fn: () => T): T => als.run({ orgId: orgId ?? null }, fn);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function current(): { orgId: string | null; userId: string | null } {
    const c = als.getStore();
    const orgId = c?.orgId ?? c?.req?.user?.organization_id ?? null;
    const uid = c?.userId ?? c?.req?.user?.id ?? null;
    return { orgId: orgId && UUID.test(String(orgId)) ? String(orgId) : null, userId: uid && UUID.test(String(uid)) ? String(uid) : null };
}

export interface UsageInput {
    category: 'ai' | 'messaging' | 'payments';
    kind: string;
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    units?: number;
    unit?: string;
    /** The real cost when it is known (a payment fee, or a cost the provider reported). Otherwise it is worked out from cost_rates. */
    cost?: number | null;
    currency?: string;
    /** What it was for. A payment is recorded once per kind and reference, however many times it is finalized. */
    reference?: string;
    organizationId?: string | null;
    meta?: Record<string, unknown>;
}

interface Rate { input_per_million: number | null; output_per_million: number | null; per_unit: number | null; currency: string }
let rateCache: { at: number; rows: Map<string, Rate> } | null = null;
async function rates(): Promise<Map<string, Rate>> {
    if (rateCache && Date.now() - rateCache.at < 60_000) return rateCache.rows;
    const { data } = await supabase.from('cost_rates').select('key, input_per_million, output_per_million, per_unit, currency');
    rateCache = { at: Date.now(), rows: new Map((data ?? []).map((r: any) => [r.key, { input_per_million: r.input_per_million, output_per_million: r.output_per_million, per_unit: r.per_unit, currency: r.currency }])) };
    return rateCache.rows;
}

/** The rate for an event: the most specific key first (ai:<model>), then the provider (ai:<provider>), then the kind (messaging:<kind>). */
function rateKeys(e: UsageInput): string[] {
    const keys: string[] = [];
    if (e.model) keys.push(`${e.category}:${e.model}`);
    if (e.provider) keys.push(`${e.category}:${e.provider}`);
    keys.push(`${e.category}:${e.kind}`);
    return keys;
}

/** Records one event. Returns at once; the row is written in the background. */
export function recordUsage(e: UsageInput): void {
    const who = current();
    void (async () => {
        try {
            let cost: number | null = typeof e.cost === 'number' && Number.isFinite(e.cost) ? e.cost : null;
            let currency = e.currency ?? 'USD';
            let rateMissing = false;
            if (cost === null) {
                const table = await rates();
                const rate = rateKeys(e).map((k) => table.get(k)).find(Boolean);
                if (rate) {
                    currency = rate.currency;
                    const byTokens = ((e.inputTokens ?? 0) * Number(rate.input_per_million ?? 0) + (e.outputTokens ?? 0) * Number(rate.output_per_million ?? 0)) / 1_000_000;
                    const byUnit = (e.units ?? 1) * Number(rate.per_unit ?? 0);
                    cost = Math.round((byTokens + byUnit) * 1e6) / 1e6;
                } else {
                    rateMissing = true;
                }
            }
            const row = {
                organization_id: e.organizationId !== undefined ? e.organizationId : who.orgId, user_id: who.userId, category: e.category, kind: e.kind,
                provider: e.provider ?? null, model: e.model ?? null, input_tokens: e.inputTokens ?? null, output_tokens: e.outputTokens ?? null,
                units: e.units ?? null, unit: e.unit ?? null, cost_amount: cost, cost_currency: currency, rate_missing: rateMissing, reference: e.reference ?? null, meta: e.meta ?? {},
            };
            const { error } = e.reference
                ? await supabase.from('usage_events').upsert(row, { onConflict: 'kind,reference', ignoreDuplicates: true })
                : await supabase.from('usage_events').insert(row);
            // A repeat of the same payment (same kind and reference) is expected and not an error. Anything else is logged.
            if (error && !/duplicate key value/i.test(error.message)) console.warn('[Usage] could not record', e.kind, error.message);
        } catch (err: any) {
            console.warn('[Usage] could not record', e.kind, err?.message ?? err);
        }
    })();
}

/**
 * Records an LLM call from the JSON the provider answered with. Reads the token counts in whichever shape the provider uses
 * (OpenAI-style usage.prompt_tokens, Gemini's usageMetadata, Perplexity's usage.input_tokens) and the provider's own cost when it sends one.
 */
export function recordLlm(json: any, o: { provider: string; model: string; kind: string; reference?: string; meta?: Record<string, unknown> }): void {
    try {
        const u = json?.usage;
        const g = json?.usageMetadata;
        const inputTokens = Number(u?.prompt_tokens ?? u?.input_tokens ?? g?.promptTokenCount ?? 0) || undefined;
        const outputTokens = Number(u?.completion_tokens ?? u?.output_tokens ?? g?.candidatesTokenCount ?? 0) || undefined;
        const reported = typeof u?.cost === 'number' ? u.cost : null; // OpenRouter reports the cost in USD when asked to
        recordUsage({ category: 'ai', kind: o.kind, provider: o.provider, model: o.model, inputTokens, outputTokens, cost: reported, reference: o.reference, meta: o.meta });
    } catch { /* never in the way */ }
}
