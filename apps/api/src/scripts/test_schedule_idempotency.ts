/** A bill saved offline has an id from the phone; sending it twice must add it once. Live database, throwaway workspace. Run: npx tsx src/scripts/test_schedule_idempotency.ts */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { createScheduledItem } from '../controllers/schedule.controller';

let failed = 0;
const check = (n: string, ok: boolean, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ` — ${x}` : ''}`); if (!ok) failed++; };
const call = async (orgId: string, userId: string, body: any) => {
    let status = 0, json: any;
    const res: any = { status(c: number) { status = c; return res; }, json(b: any) { json = b; return res; } };
    await createScheduledItem({ user: { organization_id: orgId, id: userId }, body } as any, res);
    return { status, json };
};
(async () => {
    const tag = randomUUID().slice(0, 6); let org = '', other = '';
    try {
        const mk = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST ${n} ${tag}`, slug: `zz-test-${n}-${tag}`, is_personal: true }).select('id').single(); if (error) throw error; return data.id as string; };
        org = await mk('sched'); other = await mk('sched-other');
        const { data: u } = await supabase.from('users').select('id').limit(1).single(); const uid = u!.id;
        const id = randomUUID();
        const body = { id, title: 'Rent', amount: 500, category: 'GENERAL_EXPENSES', cadence: 'MONTHLY', next_due_date: '2026-12-30' };
        const a = await call(org, uid, body); const b = await call(org, uid, body);
        check('first send creates it', a.status === 201 && a.json.id === id, JSON.stringify([a.status, a.json?.error]));
        check('the retry returns the same bill', b.json?.id === id, String(b.status));
        const { count } = await supabase.from('scheduled_items').select('id', { count: 'exact', head: true }).eq('organization_id', org);
        check('one bill exists', count === 1, `rows: ${count}`);
        const { count: runs } = await supabase.from('scheduled_item_runs').select('id', { count: 'exact', head: true }).eq('scheduled_item_id', id);
        check('one upcoming run, not two', runs === 1, `runs: ${runs}`);
        const c = await call(org, uid, { ...body, id: randomUUID() });
        check('a different id is a different bill', c.json?.id !== id && c.status === 201);
        const d = await call(other, uid, body);
        check('another workspace cannot take or see it', d.status !== 200 || d.json?.organization_id !== org, JSON.stringify([d.status, d.json?.error]));
        const bad = await call(org, uid, { ...body, id: 'not-a-uuid', title: 'X' });
        check('a malformed id is ignored (normal create)', bad.status === 201 && bad.json?.id !== 'not-a-uuid');
    } catch (e: any) { console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++; }
    finally {
        for (const o of [org, other].filter(Boolean)) {
            await supabase.from('scheduled_item_runs').delete().eq('organization_id', o);
            await supabase.from('scheduled_items').delete().eq('organization_id', o);
            await supabase.from('organizations').delete().eq('id', o);
        }
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `%${tag}`);
        console.log(`cleanup: ${count ?? 0} test workspaces left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
})();
