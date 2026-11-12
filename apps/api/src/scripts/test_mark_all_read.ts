/**
 * Inbox "Mark all read": who gets what cleared. Uses throwaway businesses and requests, removed at the end.
 * Run: npx tsx src/scripts/test_mark_all_read.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { markAllRequisitionsRead } from '../controllers/requisition.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const call = async (user: any) => {
    let status = 200; let json: any = null;
    const res: any = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; } };
    await markAllRequisitionsRead({ user }, res);
    return { status, json };
};

(async () => {
    const tag = randomUUID().slice(0, 6);
    const orgs: string[] = [];
    try {
        const { data: users } = await supabase.from('users').select('id').limit(2);
        if (!users || users.length < 2) throw new Error('need two existing users');
        const [me, other] = [users[0].id, users[1].id];
        const mk = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST markread ${n} ${tag}`, slug: `zz-test-markread-${n}-${tag}` }).select('id').single(); if (error) throw error; orgs.push(data!.id); return data!.id as string; };
        const A = await mk('a'); const B = await mk('b');
        const add = async (org: string, requestor: string, unread: boolean) => {
            const { data, error } = await supabase.from('requisitions').insert({ organization_id: org, requestor_id: requestor, description: `ZZ ${tag}`, estimated_total: 1, status: 'DRAFT', type: 'EXPENSE', has_unread_updates: unread }).select('id').single();
            if (error) throw error; return data!.id as string;
        };
        const unreadOf = async (org: string) => (await supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('has_unread_updates', true)).count ?? 0;

        await add(A, me, true); await add(A, me, true); await add(A, other, true); await add(A, me, false); await add(B, me, true);

        const r1 = await call({ id: me, organization_id: A, role: 'REQUESTOR' });
        check('a requestor clears only their own flagged requests', r1.json?.updated === 2 && (await unreadOf(A)) === 1, JSON.stringify(r1.json));
        check('another business is untouched', (await unreadOf(B)) === 1);
        const r2 = await call({ id: me, organization_id: A, role: 'REQUESTOR' });
        check('doing it again finds nothing left', r2.json?.updated === 0);

        const r3 = await call({ id: me, organization_id: A, role: 'ADMIN' });
        check('a finance or admin role clears the rest of the organization', r3.json?.updated === 1 && (await unreadOf(A)) === 0, JSON.stringify(r3.json));
        check('and still never another business', (await unreadOf(B)) === 1);

        const none = await call({ id: me, organization_id: null, role: 'ADMIN' });
        check('no organization on the sign-in is refused', none.status === 400);
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        for (const o of orgs) {
            await supabase.from('line_items').delete().in('requisition_id', ((await supabase.from('requisitions').select('id').eq('organization_id', o)).data ?? []).map((r: any) => r.id));
            await supabase.from('requisitions').delete().eq('organization_id', o);
            await supabase.from('organizations').delete().eq('id', o);
        }
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST markread % ${tag}`);
        console.log(`cleanup: ${count ?? 0} test businesses left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
