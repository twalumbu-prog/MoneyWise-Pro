/**
 * bulk_categorize_entries.ts
 *
 * Batch-categorizes all cashbook_entries (account_id IS NULL) across every
 * organization EXCEPT Twalumbu and Blue Opus Software.
 *
 * Three-tier strategy (cheapest first):
 *   T1 – Pattern matching:  DISBURSEMENT wallet entries → MoneyWise Wallet
 *                           "Sale: Products: <name>" → best-fit income account
 *                           OPENING_BALANCE / system entries → skip
 *   T2 – decisionRouter:   Everything else (expenses, ambiguous inflows)
 *                           using the full Rule→Memory→AI stack
 *
 * Run from apps/api/:
 *   npx ts-node --transpile-only src/scripts/bulk_categorize_entries.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { decisionRouter } from '../services/ai/decision.router';
import { ruleEngine } from '../services/ai/rule.engine';

// ── Supabase client ──────────────────────────────────────────────────────────

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Excluded orgs ────────────────────────────────────────────────────────────

const EXCLUDED_ORG_NAMES = ['twalumbu', 'blue opus'];

// ── Entry types to skip entirely ─────────────────────────────────────────────

const SKIP_ENTRY_TYPES = new Set([
    'OPENING_BALANCE',
    'BALANCE_ADJUSTMENT',
    'RECONCILIATION',
]);

// ── Description patterns to skip ─────────────────────────────────────────────

const SKIP_DESC_PATTERNS = [
    /^PENDING_INTENT:/i,
    /^Split payment/i,
    /^Platform fee/i,
    /^MoneyWise platform fee/i,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function shouldSkip(entry: any): boolean {
    if (SKIP_ENTRY_TYPES.has(entry.entry_type)) return true;
    const desc = (entry.description || '').trim();
    if (!desc) return true;
    return SKIP_DESC_PATTERNS.some(p => p.test(desc));
}

/** Find the MoneyWise Wallet account for an org */
function walletAccount(accounts: any[]): any | null {
    return accounts.find(
        (a: any) => a.code === 'QB-1150040000' || a.name?.toLowerCase().includes('moneywise wallet'),
    ) || null;
}

/** Find the Transaction Charges account for an org */
function txChargesAccount(accounts: any[]): any | null {
    return accounts.find(
        (a: any) => a.code === 'QB-28' || a.name?.toLowerCase().includes('transaction charge'),
    ) || null;
}

/**
 * Pattern-match a "Sale: Products: <name>" inflow to an income account.
 * Tries keyword matching before giving up (returns null to fall through to AI).
 */
function matchSaleToIncome(description: string, accounts: any[]): any | null {
    const incomeAccounts = accounts.filter((a: any) => a.type === 'INCOME');
    if (incomeAccounts.length === 0) return null;

    const desc = description.toLowerCase();

    // Extract product name from "Sale: Products: <name> (x…)"
    const prodMatch = description.match(/Sale:\s*Products?:\s*([^|]+?)(?:\s*\(x\d+\))?(?:\s*\|)/i);
    const productName = prodMatch ? prodMatch[1].trim().toLowerCase() : desc;

    // Keyword → account name fragment mapping (ordered by specificity)
    const rules: [RegExp, string[]][] = [
        [/ticket|vip|access|entry|pass/i,        ['ticket', 'event ticket', 'ticket sale']],
        [/spa|wellness|massage|sauna/i,           ['spa', 'experience', 'wellness']],
        [/screen ad|on.?screen|stage ad|advert/i,['screen', 'stage ad', 'advertising', 'ad revenue']],
        [/sponsorship|sponsor/i,                  ['sponsor']],
        [/food|drink|beverage|bar/i,              ['food', 'beverage', 'drink']],
        [/print|certificate|banner|embroidery|design/i, ['print', 'embroidery', 'design', 'signage']],
        [/courier|delivery|shipping/i,            ['courier', 'shipping', 'delivery']],
        [/freight|haulage|transport/i,            ['freight', 'transport', 'haulage']],
    ];

    for (const [trigger, keywords] of rules) {
        if (trigger.test(productName)) {
            for (const kw of keywords) {
                const match = incomeAccounts.find((a: any) => a.name.toLowerCase().includes(kw));
                if (match) return match;
            }
        }
    }

    // Fallback: first income account (avoids AI call for obvious sales)
    return incomeAccounts[0];
}

/** Strip the Ref: suffix so descriptions are cleaner for the AI */
function cleanDescription(desc: string): string {
    return desc.split(' | Ref:')[0].trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

const HR = '─'.repeat(80);

(async () => {
    console.log('\n' + '═'.repeat(80));
    console.log('  MoneyWise Pro — Bulk Cashbook Entry Categorization');
    console.log('═'.repeat(80));

    await ruleEngine.loadRules();

    // 1. Fetch all target orgs
    const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');

    if (orgErr) throw orgErr;

    const targetOrgs = (orgs || []).filter(
        (o: any) => !EXCLUDED_ORG_NAMES.some(ex => o.name.toLowerCase().includes(ex)),
    );

    console.log(`\n  Target orgs: ${targetOrgs.length} (Twalumbu + Blue Opus excluded)\n`);

    // Global counters
    let totalPatternMatched = 0;
    let totalAIClassified   = 0;
    let totalSkipped        = 0;
    let totalErrors         = 0;
    let totalNoAccount      = 0;

    for (const org of targetOrgs) {
        // 2. Fetch this org's accounts
        const { data: accounts } = await supabase
            .from('accounts')
            .select('id, code, name, type, description')
            .eq('organization_id', org.id)
            .eq('is_active', true);

        if (!accounts || accounts.length === 0) {
            // No COA — nothing to map to
            continue;
        }

        // 3. Fetch uncategorized entries for this org
        const { data: entries, error: entErr } = await supabase
            .from('cashbook_entries')
            .select('id, description, debit, credit, entry_type, account_type')
            .eq('organization_id', org.id)
            .is('account_id', null)
            .order('created_at', { ascending: true });

        if (entErr) {
            console.error(`  ❌  ${org.name}: fetch error — ${entErr.message}`);
            totalErrors++;
            continue;
        }

        if (!entries || entries.length === 0) continue;

        console.log(HR);
        console.log(`  📂  ${org.name}  (${entries.length} uncategorized entries, ${accounts.length} accounts)`);

        let orgPatternMatched = 0;
        let orgAI             = 0;
        let orgSkipped        = 0;
        let orgNoAccount      = 0;

        const updates: { id: string; account_id: string; method: string; desc: string; account_name: string }[] = [];

        for (const entry of entries) {
            const desc = (entry.description || '').trim();

            // ── T0: Skip system/non-classifiable entries ─────────────────────
            if (shouldSkip(entry)) {
                orgSkipped++;
                continue;
            }

            let matched: any | null = null;
            let method = '';

            // ── T1a: DISBURSEMENT entries → MoneyWise Wallet ─────────────────
            if (entry.entry_type === 'DISBURSEMENT') {
                matched = walletAccount(accounts);
                method  = 'PATTERN:DISBURSEMENT→WALLET';
            }

            // ── T1b: "Transaction Charges" / "Withdrawal fee" entries ─────────
            else if (
                /^(transaction charge|withdrawal fee|lenco fee|bank charge|platform charge)/i.test(desc)
            ) {
                matched = txChargesAccount(accounts);
                method  = 'PATTERN:TX_CHARGE';
            }

            // ── T1c: "Sale: Products: …" INFLOW → income account ─────────────
            else if (entry.entry_type === 'INFLOW' && /^Sale:\s*Products?:/i.test(desc)) {
                matched = matchSaleToIncome(desc, accounts);
                method  = 'PATTERN:SALE_PRODUCT';
            }

            // ── T1d: "Sale: <product name>" (non-Products: prefix) ────────────
            //         Covers Lubangi's "Sale: The Full Stage." / "Sale: On Screen Ad."
            else if (entry.entry_type === 'INFLOW' && /^Sale:\s+\S/i.test(desc)) {
                matched = matchSaleToIncome(desc, accounts);
                method  = 'PATTERN:SALE_GENERIC';
            }

            // ── T2: AI via decisionRouter ─────────────────────────────────────
            if (!matched) {
                try {
                    const amount = Number(entry.debit) > 0 ? Number(entry.debit) : Number(entry.credit);
                    const decision = await decisionRouter.classify(
                        accounts,
                        { description: cleanDescription(desc), amount },
                        org.id,
                    );

                    if (decision.account_code) {
                        const codeNorm = String(decision.account_code).toLowerCase();
                        matched = accounts.find(
                            (a: any) => String(a.code || '').toLowerCase() === codeNorm,
                        ) || null;
                        method = `AI:${decision.method}`;
                    }
                } catch (err: any) {
                    console.error(`    ⚠️  AI error for "${desc.slice(0, 60)}": ${err.message}`);
                    totalErrors++;
                }
            }

            if (matched) {
                updates.push({
                    id:           entry.id,
                    account_id:   matched.id,
                    method,
                    desc:         desc.slice(0, 70),
                    account_name: matched.name,
                });
                if (method.startsWith('PATTERN')) orgPatternMatched++;
                else orgAI++;
            } else {
                orgNoAccount++;
            }
        }

        // 4. Apply updates in batches of 50
        if (updates.length > 0) {
            const BATCH = 50;
            for (let i = 0; i < updates.length; i += BATCH) {
                const batch = updates.slice(i, i + BATCH);
                // Supabase doesn't support bulk upsert with different values per row,
                // so we do Promise.all over individual updates (still much faster than serial)
                await Promise.all(
                    batch.map(u =>
                        supabase
                            .from('cashbook_entries')
                            .update({ account_id: u.account_id })
                            .eq('id', u.id),
                    ),
                );
            }

            // Print sample of what was done
            const sample = updates.slice(0, 5);
            for (const u of sample) {
                const icon = u.method.startsWith('PATTERN') ? '🔷' : '🤖';
                console.log(`    ${icon}  "${u.desc}" → ${u.account_name}  [${u.method}]`);
            }
            if (updates.length > 5) {
                console.log(`    … and ${updates.length - 5} more`);
            }
        }

        console.log(
            `    ✅  Pattern: ${orgPatternMatched}  |  AI: ${orgAI}  |  Skipped: ${orgSkipped}  |  No match: ${orgNoAccount}`,
        );

        totalPatternMatched += orgPatternMatched;
        totalAIClassified   += orgAI;
        totalSkipped        += orgSkipped;
        totalNoAccount      += orgNoAccount;
    }

    console.log('\n' + '═'.repeat(80));
    console.log('  SUMMARY');
    console.log(`  Pattern-matched : ${totalPatternMatched}`);
    console.log(`  AI-classified   : ${totalAIClassified}`);
    console.log(`  Skipped         : ${totalSkipped}`);
    console.log(`  No match found  : ${totalNoAccount}`);
    console.log(`  Errors          : ${totalErrors}`);
    console.log('═'.repeat(80) + '\n');
})();
