/**
 * Which businesses can see and use Lipila card payments. Nothing is charged until a business saves its own key and turns cards on.
 *   npx tsx src/scripts/lipila_rollout.ts                  show the current list
 *   npx tsx src/scripts/lipila_rollout.ts add <org-id>     add a business
 *   npx tsx src/scripts/lipila_rollout.ts remove <org-id>  take a business out
 */
import { supabase } from '../lib/supabase';

(async () => {
    const [cmd, orgId] = [process.argv[2], process.argv[3]];
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'lipila_rollout').maybeSingle();
    const orgs: string[] = Array.isArray(data?.value?.orgs) ? data!.value.orgs.map(String) : [];
    if (cmd === 'add' || cmd === 'remove') {
        if (!orgId) { console.log('give an organization id'); process.exit(1); }
        const { data: org } = await supabase.from('organizations').select('id, name').eq('id', orgId).maybeSingle();
        if (!org) { console.log('no such organization'); process.exit(1); }
        const next = cmd === 'add' ? [...new Set([...orgs, orgId])] : orgs.filter((o) => o !== orgId);
        const { error } = await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: next }, description: 'Businesses that can use Lipila card payments', updated_at: new Date().toISOString() });
        if (error) { console.log('failed:', error.message); process.exit(1); }
        console.log(`${cmd === 'add' ? 'added' : 'removed'}: ${org.name} (${org.id})`);
        orgs.splice(0, orgs.length, ...next);
    }
    const { data: names } = orgs.length ? await supabase.from('organizations').select('id, name').in('id', orgs) : { data: [] as any[] };
    console.log(`in the rollout (${orgs.length}):`, (names ?? []).map((o: any) => `${o.name} (${o.id})`).join('; ') || 'none');
    process.exit(0);
})();
