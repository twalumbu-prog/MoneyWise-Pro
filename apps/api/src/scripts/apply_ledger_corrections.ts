/**
 * Apply the Kaizen worklist of corrections to an external wallet's ledger (first use: Twalumbu's Zanaco wallet).
 *
 *   npx ts-node --transpile-only src/scripts/apply_ledger_corrections.ts --org <orgId> --wallet <walletId> --file <moneywise_entries_worklist.csv> --stage <stage>
 *   add APPLY=1 to write. Without it NOTHING is changed: it prints and saves exactly what it would do.
 *
 * Stages (run one at a time, in this order):
 *   links           link OK / FIX_DATE entries to their bank statement lines (statement lines must be imported first)
 *   fix-high        re-date the FIX_DATE entries whose match is HIGH confidence
 *   queue-medium    put the MEDIUM re-dates in the review queue (nothing changes until a person approves each one)
 *   unverified      park NO_DEPOSIT_FOUND / MW_ONLY entries as Unverified (held out of the balance) and queue them for a decision
 *   apply-approved  carry out the queue rows a person has set to APPROVED (MEDIUM re-dates, and Unverified resolutions)
 *
 * Safety: refuses to APPLY unless the organisation's Master Fees → QuickBooks auto-posting is paused, and unless the migration is in.
 * Idempotent: keyed on external_reference; a second run changes nothing. Running balances are rebuilt once per account at the end.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase';
import {
    redateEntry, markUnverified, restoreUnverified, moveEntryToWallet, linkEntryToStatementLines, queueForReview, rebuildBalances,
    CorrectionResult,
} from '../services/ledgerCorrections/ledgerCorrections.service';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const ORG = arg('org'), WALLET = arg('wallet'), FILE = arg('file'), STAGE = arg('stage');
const APPLY = process.env.APPLY === '1';
const ACTOR = process.env.CORRECTION_ACTOR || 'claude-ledger-corrections';
const SOURCE_TAG = 'kaizen-worklist-2026-11-04';

/** Minimal RFC-4180 CSV reader (quoted fields, doubled quotes, newlines inside quotes). */
function parseCsv(text: string): Record<string, string>[] {
    const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c !== '\r') cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    const [head, ...body] = rows;
    return body.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const csvOut = (rows: any[]) => { if (!rows.length) return ''; const h = Object.keys(rows[0]); return [h.join(','), ...rows.map(r => h.map(k => { const v = String(r[k] ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','))].join('\n'); };

async function guards() {
    if (!ORG || !WALLET || !STAGE) throw new Error('usage: --org <id> --wallet <id> --stage <links|fix-high|queue-medium|unverified|apply-approved> [--file <csv>]');
    const probe = await supabase.from('cashbook_entries').select('recorded_date, verification_status, held_amount, qb_resync_required').limit(1);
    if (probe.error) throw new Error(`the migration 20261104120000_ledger_deposit_corrections.sql has not been applied: ${probe.error.message}`);
    if (APPLY) {
        const { data: mf } = await supabase.from('integrations').select('config').eq('provider', 'MASTERFEES').eq('organization_id', ORG).maybeSingle();
        const qb = (mf?.config as any)?.qbAutoPost;
        if (qb?.enabled !== false && qb?.dryRun !== true) throw new Error('Master Fees → QuickBooks auto-posting is NOT paused for this organisation. Pause it (integrations.config.qbAutoPost.enabled=false) before applying.');
    }
}

async function entriesByRef(): Promise<Map<string, any>> {
    const m = new Map<string, any>();
    for (let f = 0; ; f += 1000) {
        const { data, error } = await supabase.from('cashbook_entries').select('id, external_reference, account_type').eq('organization_id', ORG!).eq('account_type', WALLET!).order('id').range(f, f + 999);
        if (error) throw new Error(error.message);
        for (const e of data ?? []) m.set(String((e as any).external_reference), e);
        if (!data || data.length < 1000) break;
    }
    return m;
}

async function main() {
    await guards();
    const ctx = { actor: ACTOR, apply: APPLY };
    const results: any[] = []; const touched = new Set<string>();
    const rec = (stage: string, ref: string, r: { outcome: string; detail: string; accountType?: string }) => { results.push({ stage, external_reference: ref, outcome: r.outcome, detail: r.detail }); if (r.outcome === 'APPLIED' && r.accountType) touched.add(r.accountType); };

    if (STAGE === 'apply-approved') {
        const { data: q, error } = await supabase.from('ledger_correction_queue').select('*').eq('organization_id', ORG!).eq('status', 'APPROVED');
        if (error) throw new Error(error.message);
        for (const item of q ?? []) {
            const { data: e } = await supabase.from('cashbook_entries').select('external_reference').eq('id', item.entry_id).maybeSingle();
            const ref = String(e?.external_reference ?? item.entry_id);
            let r: CorrectionResult | null = null;
            if (item.action_code === 'FIX_DATE_MEDIUM') r = await redateEntry(ORG!, item.entry_id, String(item.proposed?.new_date), ref, `Approved by ${item.decided_by}: ${item.notes ?? ''}`, ctx);
            else if (item.resolution === 'DEPOSIT_FOUND') {
                r = await restoreUnverified(ORG!, item.entry_id, ctx);
                if (item.proposed?.new_date && (r.outcome === 'APPLIED' || r.outcome === 'WOULD_APPLY')) rec('apply-approved', ref, await redateEntry(ORG!, item.entry_id, String(item.proposed.new_date), ref, `Approved by ${item.decided_by}`, ctx));
            } else if (item.resolution === 'OTHER_ACCOUNT' && item.resolution_note) r = await restoreUnverified(ORG!, item.entry_id, ctx).then(async x => (x.outcome === 'NOT_FOUND' ? x : moveEntryToWallet(ORG!, item.entry_id, item.resolution_note, ref, `Approved by ${item.decided_by}: belongs to another account`, ctx)));
            else if (item.resolution === 'DUPLICATE' || item.resolution === 'NOT_RECEIVED') r = { entryId: item.entry_id, outcome: APPLY ? 'APPLIED' : 'WOULD_APPLY', detail: `stays Unverified (${item.resolution}${item.resolution_note ? ': ' + item.resolution_note : ''}); Finance reverses it in Master Fees` };
            else r = { entryId: item.entry_id, outcome: 'NOOP', detail: 'approved without a usable resolution' };
            if (r) rec('apply-approved', ref, r);
            if (APPLY && r && (r.outcome === 'APPLIED' || r.outcome === 'NOOP') && item.status === 'APPROVED') await supabase.from('ledger_correction_queue').update({ status: 'APPLIED' }).eq('id', item.id);
        }
    } else {
        if (!FILE) throw new Error('--file <moneywise_entries_worklist.csv> is required for this stage');
        const rows = parseCsv(fs.readFileSync(FILE, 'utf8'));
        const byRef = await entriesByRef();
        for (const w of rows) {
            const ref = w.external_reference; const e = byRef.get(ref);
            const pick = (a: string, c?: string) => w.action === a && (!c || w.confidence === c);
            if (!e) { if (['links', 'fix-high', 'queue-medium', 'unverified'].includes(STAGE!)) rec(STAGE!, ref, { outcome: 'NOT_FOUND', detail: 'not on this wallet' }); continue; }
            if (STAGE === 'links' && (w.action === 'OK' || w.action === 'FIX_DATE') && w.bank_external_ids) {
                const ids = w.bank_external_ids.split(';').map(x => x.trim()).filter(Boolean);
                const r = await linkEntryToStatementLines(ORG!, WALLET!, e.id, ids, w.confidence === 'MEDIUM' ? 'MEDIUM' : 'HIGH', SOURCE_TAG, APPLY);
                rec('links', ref, { outcome: r.missingLines.length ? 'NOOP' : (APPLY ? 'APPLIED' : 'WOULD_APPLY'), detail: `${r.linked}/${ids.length} lines${r.missingLines.length ? ' · statement lines not imported yet: ' + r.missingLines.join(';') : ''}` });
            } else if (STAGE === 'fix-high' && pick('FIX_DATE', 'HIGH')) {
                rec('fix-high', ref, await redateEntry(ORG!, e.id, w.correct_date, ref, `Bank deposit date (${w.days_off} days off); matched ${w.bank_external_ids}`, ctx));
            } else if (STAGE === 'queue-medium' && pick('FIX_DATE', 'MEDIUM')) {
                const added = await queueForReview(ORG!, e.id, 'FIX_DATE_MEDIUM', { new_date: w.correct_date, days_off: Number(w.days_off), bank_external_ids: w.bank_external_ids.split(';').filter(Boolean), bank_narration: w.bank_narration }, w.notes, APPLY);
                rec('queue-medium', ref, { outcome: added ? (APPLY ? 'APPLIED' : 'WOULD_APPLY') : 'NOOP', detail: `${w.mw_date} -> ${w.correct_date} (${w.days_off} days)` });
            } else if (STAGE === 'unverified' && (w.action === 'NO_DEPOSIT_FOUND' || w.action === 'MW_ONLY_NOT_ZANACO_IN_MF')) {
                const note = w.notes || (w.action === 'MW_ONLY_NOT_ZANACO_IN_MF' ? 'Master Fees records this payment under another channel; no Zanaco deposit matches' : 'No matching bank deposit');
                const r = await markUnverified(ORG!, e.id, note, ref, ctx);
                rec('unverified', ref, r);
                await queueForReview(ORG!, e.id, w.action === 'NO_DEPOSIT_FOUND' ? 'NO_DEPOSIT_FOUND' : 'MW_ONLY_NOT_ZANACO', { amount: Number(w.amount), mw_date: w.mw_date, payer: w.payer_name }, note, APPLY);
            }
        }
    }

    if (APPLY) for (const acct of touched) { console.log(`rebuilding running balances: ${acct}`); await rebuildBalances(ORG!, acct); }
    const counts = results.reduce((a: any, r) => ((a[`${r.stage}:${r.outcome}`] = (a[`${r.stage}:${r.outcome}`] || 0) + 1), a), {});
    console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN (nothing changed)'} · stage ${STAGE}`); console.log(counts);
    const outDir = path.resolve(process.cwd(), 'correction_runs'); fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${STAGE}_${APPLY ? 'applied' : 'dryrun'}_${Date.now()}.csv`);
    fs.writeFileSync(outFile, csvOut(results)); console.log('detail saved to', outFile);
}
main().then(() => process.exit(0)).catch(e => { console.error('FAILED:', e.message); process.exit(1); });
