/**
 * An entry saved offline carries a phone-made id; sending it twice must book it once. REAL service code against the live database, in a
 * throwaway workspace that is deleted afterwards. Run: npx tsx src/scripts/test_manual_entry_idempotency.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { recordManualEntry } from '../services/manualEntry.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = '', other = '';
    try {
        const mk = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST ${n} ${tag}`, slug: `zz-test-${n}-${tag}`, is_personal: true }).select('id').single(); if (error) throw error; return data.id as string; };
        org = await mk('idem'); other = await mk('idem-other');
        const { data: u } = await supabase.from('users').select('id').limit(1).single(); const userId = u!.id;
        const wallet = async (o: string) => { const { data, error } = await supabase.from('external_wallets').insert({ organization_id: o, name: 'Cash', provider_type: 'CUSTOM' }).select('id').single(); if (error) throw error; return data.id as string; };
        const w = await wallet(org), w2 = await wallet(other);
        const base = { orgId: org, userId, direction: 'OUT' as const, amount: 25, description: 'Airtime', date: new Date().toISOString().slice(0, 10), externalWalletId: w, autoCategorize: false };

        const ref = `MOBILE-${tag}abcdef12`;
        const a = await recordManualEntry({ ...base, externalReference: ref });
        const b = await recordManualEntry({ ...base, externalReference: ref });   // the retry
        check('the retry returns the same entry', a.entryId === b.entryId, `${a.entryId} vs ${b.entryId}`);
        const { count } = await supabase.from('cashbook_entries').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('external_reference', ref);
        check('it is booked once', count === 1, `rows: ${count}`);
        const { data: bal } = await supabase.from('cashbook_entries').select('credit').eq('organization_id', org);
        check('the money went out once (K25, not K50)', (bal ?? []).reduce((s: number, r: any) => s + Number(r.credit), 0) === 25);

        const c = await recordManualEntry({ ...base, externalReference: `MOBILE-${tag}zzzzzz99`, description: 'Lunch' });
        check('a different id is a different entry', c.entryId !== a.entryId);

        const d = await recordManualEntry({ ...base, direction: 'IN', amount: 100, description: 'Sold eggs', externalReference: `MOBILE-${tag}inflow001` });
        const e = await recordManualEntry({ ...base, direction: 'IN', amount: 100, description: 'Sold eggs', externalReference: `MOBILE-${tag}inflow001` });
        check('money in is protected too', d.entryId === e.entryId);

        const x = await recordManualEntry({ ...base, orgId: other, externalWalletId: w2, externalReference: ref });
        check('the same id in another workspace is its own entry (no leak across workspaces)', x.entryId !== a.entryId);
    } catch (err: any) {
        console.log('ERROR:', err?.stack ?? err?.message ?? JSON.stringify(err)); failed++;
    } finally {
        for (const o of [org, other].filter(Boolean)) {
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', o);
            const ids = (je ?? []).map((j: any) => j.id);
            if (ids.length) await supabase.from('journal_entries').delete().in('id', ids);
            await supabase.from('cashbook_entries').delete().eq('organization_id', o);
            await supabase.from('external_wallets').delete().eq('organization_id', o);
            await supabase.from('accounts').delete().eq('organization_id', o);
            await supabase.from('organizations').delete().eq('id', o);
        }
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `%${tag}`);
        console.log(`cleanup: ${count ?? 0} test workspaces left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
