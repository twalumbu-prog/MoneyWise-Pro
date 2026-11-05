import { supabase } from '../../lib/supabase';
import { getEntitlements } from '../entitlements.service';
import { capturePlanEligible, CAPTURE_CHANNELS, type ChannelRule } from './capture.logic';

export interface CaptureSettings { enabled: boolean; autoPostEnabled: boolean; autoPostLimit: number; dailyAiBudget: number; repliesEnabled: boolean; channels: Record<string, ChannelRule> }

const DEFAULTS: CaptureSettings = { enabled: false, autoPostEnabled: false, autoPostLimit: 2000, dailyAiBudget: 500, repliesEnabled: false, channels: {} };

/** Premium and active. A failed lookup means not eligible. */
export async function isCapturePlanEligible(orgId: string): Promise<boolean> {
    if (!orgId) return false;
    try { return capturePlanEligible(await getEntitlements(orgId)); }
    catch { return false; }
}

/**
 * `enabled` is the effective state: the org's own switch AND an eligible plan, so every path that checks it (upload,
 * worker, MoMo mirror, re-matching, auto-post) stops when a plan lapses and resumes on renewal. No row, or the lookup
 * failing, means OFF: the kill switch fails closed. The plan is only looked up for orgs that switched capture on.
 */
export async function getCaptureSettings(orgId: string): Promise<CaptureSettings> {
    if (!orgId) return DEFAULTS;
    const { data, error } = await supabase.from('capture_settings').select('*').eq('organization_id', orgId).maybeSingle();
    if (error || !data) return DEFAULTS;
    return {
        enabled: !!data.enabled && await isCapturePlanEligible(orgId),
        autoPostEnabled: !!data.auto_post_enabled,
        autoPostLimit: Number(data.auto_post_limit ?? 2000),
        dailyAiBudget: Number(data.daily_ai_budget ?? 500),
        repliesEnabled: !!data.replies_enabled,
        channels: data.channels ?? {},
    };
}

export async function updateCaptureSettings(orgId: string, userId: string, patch: Record<string, unknown>): Promise<CaptureSettings> {
    const row: Record<string, any> = { organization_id: orgId, updated_by: userId, updated_at: new Date().toISOString() };
    if (typeof patch.enabled === 'boolean') row.enabled = patch.enabled;
    if (typeof patch.autoPostEnabled === 'boolean') row.auto_post_enabled = patch.autoPostEnabled;
    if (typeof patch.repliesEnabled === 'boolean') row.replies_enabled = patch.repliesEnabled;
    if (patch.channels && typeof patch.channels === 'object') {
        const channels: Record<string, ChannelRule> = {};
        for (const name of CAPTURE_CHANNELS) {
            const r = (patch.channels as any)[name];
            if (!r || typeof r !== 'object') continue;
            const channelLimit = Number(r.autoPostLimit);
            channels[name] = {
                ...(typeof r.capture === 'boolean' ? { capture: r.capture } : {}),
                ...(typeof r.autoPost === 'boolean' ? { autoPost: r.autoPost } : {}),
                ...(r.autoPostLimit != null && Number.isFinite(channelLimit) && channelLimit >= 0 ? { autoPostLimit: channelLimit } : {}),
            };
        }
        row.channels = channels;
    }
    const limit = Number(patch.autoPostLimit);
    if (patch.autoPostLimit !== undefined && Number.isFinite(limit) && limit >= 0 && limit <= 1_000_000) row.auto_post_limit = Math.round(limit * 100) / 100;
    const { error } = await supabase.from('capture_settings').upsert(row, { onConflict: 'organization_id' });
    if (error) throw new Error(`Could not save capture settings: ${error.message}`);
    await supabase.from('audit_logs').insert({ entity_type: 'CAPTURE_SETTINGS', entity_id: orgId, action: 'CAPTURE_SETTINGS_UPDATED', user_id: userId, changes: row })
        .then(() => undefined, () => undefined);
    return getCaptureSettings(orgId);
}
