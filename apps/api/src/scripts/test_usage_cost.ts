/**
 * Checks the cost ledger end to end against the real database, with rows it creates itself and deletes at the end:
 * attribution to a business, pricing from cost_rates, a payment recorded once per reference, a missing rate flagged and repriced later,
 * and the monthly view adding it up. Run: npx tsx src/scripts/test_usage_cost.ts
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { recordUsage, recordLlm, runForOrg } from '../services/usage.service';

let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${JSON.stringify(extra)}`}`); if (!ok) failed++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const tag = `TEST-${Date.now()}`;
    const model = `test/model-${tag}`;
    const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
    if (!org) throw new Error('No organization to test with.');
    const orgId = org.id as string;

    // A test rate: $2 per million input tokens, $10 per million output tokens; and $0.01 per test message.
    await supabase.from('cost_rates').upsert([
        { key: `ai:${model}`, input_per_million: 2, output_per_million: 10, currency: 'USD', note: 'test' },
        { key: `messaging:${tag}-msg`, per_unit: 0.01, currency: 'USD', note: 'test' },
    ]);
    // The recorder caches rates for a minute: this run is a fresh process, so it reads them now.

    runForOrg(orgId, () => {
        recordLlm({ usage: { prompt_tokens: 1_000_000, completion_tokens: 100_000 } }, { provider: 'OpenRouter', model, kind: 'llm_chat', reference: `${tag}-llm` });
        recordUsage({ category: 'messaging', kind: `${tag}-msg`, provider: 'test', units: 5, unit: 'message' });
        recordUsage({ category: 'payments', kind: `${tag}-payout`, provider: 'lipila', cost: 7.5, currency: 'ZMW', reference: `${tag}-pay` });
        recordUsage({ category: 'payments', kind: `${tag}-payout`, provider: 'lipila', cost: 7.5, currency: 'ZMW', reference: `${tag}-pay` }); // the same payment again
        recordUsage({ category: 'ai', kind: `${tag}-norate`, provider: 'test', model: `${tag}-unpriced`, inputTokens: 500, outputTokens: 50 });
    });
    await wait(2500);

    const { data: rows } = await supabase.from('usage_events').select('*').eq('organization_id', orgId).or(`kind.like.${tag}%,reference.like.${tag}%,model.eq.${model}`);
    const by = (k: string) => (rows ?? []).filter((r: any) => r.kind === k || r.reference === k);
    const llm = (rows ?? []).find((r: any) => r.model === model) as any;
    check('the AI call is attributed to the business', !!llm && llm.organization_id === orgId, llm);
    check('its tokens were recorded', llm?.input_tokens === 1_000_000 && llm?.output_tokens === 100_000, llm);
    check('it was priced from the rate: 1M in at $2 + 0.1M out at $10 = $3', Math.abs(Number(llm?.cost_amount) - 3) < 1e-6, llm?.cost_amount);
    const msg = by(`${tag}-msg`)[0] as any;
    check('a message is priced per unit: 5 x $0.01', Math.abs(Number(msg?.cost_amount) - 0.05) < 1e-6, msg?.cost_amount);
    check('a payment fee recorded twice for the same reference is stored once', by(`${tag}-payout`).length === 1, by(`${tag}-payout`).length);
    check('the payment keeps its real cost and currency', Number((by(`${tag}-payout`)[0] as any)?.cost_amount) === 7.5 && (by(`${tag}-payout`)[0] as any)?.cost_currency === 'ZMW');
    const norate = by(`${tag}-norate`)[0] as any;
    check('an event with no rate is flagged, not given a made-up cost', norate?.rate_missing === true && norate?.cost_amount === null, norate);

    // Set the rate afterwards and reprice.
    await supabase.from('cost_rates').upsert({ key: `ai:${tag}-unpriced`, input_per_million: 1000, output_per_million: 0, currency: 'USD', note: 'test' });
    const { data: repriced } = await supabase.rpc('reprice_usage_events');
    const { data: after } = await supabase.from('usage_events').select('cost_amount, rate_missing').eq('id', norate.id).single();
    check('repricing fills in the cost once a rate exists (500 tokens at $1000/M = $0.5)', Number(after?.cost_amount) === 0.5 && after?.rate_missing === false, { repriced, after });

    const { data: monthly } = await supabase.from('org_cost_monthly').select('*').eq('organization_id', orgId).like('kind', `${tag}%`);
    check('the monthly view groups the test events by kind', (monthly ?? []).length >= 3, monthly);

    // Clean up everything this run made.
    await supabase.from('usage_events').delete().eq('organization_id', orgId).or(`kind.like.${tag}%,reference.like.${tag}%,model.eq.${model}`);
    await supabase.from('cost_rates').delete().or(`key.eq.ai:${model},key.like.%${tag}%`);
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
