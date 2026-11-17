import { apiJson } from '../api/apiFetch';
import { sanitizeGrowPlan, type GrowPlan, type GrowLedgerRow } from '../grow';

/**
 * Grow plans are per person, per organisation (the org comes from the x-organization-id header),
 * stored server-side so a plan follows the person across devices.
 */
export const growService = {
    async get(): Promise<GrowPlan | null> {
        const res = await apiJson<{ plan: unknown }>('/users/me/grow');
        return sanitizeGrowPlan(res?.plan);
    },
    async save(plan: GrowPlan): Promise<GrowPlan | null> {
        const res = await apiJson<{ plan: unknown }>('/users/me/grow', { method: 'PUT', body: JSON.stringify({ plan }) });
        return sanitizeGrowPlan(res?.plan);
    },
    /** Every month's report rows in one request ({ 'YYYY-MM': rows }); the current month runs to today. */
    async actuals(months: string[]): Promise<Record<string, GrowLedgerRow[]>> {
        const res = await apiJson<{ months: Record<string, GrowLedgerRow[]> }>(`/reports/grow-actuals?months=${encodeURIComponent(months.join(','))}`);
        return res?.months ?? {};
    },
    async remove(): Promise<void> {
        await apiJson('/users/me/grow', { method: 'DELETE' });
    },
};
