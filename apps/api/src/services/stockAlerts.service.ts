/**
 * Tells the owner an item has just run low or out. It only speaks when the count CROSSES the line (from above the threshold to at or below
 * it, or from some to none), so one low item doesn't repeat on every use. With options (colours, sizes) each option is judged on its own count.
 * Called wherever stock goes down. Never throws.
 */
import { pushService } from './push.service';

const variantsOf = (p: any): any[] => (Array.isArray(p?.variants) ? p.variants : []);

export async function alertIfLow(orgId: string, p: any, variantId: string | null | undefined, before: number, after: number): Promise<void> {
    try {
        const threshold = Math.max(0, Number(p?.low_stock_threshold ?? 5) || 0);
        const out = before > 0 && after <= 0;
        const low = before > threshold && after > 0 && after <= threshold;
        if (!out && !low) return;
        const v = variantId ? variantsOf(p).find((x) => x.id === variantId) : null;
        const label = v ? `${p.name} (${v.name})` : p.name;
        await pushService.sendToRoles(orgId, ['ADMIN', 'MANAGER'], {
            title: out ? `Out of stock: ${label}` : `Running low: ${label}`,
            body: out ? `${label} has run out. Time to restock.` : `Only ${after} of ${label} left (alert level ${threshold}).`,
            data: { type: 'LOW_STOCK', productId: p.id, variantId: variantId ?? null },
            orgId,
        });
    } catch (e) { console.error('[Stock] low-stock alert failed:', (e as Error).message); }
}
