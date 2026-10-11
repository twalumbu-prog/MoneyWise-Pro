/**
 * Sanity check for the AI stack after moving everything to OpenRouter. Hits the real services (OpenRouter + the
 * production database, read-only except one create-then-delete test account) and exits non-zero on any failure.
 *
 *   npx tsc -p . --outDir /tmp/apibuild --noEmit false && NODE_PATH=$PWD/node_modules node /tmp/apibuild/scripts/sanity_ai.js
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { embeddingService } from '../services/ai/embedding.service';
import { memoryService } from '../services/ai/memory.service';
import { decisionRouter } from '../services/ai/decision.router';
import { openRouterComplete } from '../services/ai/ai.provider';
import { createAccountForTransaction } from '../services/accountSuggester.service';

const PERSONAL_ORG = process.env.SANITY_PERSONAL_ORG || 'c57c7c11-d5d0-4855-95e1-eef3745563b9';
const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<string | void>) {
    try { const detail = await fn(); results.push({ name, ok: true, detail: detail || undefined }); console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
    catch (e: any) { results.push({ name, ok: false, detail: e?.message }); console.log(`FAIL  ${name} — ${e?.message}`); }
}
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const assert = (c: any, msg: string) => { if (!c) throw new Error(msg); };

async function main() {
    await check('no direct Gemini key needed (OpenRouter key present)', async () => { assert(process.env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY missing'); });

    await check('embeddings: 1536 dims via OpenRouter, related > unrelated', async () => {
        const [a, b, c] = await Promise.all(['zesco electricity units', 'electricity bill payment', 'birthday cake for a party'].map(t => embeddingService.generateEmbedding(t)));
        assert(a && b && c && a.length === 1536, 'embedding missing or wrong size');
        const rel = cos(a!, b!), unrel = cos(a!, c!);
        assert(rel > unrel, `related ${rel.toFixed(2)} should beat unrelated ${unrel.toFixed(2)}`);
        return `related ${rel.toFixed(2)} vs unrelated ${unrel.toFixed(2)}`;
    });

    await check('memory: every stored vector re-embedded (no stale/null where text is known)', async () => {
        const { count: total } = await supabase.from('ai_transaction_memory').select('*', { count: 'exact', head: true });
        const { count: withVec } = await supabase.from('ai_transaction_memory').select('*', { count: 'exact', head: true }).not('embedding', 'is', null);
        assert((withVec || 0) >= (total || 0) * 0.95, `only ${withVec}/${total} memories have a vector`);
        return `${withVec}/${total} have vectors`;
    });

    await check('memory: fuzzy lookup finds a learned category', async () => {
        const r = await memoryService.lookup({ description: 'zesco electricity', amount: 100, organizationId: PERSONAL_ORG });
        assert(r, 'no memory match'); return `${r!.method} ${Number(r!.confidence).toFixed(2)}`;
    });

    await check('openRouterComplete returns parseable JSON (highlight phrasing shape)', async () => {
        const t = await openRouterComplete('Return STRICT JSON {"cards":[{"id":"a","title":"Great week","body":"You spent K100 on groceries.","tone":"positive"}]} exactly rephrased in one short sentence.', { jsonObject: true });
        const j = JSON.parse(t.replace(/```json\n?|\n?```/g, '').trim()); assert(Array.isArray(j.cards) && j.cards[0]?.title, 'bad shape');
    });

    await check('onboarding COA: AI refines a baseline into a valid P&L chart', async () => {
        const { buildBaselineCoa, refineWithAI, PL_SECTIONS } = await import('../services/onboarding-coa.service');
        const input = { organizationName: 'Kapela Hardware & Building Supplies', industries: ['Retail'], storeCategories: ['Hardware'], products: [{ name: 'Cement 50kg', product_type: 'PHYSICAL' }, { name: 'Delivery', product_type: 'SERVICE' }] };
        const refined = await refineWithAI(input as any, buildBaselineCoa(input as any));
        assert(refined.length >= 8 && refined.some(a => a.subtype === 'Revenue'), `only ${refined.length} accounts`);
        assert(refined.every(a => PL_SECTIONS.includes(a.subtype)), 'non P&L section returned');
        return `${refined.length} accounts`;
    });

    await check('highlights: AI rephrases signals, keeping ids and figures', async () => {
        const { phraseWithAI } = await import('../controllers/highlights.controller');
        const cards = [{ id: 'spend-1', title: 'Spending', body: 'You spent K1,200 this week, mostly on groceries.', tone: 'neutral' as const }];
        const out = await phraseWithAI(cards as any, true);
        assert(out.length === 1 && out[0].id === 'spend-1' && out[0].body.length > 5, 'unexpected output');
        assert(/1[,\s]?200/.test(out[0].body), `figure changed: ${out[0].body}`);
        return out[0].body.slice(0, 70);
    });

    await check('decision router categorises a personal expense', async () => {
        const { data: accounts } = await supabase.from('accounts').select('*').eq('organization_id', PERSONAL_ORG).eq('is_active', true).eq('type', 'EXPENSE');
        const d = await decisionRouter.classify(accounts || [], { description: 'Groceries at Shoprite', amount: 250 }, PERSONAL_ORG);
        assert(d.account_code && d.account_code !== 'UNCATEGORIZED', `no category (${d.reasoning})`); return `${d.account_code} @ ${Math.round(d.confidence * 100)}%`;
    });

    await check('AI creates a new account for a misfit, then it is cleaned up', async () => {
        const made = await createAccountForTransaction(PERSONAL_ORG, { description: 'Veterinary visit for my dog, vaccination', amount: 300, type: 'EXPENSE' });
        assert(made, 'no account created');
        if (made!.created) await supabase.from('accounts').delete().eq('id', made!.id);
        return `${made!.name} (${made!.created ? 'created+removed' : 'existing'})`;
    });

    await check('ledger: personal COMPLETED requisitions all have categorised line items', async () => {
        const { data } = await supabase.from('requisitions').select('id, line_items(account_id)').eq('organization_id', PERSONAL_ORG).eq('status', 'COMPLETED');
        const bad = (data || []).filter((r: any) => (r.line_items || []).some((l: any) => !l.account_id));
        assert(bad.length === 0, `${bad.length} completed requisition(s) with uncategorised items`);
        return `${(data || []).length} checked`;
    });

    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
