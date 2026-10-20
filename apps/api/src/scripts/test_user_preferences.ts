/** Preferences + notification-channel gating test. Temporarily edits one real user's preferences and restores them. */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { getPreferences, updatePreferences, filterUserIdsForPush, filterEmailsForOrg, normalizePreferences } from '../services/userPreferences.service';
import { pinRecoveryService } from '../services/pinRecovery.service';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}

async function main() {
    const STEPHEN = '215d63dc-8f4a-4993-a6a5-100ad44b4c1d';
    const PERSONAL_ORG = 'c57c7c11-d5d0-4855-95e1-eef3745563b9';   // "Stephen's Workspace"
    const { data: biz } = await supabase.from('organizations').select('id, name').not('name', 'ilike', '%workspace%').limit(1).single();
    const { data: me } = await supabase.from('users').select('email, preferences').eq('id', STEPHEN).single();
    const original = (me as any).preferences ?? {};
    const email = String((me as any).email);
    try {
        await step('defaults when nothing is saved', async () => {
            await supabase.from('users').update({ preferences: {} }).eq('id', STEPHEN);
            const p = await getPreferences(STEPHEN);
            must(p.notifications.channel === 'BOTH' && p.payroll.destination === 'BANK' && p.ai.assistant_model === null, 'bad defaults');
        });
        await step('junk values are dropped when read', async () => {
            const p = normalizePreferences({ notifications: { channel: 'SMS' }, ai: { assistant_model: 'evil/model' }, payroll: { destination: 'CRYPTO' } });
            must(p.notifications.channel === 'BOTH' && p.ai.assistant_model === null && p.payroll.destination === 'BANK', 'junk accepted');
        });
        await step('invalid channel / model are rejected on save', async () => {
            let n = 0;
            for (const patch of [{ notifications: { channel: 'SMS' } }, { ai: { assistant_model: 'evil/model' } }, { ai: { categorization_model: 'evil/model' } }, { payroll: { destination: 'CRYPTO' } }]) {
                try { await updatePreferences(STEPHEN, patch); } catch { n++; }
            }
            must(n === 4, `only ${n}/4 rejected`);
        });
        await step('valid choices are saved, merged and persisted', async () => {
            await updatePreferences(STEPHEN, { notifications: { channel: 'EMAIL' } });
            await updatePreferences(STEPHEN, { ai: { assistant_model: 'anthropic/claude-sonnet-4-5' } });
            const p = await getPreferences(STEPHEN);
            must(p.notifications.channel === 'EMAIL' && p.ai.assistant_model === 'anthropic/claude-sonnet-4-5', 'not persisted/merged');
        });
        await step('email-only: no push for personal-workspace events, push still sent for business events', async () => {
            must((await filterUserIdsForPush([STEPHEN], PERSONAL_ORG)).length === 0, 'push not suppressed');
            must((await filterUserIdsForPush([STEPHEN], (biz as any).id)).length === 1, 'business push wrongly suppressed');
            must((await filterUserIdsForPush([STEPHEN], null)).length === 1, 'unknown-org push wrongly suppressed');
            must((await filterEmailsForOrg([email], PERSONAL_ORG)).length === 1, 'email wrongly suppressed');
        });
        await step('app-only: no email for personal-workspace events, business email untouched', async () => {
            await updatePreferences(STEPHEN, { notifications: { channel: 'APP' } });
            must((await filterEmailsForOrg([email], PERSONAL_ORG)).length === 0, 'email not suppressed');
            must((await filterEmailsForOrg([email], (biz as any).id)).length === 1, 'business email wrongly suppressed');
            must((await filterUserIdsForPush([STEPHEN], PERSONAL_ORG)).length === 1, 'push wrongly suppressed');
        });
        await step('both: nothing is suppressed', async () => {
            await updatePreferences(STEPHEN, { notifications: { channel: 'BOTH' } });
            must((await filterEmailsForOrg([email], PERSONAL_ORG)).length === 1 && (await filterUserIdsForPush([STEPHEN], PERSONAL_ORG)).length === 1, 'suppressed');
        });
        await step('PIN recovery: wrong / expired codes are refused', async () => {
            let refused = 0;
            for (const code of ['000000', '', 'abcdef']) { try { await pinRecoveryService.verifyCode(STEPHEN, code); } catch { refused++; } }
            must(refused === 3, `${refused}/3 refused`);
        });
    } finally {
        await supabase.from('users').update({ preferences: original }).eq('id', STEPHEN);
        await supabase.from('app_settings').delete().eq('key', `pinrec:${STEPHEN}`);
    }
    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
