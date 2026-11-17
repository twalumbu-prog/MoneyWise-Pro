import { apiJson } from '../api/apiFetch';
import { sanitizeGrowPlan, type GrowPlan } from '../grow';

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
    async remove(): Promise<void> {
        await apiJson('/users/me/grow', { method: 'DELETE' });
    },
};
