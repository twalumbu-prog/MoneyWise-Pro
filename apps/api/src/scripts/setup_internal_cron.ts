// Stores the internal scheduler's config in app_settings (service role). Run BEFORE applying
// migration 20261026120000_internal_cron_scheduler.sql.
//   npx ts-node src/scripts/setup_internal_cron.ts https://<api host>        (secret comes from LENCO_SYNC_SECRET in .env; never printed)
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    const url = process.argv[2];
    const secret = process.env.LENCO_SYNC_SECRET;
    if (!url || !/^https:\/\//.test(url)) throw new Error('Usage: setup_internal_cron.ts https://<api base url>');
    if (!secret) throw new Error('LENCO_SYNC_SECRET is not set in apps/api/.env');
    const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const now = new Date().toISOString();
    const { error } = await s.from('app_settings').upsert([
        { key: 'cron_api_url', value: url.replace(/\/$/, ''), description: 'Base URL the internal scheduler (pg_cron) calls', updated_at: now },
        { key: 'cron_secret', value: secret, description: 'Shared secret the internal scheduler sends (same as API LENCO_SYNC_SECRET)', updated_at: now },
    ], { onConflict: 'key' });
    if (error) throw error;
    console.log(`app_settings.cron_api_url = ${url}; cron_secret stored (${secret.length} chars) on ${process.env.SUPABASE_URL}`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
