/**
 * test-classify.ts
 *
 * Runs a sample expense through the REAL MoneyWise classification stack:
 *   Tier 1 → Rule Engine
 *   Tier 2 → Org Memory
 *   Tier 3 → Model ensemble (callAllCategorizationProviders)
 *              ↳ configured primary (now OpenRouter/Llama)
 *              ↳ Gemini backup (skipped if credits depleted)
 *
 * Plus an isolated per-provider test so we can see each model's raw answer.
 *
 * Run from apps/api/:
 *   npx ts-node --transpile-only test-classify.ts
 */

import 'dotenv/config';
import { aiService, ClassifyItem } from './src/services/ai/ai.service';
import { decisionRouter } from './src/services/ai/decision.router';
import { ruleEngine } from './src/services/ai/rule.engine';
import { getAIModelSettings } from './src/services/ai/ai.settings.service';
import {
    CATEGORIZATION_SYSTEM_PROMPT,
    buildCategorizationPrompt,
} from './src/services/ai/prompts';

// ── Sample chart of accounts (mirrors real Zambian SME COA) ─────────────────

const ACCOUNTS = [
    { id: 'acc-5010', code: '5010', name: 'Communication Expenses',       description: 'Phone, internet, airtime, data bundles' },
    { id: 'acc-5020', code: '5020', name: 'Travel & Transport',           description: 'Fuel, taxi, road tolls, flights' },
    { id: 'acc-5030', code: '5030', name: 'Staff Salaries & Wages',       description: 'Employee payroll' },
    { id: 'acc-5040', code: '5040', name: 'Office Supplies & Stationery', description: 'Pens, paper, printing, toner' },
    { id: 'acc-5050', code: '5050', name: 'Repairs & Maintenance',        description: 'Equipment servicing, building repairs' },
    { id: 'acc-5060', code: '5060', name: 'Advertising & Marketing',      description: 'Social media, print, radio adverts' },
    { id: 'acc-5070', code: '5070', name: 'Professional Fees',            description: 'Audit, legal, consulting' },
    { id: 'acc-5080', code: '5080', name: 'Bank Charges & Fees',          description: 'ZNBS, Stanbic, Absa bank fees' },
    { id: 'acc-5090', code: '5090', name: 'Electricity & Utilities',      description: 'ZESCO, water, refuse' },
    { id: 'acc-5100', code: '5100', name: 'Rent Expense',                 description: 'Office, warehouse, plot rent' },
    { id: 'acc-5110', code: '5110', name: 'Meals & Entertainment',        description: 'Staff lunches, client entertainment' },
    { id: 'acc-5120', code: '5120', name: 'IT & Software Subscriptions',  description: 'Cloud tools, SaaS, antivirus' },
    { id: 'acc-5130', code: '5130', name: 'Office Equipment',             description: 'Laptops, printers, projectors' },
    { id: 'acc-5140', code: '5140', name: 'ZRA Levies & Taxes',           description: 'WHT, VAT payments to ZRA' },
    { id: 'acc-5150', code: '5150', name: 'Miscellaneous Expenses',       description: 'Sundry items not fitting other categories' },
];

// ── Test expense ─────────────────────────────────────────────────────────────

const EXPENSE: ClassifyItem = {
    description: 'Airtel Zambia airtime topup K350 for business mobile data — field team communication',
    amount: 350,
    organizationId: undefined, // no org — skips memory tier so we hit the model
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const HR  = '─'.repeat(88);
const HR2 = '═'.repeat(88);

function bar(conf: number): string {
    const pct = Math.round(conf * 100);
    const filled = Math.round(pct / 5);
    return '█'.repeat(filled) + '░'.repeat(20 - filled) + ` ${pct}%`;
}

function codeLabel(code: string | null): string {
    if (!code || code === 'UNCATEGORIZED') return '⚠️  UNCATEGORIZED';
    const acc = ACCOUNTS.find(a => a.code === code);
    return acc ? `[${code}] ${acc.name}` : `[${code}] (unknown code)`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log('\n' + HR2);
    console.log('  MoneyWise Pro — Real Classification Stack Test');
    console.log(HR2);

    // Show active settings from DB
    const settings = await getAIModelSettings();
    console.log('\n  ACTIVE AI MODEL SETTINGS (from ai_model_settings table)');
    console.log(`  Categorization : ${settings.categorization_provider} / ${settings.categorization_model}`);
    console.log(`  Auto-complete  : ${settings.autocomplete_provider} / ${settings.autocomplete_model}`);
    console.log(`  OCR            : ${settings.ocr_provider} / ${settings.ocr_model}`);
    console.log(`  Perplexity mode: ${settings.perplexity_mode}`);

    console.log('\n' + HR);
    console.log('  TEST INPUT');
    console.log(`  Description : ${EXPENSE.description}`);
    console.log(`  Amount      : K${EXPENSE.amount}`);
    console.log(`  Org context : none (memory tier will be skipped — forces AI tier)`);
    console.log(HR);

    // ── PART 1: Full decision router (exact path a real requisition takes) ──

    console.log('\n  PART 1 — FULL DECISION ROUTER  (Rules → Memory → AI ensemble)\n');

    await ruleEngine.loadRules();

    const start = Date.now();
    let routerResult: any;
    try {
        // decisionRouter.classify mirrors what triggerAIReview calls per line item
        routerResult = await decisionRouter.classify(ACCOUNTS, EXPENSE);
        const ms = Date.now() - start;

        console.log(`  ✅ Result from decisionRouter.classify()  (${ms}ms)`);
        console.log(`  Account    : ${codeLabel(routerResult.account_code)}`);
        console.log(`  Confidence : ${bar(routerResult.confidence)}`);
        console.log(`  Method     : ${routerResult.method}`);
        console.log(`  Reasoning  : ${routerResult.reasoning}`);
    } catch (err: any) {
        console.log(`  ❌ Router error: ${err.message}`);
    }

    // ── PART 2: Per-provider breakdown (same prompt, each model in isolation) ──

    console.log('\n' + HR);
    console.log('\n  PART 2 — PER-PROVIDER BREAKDOWN  (same prompt sent to each model)\n');

    const userPrompt = buildCategorizationPrompt(ACCOUNTS, EXPENSE.description, EXPENSE.amount, undefined, []);
    const messages: { role: 'system' | 'user'; content: string }[] = [
        { role: 'system', content: CATEGORIZATION_SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
    ];

    // Import the raw provider caller so we can call each model individually
    const { callAllCategorizationProviders } = await import('./src/services/ai/ai.provider');

    // Run with current settings (Llama primary + Gemini backup if credits available)
    const t0 = Date.now();
    const responses = await callAllCategorizationProviders(messages);
    const totalMs = Date.now() - t0;

    // Also test Perplexity Gateway directly
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (perplexityKey) {
        try {
            const pStart = Date.now();
            const pResp = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${perplexityKey}`,
                },
                body: JSON.stringify({
                    model: 'sonar-pro',
                    messages: [
                        { role: 'system', content: CATEGORIZATION_SYSTEM_PROMPT },
                        { role: 'user',   content: userPrompt },
                    ],
                    temperature: 0,
                    max_tokens: 400,
                }),
                signal: AbortSignal.timeout(30_000) as any,
            });
            const pMs = Date.now() - pStart;
            if (pResp.ok) {
                const pData = await pResp.json();
                const raw = pData.choices?.[0]?.message?.content ?? '';
                const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
                const jsonMatch = clean.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    responses.push({ text: raw, provider: 'Perplexity sonar-pro', model: 'sonar-pro' });
                    // Print inline since we have the parsed data
                    console.log(`🟢  Perplexity sonar-pro  (${pMs}ms)`);
                    console.log(`   ✅  Account  : ${codeLabel(parsed.account_code)}`);
                    console.log(`   📊  Confidence: ${bar(parsed.confidence ?? 0)}`);
                    console.log(`   💬  Reasoning : ${parsed.reasoning}`);
                    console.log();
                }
            } else {
                console.log(`🟢  Perplexity sonar-pro  (${pMs}ms)`);
                console.log(`   ❌  ${pResp.status}: ${await pResp.text()}`);
                console.log();
            }
        } catch (e: any) {
            console.log(`🟢  Perplexity sonar-pro`);
            console.log(`   ❌  ${e.message}`);
            console.log();
        }
    }

    // Print each provider response from callAllCategorizationProviders
    const codes = new Set<string>();
    for (const r of responses) {
        try {
            const clean = r.text.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(clean);
            const emoji = r.provider.toLowerCase().includes('gemini') ? '🔵'
                        : r.provider.toLowerCase().includes('perplexity') ? '🟢'
                        : '🟣';

            console.log(`${emoji}  ${r.provider} — ${r.model}`);
            console.log(`   ✅  Account  : ${codeLabel(parsed.account_code)}`);
            console.log(`   📊  Confidence: ${bar(parsed.confidence ?? 0)}`);
            console.log(`   💬  Reasoning : ${parsed.reasoning}`);
            console.log();
            if (parsed.account_code && parsed.account_code !== 'UNCATEGORIZED') {
                codes.add(parsed.account_code);
            }
        } catch {
            console.log(`   ⚠️  Could not parse response from ${r.provider}`);
        }
    }

    console.log(HR);
    if (codes.size === 1) {
        const code = [...codes][0];
        console.log(`  🎯  CONSENSUS: All providers agree → ${codeLabel(code)}`);
        console.log(`      Agreement boost (+5%) would apply in the real ensemble.`);
    } else if (codes.size > 1) {
        console.log(`  ⚠️  SPLIT VOTE: ${[...codes].map(codeLabel).join('  vs  ')}`);
        console.log(`      Highest-confidence result wins in the real ensemble.`);
    } else {
        console.log(`  ❌  No successful classifications.`);
    }
    console.log(HR2 + '\n');
})();
