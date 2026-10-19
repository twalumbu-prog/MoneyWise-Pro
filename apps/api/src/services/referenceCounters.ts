/**
 * Reference counters — keeps `reference_counters` (the source of CR-/RT-/ADJ- numbers) from ever being behind the
 * numbers already issued.
 *
 * Why this exists: after the 2026-09-18 cutover the counters were copied before the final ledger rows, so for Kids
 * Paradise the counter said 480 while CR-2026-0491 was already in use. Every new inflow was handed 481.., rejected by
 * `cashbook_entries_org_reference_unique`, and the sync merely logged the error — a customer payment stayed unbooked
 * for 13 days. The fix is two-layered: createEntry repairs-and-retries on a collision (immediate), and the Ledger
 * Guardian realigns any counter it finds behind (sweeping).
 */
import { supabase } from '../lib/supabase';

/** entity type → the reference prefixes it issues (INFLOW also issues REC- for sales; they share one counter). */
const PREFIXES: Record<string, string[]> = { INFLOW: ['CR', 'REC'], RETURN: ['RT'], ADJUSTMENT: ['ADJ'] };

export const isReferenceCollision = (err: any): boolean =>
    /cashbook_entries_org_reference_unique|duplicate key[^"]*"[^"]*reference/i.test(String(err?.message ?? err ?? ''));

/** Highest number already issued for an entity type in a year (paged — an org can hold far more than 1,000 rows). */
export async function maxIssuedNumber(orgId: string, entityType: string, year: number): Promise<number> {
    let max = 0;
    for (const prefix of PREFIXES[entityType] ?? []) {
        for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from('cashbook_entries').select('reference_number')
                .eq('organization_id', orgId).like('reference_number', `${prefix}-${year}-%`).range(from, from + 999);
            if (error) throw new Error(`maxIssuedNumber: ${error.message}`);
            for (const r of data ?? []) {
                const m = /-(\d+)$/.exec(String((r as any).reference_number ?? ''));
                if (m) max = Math.max(max, parseInt(m[1], 10));
            }
            if (!data || data.length < 1000) break;
        }
    }
    return max;
}

/** Sets the counter to at least `atLeast` (never lowers it). Returns the resulting value. */
export async function raiseReferenceCounter(orgId: string, entityType: string, year: number, atLeast: number): Promise<number> {
    const { data: cur } = await supabase.from('reference_counters').select('last_value')
        .eq('organization_id', orgId).eq('entity_type', entityType).eq('year', year).maybeSingle();
    const current = cur ? Number((cur as any).last_value) : null;
    if (current !== null && current >= atLeast) return current;
    if (current === null) {
        const { error } = await supabase.from('reference_counters').insert({ organization_id: orgId, entity_type: entityType, year, last_value: atLeast });
        if (error) throw new Error(`raiseReferenceCounter(insert): ${error.message}`);
    } else {
        const { error } = await supabase.from('reference_counters').update({ last_value: atLeast })
            .eq('organization_id', orgId).eq('entity_type', entityType).eq('year', year).lt('last_value', atLeast);
        if (error) throw new Error(`raiseReferenceCounter(update): ${error.message}`);
    }
    return atLeast;
}

/** Realigns one counter with what the ledger has actually issued. Returns the new value, or null when nothing was behind. */
export async function alignReferenceCounter(orgId: string, entityType: string, year = new Date().getUTCFullYear()): Promise<number | null> {
    const used = await maxIssuedNumber(orgId, entityType, year);
    const { data: cur } = await supabase.from('reference_counters').select('last_value')
        .eq('organization_id', orgId).eq('entity_type', entityType).eq('year', year).maybeSingle();
    const current = cur ? Number((cur as any).last_value) : 0;
    if (current >= used) return null;
    await raiseReferenceCounter(orgId, entityType, year, used);
    console.warn(`[RefCounter] ${orgId.slice(0, 8)} ${entityType} ${year}: counter ${current} was behind issued ${used} — realigned.`);
    return used;
}
