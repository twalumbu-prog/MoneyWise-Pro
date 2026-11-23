/**
 * Reconcile a bank statement CSV (Standard Chartered "AccountTransactions.csv" layout) against one workspace's external bank account, and add what is
 * missing so the Reports page reflects the real money. DRY RUN by default: it prints what it matched and what it would add. Add --apply to write.
 *
 *   npx tsx src/scripts/import_bank_statement.ts <statement.csv> <organizationId> <externalWalletId> [--apply]
 *
 * Safe to run twice: every row it writes carries external_reference "BANKCSV-<fingerprint>", and a row already there is skipped.
 * Undo everything it added:  DELETE FROM cashbook_entries WHERE organization_id = '<org>' AND external_reference LIKE 'BANKCSV-%'  (then recalculate).
 */
import fs from 'fs';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';

interface Line { n: number; posted: string; text: string; deposit: number; withdrawal: number; closing: number; signed: number }
interface Plan {
    line: Line; date: string; direction: 'IN' | 'OUT'; amount: number; label: string; kind: string;
    accountId: string | null; categoryName: string; review: boolean; matched?: string;
}

const [csvPath, orgId, walletId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
if (!csvPath || !orgId || !walletId) { console.error('usage: import_bank_statement.ts <csv> <orgId> <externalWalletId> [--apply]'); process.exit(1); }

const num = (s: string) => Number(String(s ?? '').replace(/[,"\s]/g, '')) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const toIso = (d: string) => { const m = /(\d{2})[/-](\d{2})[/-](\d{4})/.exec(d); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

function parse(path: string): Line[] {
    const rows: Line[] = [];
    const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
    let n = 0;
    for (const raw of lines) {
        const m = /^\s*(\d{2}\/\d{2}\/\d{4}),"(.*)","ZMW","([^"]*)","([^"]*)","([^"]*)"\s*$/.exec(raw);
        if (!m) continue;
        const deposit = num(m[3]), withdrawal = num(m[4]);
        rows.push({ n: ++n, posted: toIso(m[1]), text: m[2].replace(/\s+/g, ' ').trim(), deposit, withdrawal, closing: num(m[5]), signed: round2(deposit - withdrawal) });
    }
    return rows;
}

/** The statement is newest first. Check every closing balance follows from the next older one, and the whole thing adds up. */
function verifyChain(rows: Line[]) {
    const breaks: string[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
        const diff = round2(rows[i].closing - rows[i + 1].closing);
        if (Math.abs(diff - rows[i].signed) > 0.01) breaks.push(`row ${rows[i].n} (${rows[i].posted}): balance moved ${diff} but the line says ${rows[i].signed}`);
    }
    const oldest = rows[rows.length - 1];
    const opening = round2(oldest.closing - oldest.signed);
    const net = round2(rows.reduce((s, r) => s + r.signed, 0));
    return { breaks, opening, closingFromSum: round2(opening + net), closing: rows[0].closing };
}

// ── classification
const ACC = {
    dining: ['c8886bf7-7f9f-431a-b00b-c91ef274d0a4', 'Dining & Entertainment'],
    groceries: ['118e6c85-3562-4f74-b7c2-9edd7a116e22', 'Groceries & Household'],
    transport: ['a42b6664-3ec0-4350-8f16-9085a56ceaab', 'Transport & Fuel'],
    web: ['7e647836-7c2d-40a5-ac94-66948febf24b', 'Utilities (Electricity, Water, Web)'],
    misc: ['c29006f9-a13d-4761-b715-f3b163341381', 'Miscellaneous Expenses'],
    charges: ['6bad818c-a010-4037-8132-3e2c6fe8357b', 'Transaction Charges'],
    freelance: ['cc16a859-3927-4914-a4c1-9ec88544762e', 'Side Business & Freelancing'],
} as const;
type Cat = keyof typeof ACC;

const MERCHANTS: { re: RegExp; name: string; cat: Cat }[] = [
    { re: /KFC EAST PARK/, name: 'KFC East Park', cat: 'dining' }, { re: /ROMANS PIZZA/, name: 'Romans Pizza', cat: 'dining' }, { re: /SIMBISA/, name: 'Simbisa Brands', cat: 'dining' },
    { re: /CRUNCHY KING/, name: 'Crunchy King', cat: 'dining' }, { re: /VIDA CAFE/, name: 'Vida Cafe', cat: 'dining' }, { re: /GOLDEN OAKLET/, name: 'Golden Oaklet', cat: 'dining' }, { re: /GIGIBONTA/, name: 'Gigibonta Italian', cat: 'dining' },
    { re: /SHOPRITE/, name: 'Shoprite', cat: 'groceries' }, { re: /CHOPPIES/, name: 'Choppies', cat: 'groceries' }, { re: /LOVE OF HOME/, name: 'Love of Home', cat: 'groceries' }, { re: /MVM ONLINE/, name: 'MVM Online Shop', cat: 'groceries' },
    { re: /RUBIS/, name: 'Rubis', cat: 'transport' }, { re: /PUMA ENERGY/, name: 'Puma Energy', cat: 'transport' }, { re: /Q-ENERGIES/, name: 'Q-Energies', cat: 'transport' }, { re: /MOUNT MERU/, name: 'Mount Meru', cat: 'transport' },
    { re: /PRIMENET/, name: 'Primenet Solutions', cat: 'web' }, { re: /SUPABASE/, name: 'Supabase', cat: 'web' }, { re: /VERCEL/, name: 'Vercel', cat: 'web' }, { re: /OPENAI/, name: 'OpenAI ChatGPT', cat: 'web' },
    { re: /ANTHROPIC/, name: 'Anthropic Claude', cat: 'web' }, { re: /RESUME\.IO/, name: 'Resume.io', cat: 'web' }, { re: /TRIPO AI/, name: 'Tripo AI', cat: 'web' }, { re: /GOOGLE \*GOOGLE ONE|GOOGLE G1SK/, name: 'Google One', cat: 'web' },
    { re: /GOOGLE PLAY/, name: 'Google Play', cat: 'misc' }, { re: /APPLE\.COM/, name: 'Apple', cat: 'misc' }, { re: /SPOTIFY/, name: 'Spotify', cat: 'misc' }, { re: /PM \*GIME/, name: 'GIME (Hong Kong)', cat: 'misc' },
    { re: /EBAY/, name: 'eBay', cat: 'misc' }, { re: /Z-SHI/, name: 'Z-Shi Investments', cat: 'misc' }, { re: /ANGELINA1000000/, name: 'Angelina (Lusaka)', cat: 'misc' }, { re: /ZAMLOVE/, name: 'Zamlove Investments', cat: 'misc' },
    { re: /SMART ZAMBIA/, name: 'Smart Zambia', cat: 'misc' }, { re: /PAYNICORN/, name: 'Paynicorn', cat: 'misc' },
];

const txnDate = (text: string, posted: string): string => {
    const m = /\b(\d{2})-(\d{2})-(\d{4})\b/.exec(text);
    if (!m) return posted;
    const d = `${m[3]}-${m[2]}-${m[1]}`;
    return d <= posted && d >= new Date(Date.parse(posted) - 10 * 86400000).toISOString().slice(0, 10) ? d : posted;   // the purchase day, when it makes sense
};
const usdNote = (text: string) => { const m = /USD ([\d.]+)/.exec(text); return m ? ` (USD ${m[1]})` : ''; };

async function classify(rows: Line[], reqs: Map<string, { org: string; mine: boolean; descr: string }>): Promise<Plan[]> {
    const plans: Plan[] = [];
    for (const r of rows) {
        const t = r.text.toUpperCase();
        const dir: 'IN' | 'OUT' = r.signed >= 0 ? 'IN' : 'OUT';
        const amount = Math.abs(r.signed);
        const date = txnDate(r.text, r.posted);
        const base = { line: r, date, direction: dir, amount };
        let plan: Plan | null = null;
        if (dir === 'OUT') {
            if (/ATM WDR NFS CHRGS/.test(t)) plan = { ...base, label: 'ATM withdrawal charge', kind: 'ATM fee', accountId: ACC.charges[0], categoryName: ACC.charges[1], review: false };
            else if (/ATM WDR AT NFS/.test(t)) plan = { ...base, label: 'ATM cash withdrawal', kind: 'Cash withdrawal (transfer)', accountId: null, categoryName: '(transfer: cash out of the bank)', review: false };
            else {
                const mm = MERCHANTS.find((m) => m.re.test(t));
                plan = mm
                    ? { ...base, label: `${mm.name}${usdNote(r.text)}`, kind: 'Card payment', accountId: ACC[mm.cat][0], categoryName: ACC[mm.cat][1], review: false }
                    : { ...base, label: r.text.slice(0, 60), kind: 'Unrecognised payment', accountId: null, categoryName: '(needs a category)', review: true };
            }
        } else {
            const req = /REQUISITION ([0-9A-F]{6})/.exec(t)?.[1]?.toLowerCase();
            // A card refund is a refund; a MoneyWise (BROADPAY) transfer that merely names a vendor in its memo is a reimbursement.
            const viaWallet = /WALLET2BANK-NFS|WALLET TRANSFER-NFS/.test(t);
            const refund = viaWallet ? undefined : MERCHANTS.find((m) => m.re.test(t));
            const memoVendor = viaWallet && /BROADPAY/.test(t) ? MERCHANTS.find((m) => m.re.test(t)) : undefined;
            if (req) {
                const info = reqs.get(req);
                if (info?.mine) plan = { ...base, label: `Moved from MoneyWise wallet (${info.descr})`, kind: 'Transfer in (own wallet)', accountId: null, categoryName: '(transfer: no income)', review: false };
                else plan = { ...base, label: `Reimbursement from ${info?.org ?? 'a MoneyWise requisition'}: ${info?.descr ?? 'requisition ' + req.toUpperCase()}`, kind: 'Reimbursement', accountId: '__REIMB__', categoryName: 'Reimbursements (new income account)', review: false };
            } else if (memoVendor) plan = { ...base, label: `Reimbursement via MoneyWise: ${memoVendor.name}`, kind: 'Reimbursement', accountId: '__REIMB__', categoryName: 'Reimbursements (new income account)', review: false };
            else if (/VERCEL AUGUST SUBSCRIPTION/.test(t)) plan = { ...base, label: 'Reimbursement from Blue Opus Software: Vercel August subscription', kind: 'Reimbursement', accountId: '__REIMB__', categoryName: 'Reimbursements (new income account)', review: false };
            else if (refund) plan = { ...base, label: `Refund: ${refund.name}${usdNote(r.text)}`, kind: 'Refund', accountId: ACC[refund.cat][0], categoryName: `${ACC[refund.cat][1]} (reduces the expense)`, review: false };
            else if (/ACH .*LUBU ROAD/.test(t)) plan = { ...base, label: 'Lubu Road School (bank transfer in)', kind: 'Income', accountId: ACC.freelance[0], categoryName: ACC.freelance[1], review: true };
            else if (/ACH .*(DIAMOND STAFF|DIAMOND EQUITY)/.test(t)) plan = { ...base, label: `${/STAFF/.test(t) ? 'Diamond Staff' : 'Diamond Equity'} (bank transfer in)`, kind: 'Transfer in', accountId: null, categoryName: '(needs a category)', review: true };
            else if (/WALLET TRANSFER-NFS|WALLET2BANK-NFS (CHARLEY SIWALE)/.test(t)) plan = { ...base, label: /CHARLEY/.test(t) ? 'Transfer from your own wallet' : 'Mobile wallet to bank transfer', kind: 'Transfer in (own wallet)', accountId: null, categoryName: '(transfer: no income)', review: false };
            else if (/HOBBITON|BROADPAY .*AUTOSETTLEMENT/.test(t)) plan = { ...base, label: /HOBBITON/.test(t) ? 'Hobbiton settlement' : 'MoneyWise autosettlement', kind: 'Settlement in', accountId: null, categoryName: '(needs a category)', review: true };
            else {
                const pretty = (x: string) => x.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
                const broad = /WALLET2BANK-NFS BROADPAY \d+ ([A-Z ]+?)(?: \d{6,}|$)/.exec(t)?.[1]?.trim();
                if (broad) plan = { ...base, label: `Received via MoneyWise (note: ${pretty(broad)})`, kind: 'Money received', accountId: null, categoryName: '(needs a category)', review: true };
                else {
                    const who = (/WALLET2BANK-NFS ([A-Z ]+?)(?: \d{6,}| MP|$)/.exec(t)?.[1]?.trim() ?? r.text.slice(0, 40)).replace(/ ID$/, '');
                    plan = { ...base, label: `Received from ${pretty(who)}`, kind: 'Money received', accountId: null, categoryName: '(needs a category)', review: true };
                }
            }
        }
        plans.push(plan!);
    }
    return plans;
}

(async () => {
    const rows = parse(csvPath);
    if (!rows.length) { console.error('no transactions found in the file'); process.exit(1); }
    const chain = verifyChain(rows);
    console.log(`\nStatement: ${rows.length} lines, ${rows[rows.length - 1].posted} to ${rows[0].posted}`);
    console.log(`Opening balance (before the oldest line): K${chain.opening.toFixed(2)}; closing K${chain.closing.toFixed(2)}; opening + every line = K${chain.closingFromSum.toFixed(2)} ${Math.abs(chain.closingFromSum - chain.closing) < 0.01 ? '✔ adds up' : '✘ DOES NOT ADD UP'}`);
    console.log(chain.breaks.length ? `Balance chain: ${chain.breaks.length} breaks:\n  ${chain.breaks.slice(0, 8).join('\n  ')}` : 'Balance chain: every line follows from the one before ✔');

    // requisitions mentioned on the statement: whose are they?
    const prefixes = [...new Set(rows.map((r) => /REQUISITION ([0-9A-F]{6})/i.exec(r.text)?.[1]?.toLowerCase()).filter(Boolean))] as string[];
    const reqs = new Map<string, { org: string; mine: boolean; descr: string }>();
    if (prefixes.length) {
        const { data: orgs } = await supabase.from('organizations').select('id, name');
        const on = new Map((orgs ?? []).map((o: any) => [o.id, o.name]));
        for (const p of prefixes) {
            // a requisition id starts with these six characters, so look in that range of ids (a plain select is capped at 1000 rows)
            const lo = `${p}00-0000-0000-0000-000000000000`, hi = `${p}ff-ffff-ffff-ffff-ffffffffffff`;
            const { data } = await supabase.from('requisitions').select('id, organization_id, description').gte('id', lo).lte('id', hi).limit(5);
            const r = (data ?? []).find((x: any) => String(x.id).slice(0, 6).toLowerCase() === p);
            if (r) reqs.set(p, { org: on.get(r.organization_id) ?? '?', mine: r.organization_id === orgId, descr: String(r.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 50) });
        }
    }

    const plans = await classify(rows, reqs);

    // what the workspace already holds on this account
    const { data: existing } = await supabase.from('cashbook_entries').select('id, date, debit, credit, description, external_reference, entry_type').eq('organization_id', orgId).eq('account_type', walletId);
    const have = existing ?? [];
    const already = new Set(have.map((e: any) => String(e.external_reference ?? '')));
    const usedExisting = new Set<string>();
    for (const p of plans) {
        const fp = 'BANKCSV-' + crypto.createHash('sha1').update(`${p.line.posted}|${p.line.text}|${p.line.signed}|${p.line.closing}`).digest('hex').slice(0, 20);
        (p as any).ref = fp;
        if (already.has(fp)) { p.matched = 'already imported'; continue; }
        const hit = have.find((e: any) => !usedExisting.has(e.id) && !String(e.external_reference ?? '').startsWith('BANKCSV-') && Math.abs(Date.parse(e.date) - Date.parse(p.date)) <= 3 * 86400000
            && Math.abs((p.direction === 'IN' ? Number(e.debit) : Number(e.credit)) - p.amount) < 0.01);
        if (hit) { usedExisting.add(hit.id); p.matched = `already in the workspace: "${hit.description}" ${hit.date}`; }
    }
    const missing = plans.filter((p) => !p.matched);
    const onlyHere = have.filter((e: any) => !usedExisting.has(e.id) && !String(e.external_reference ?? '').startsWith('BANKCSV-'));

    const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    console.log(`\nAlready in the workspace on this account: ${have.length}. Matched to statement lines: ${plans.length - missing.length}. To add: ${missing.length}.`);
    const byKind = new Map<string, { n: number; total: number }>();
    for (const p of missing) { const k = `${p.direction === 'IN' ? '+' : '-'} ${p.kind} -> ${p.categoryName}`; const c = byKind.get(k) ?? { n: 0, total: 0 }; c.n++; c.total = round2(c.total + p.amount); byKind.set(k, c); }
    console.log('\nWhat would be added (by kind):');
    for (const [k, v] of [...byKind.entries()].sort()) console.log(`  ${String(v.n).padStart(3)} × K${money(v.total).padStart(10)}  ${k}`);
    const toReview = missing.filter((p) => p.review);
    console.log(`\nLeft for you to categorise (no safe guess): ${toReview.length} lines, K${money(toReview.reduce((s, p) => s + p.amount, 0))}`);
    if (onlyHere.length) { console.log(`\nIn the workspace but NOT on the statement (left untouched; they may be cash, or duplicates):`); for (const e of onlyHere) console.log(`  ${e.date}  ${e.entry_type}  in ${money(Number(e.debit))} out ${money(Number(e.credit))}  ${e.description}`); }
    if (process.env.SHOW) { console.log('\nEvery line:'); for (const p of plans) console.log(`${p.line.posted} ${p.direction === 'IN' ? '+' : '-'}${money(p.amount).padStart(10)} ${p.matched ? '[matched]' : '[add]    '} ${p.label} | ${p.categoryName}${p.review ? ' | REVIEW' : ''}`); }

    if (!APPLY) { console.log('\nDRY RUN: nothing was written. Add --apply to write the rows above.'); process.exit(0); }

    // ── write
    let reimb: string | null = null;
    if (missing.some((p) => p.accountId === '__REIMB__')) {
        const { data: found } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('name', 'Reimbursements').maybeSingle();
        if (found) reimb = found.id;
        else {
            const { data: made, error } = await supabase.from('accounts').insert({ organization_id: orgId, name: 'Reimbursements', type: 'INCOME', code: 'INC-103' }).select('id').single();
            if (error) throw error; reimb = made.id;
        }
    }
    // an opening balance, so the account's running balance matches the statement
    const { data: hasOpen } = await supabase.from('cashbook_entries').select('id').eq('organization_id', orgId).eq('account_type', walletId).like('external_reference', 'BANKCSV-OPENING%').maybeSingle();
    const oldestDate = rows[rows.length - 1].posted;
    const entries: any[] = [];
    if (!hasOpen && chain.opening > 0) entries.push({ entry_type: 'OPENING_BALANCE', description: 'Opening balance from bank statement', debit: chain.opening, credit: 0, date: new Date(Date.parse(oldestDate) - 86400000).toISOString().slice(0, 10), account_type: walletId, status: 'COMPLETED', external_reference: 'BANKCSV-OPENING' });
    for (const p of [...missing].sort((a, b) => a.date.localeCompare(b.date) || a.line.n - b.line.n)) {
        const accountId = p.accountId === '__REIMB__' ? reimb : p.accountId;
        entries.push({
            entry_type: p.direction === 'IN' ? 'INFLOW' : 'EXPENSE', description: p.label.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().slice(0, 280), debit: p.direction === 'IN' ? p.amount : 0, credit: p.direction === 'OUT' ? p.amount : 0,
            date: p.date, account_type: walletId, account_id: accountId, status: accountId ? 'ACCOUNTED' : 'COMPLETED', external_reference: (p as any).ref,
        });
    }
    const made = await cashbookService.createEntriesBulk(orgId, entries);
    console.log(`\nWrote ${made.length} entries.`);
    process.exit(0);
})().catch((e) => { console.error('ERROR', e?.message ?? e); process.exit(1); });

async function allOrgIds(): Promise<string[]> {
    const { data } = await supabase.from('organizations').select('id');
    return (data ?? []).map((o: any) => o.id);
}
