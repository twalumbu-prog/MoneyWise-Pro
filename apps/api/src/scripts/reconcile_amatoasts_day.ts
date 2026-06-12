import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env BEFORE other imports
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { LencoService } from '../services/lenco.service';
import { supabase } from '../lib/supabase';

/**
 * READ-ONLY day reconciliation: Amatoasts cash ledger vs Lenco transactions.
 *
 * For the target date, prints:
 *   1. Every Lenco transaction (credits + debits) with its resolved merchant
 *      reference and whether a matching cashbook entry exists.
 *   2. Every cashbook entry for that date with no matching Lenco transaction
 *      (duplicate suspects).
 *   3. Amount mismatches (entry amount vs expected sale face amount).
 *
 * Makes NO changes to any data.
 */

const ORG_ID = 'a98fa5d9-903c-4ec0-b343-dc5de49426a2'; // Amatoasts
const WALLET_ID = '026f89b6-8553-4496-ac4f-b74e4f7e77fa';
const TARGET_DATE = process.argv[2] || '2026-06-12';

function round2(n: number): number { return Math.round(n * 100) / 100; }

async function main() {
    const { data: org, error } = await supabase
        .from('organizations')
        .select('name, lenco_subaccount_id, lenco_secret_key')
        .eq('id', ORG_ID)
        .single();
    if (error || !org?.lenco_subaccount_id) throw new Error(`org load failed: ${error?.message}`);
    const secretKey = org.lenco_secret_key || process.env.LENCO_SECRET_KEY!;

    // ── 1. All Lenco transactions touching the target date ──────────────────
    let txns: any[] = [];
    const seenTxnIds = new Set<string>();
    let page = 1;
    while (page <= 40) { // safety cap
        const resp = await LencoService.getAccountTransactions(org.lenco_subaccount_id, { page }, secretKey);
        const batch: any[] = resp?.data || resp?.transactions || [];
        if (!Array.isArray(batch) || batch.length === 0) break;
        let newCount = 0;
        for (const t of batch) {
            const id = t.id || t.transactionId;
            if (id && !seenTxnIds.has(id)) { seenTxnIds.add(id); txns.push(t); newCount++; }
        }
        if (newCount === 0) break; // page param ignored / repeating data
        const oldest = batch[batch.length - 1]?.datetime || '';
        if (oldest && oldest.split('T')[0] < TARGET_DATE) break;
        page++;
        await new Promise(r => setTimeout(r, 250));
    }
    console.log(`Fetched ${txns.length} Lenco txns across ${page} page(s).`);
    const dayTxns = txns.filter(t => (t.datetime || '').split('T')[0] === TARGET_DATE
        && !['failed', 'reversed'].includes((t.status || '').toLowerCase()));
    dayTxns.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    // ── 2. Collections → settlement.id → reference map ──────────────────────
    const settlementToRef = new Map<string, string>();
    const refToCollection = new Map<string, any>();
    let colPage = 1;
    while (colPage <= 40) { // page-size-agnostic: Lenco pages are smaller than 100
        const collectionsResp = await LencoService.getCollections({ page: colPage }, secretKey);
        const collections: any[] = collectionsResp?.data || [];
        if (collections.length === 0) break;
        let newCols = 0;
        for (const col of collections) {
            if (col.reference && !refToCollection.has(col.reference)) newCols++;
            if (col.settlement?.id && col.reference) settlementToRef.set(col.settlement.id, col.reference);
            if (col.reference) refToCollection.set(col.reference, col);
        }
        if (newCols === 0) break;
        colPage++;
        await new Promise(r => setTimeout(r, 250));
    }
    console.log(`Built settlement map: ${settlementToRef.size} settlements, ${refToCollection.size} collections (${colPage} page(s)).`);

    // ── 3. Ledger entries (target date, all statuses) + sales ───────────────
    const { data: entries } = await supabase
        .from('cashbook_entries')
        .select('id, description, debit, credit, status, reference_number, external_reference, date, created_at')
        .eq('organization_id', ORG_ID)
        .eq('wallet_id', WALLET_ID)
        .eq('account_type', 'MONEYWISE_WALLET')
        .eq('date', TARGET_DATE)
        .order('created_at');

    const { data: sales } = await supabase
        .from('product_sales')
        .select('reference, customer_name, customer_phone, quantity, amount_paid, status, products(name)')
        .eq('organization_id', ORG_ID);
    const salesByRef = new Map<string, any[]>();
    for (const s of sales || []) {
        if (!salesByRef.has(s.reference)) salesByRef.set(s.reference, []);
        salesByRef.get(s.reference)!.push(s);
    }

    const allEntries = entries || [];
    const matchedEntryIds = new Set<string>();

    console.log(`\n════════ LENCO → LEDGER (${TARGET_DATE}, ${dayTxns.length} txns) ════════`);
    for (const txn of dayTxns) {
        const txnId = txn.id || txn.transactionId;
        const type = (txn.type || '').toLowerCase();
        const amt = parseFloat(txn.amount || '0');
        const desc = txn.remarks || txn.narration || txn.description || '';
        const ref = (txn.reference || txn.clientReference || '').trim() || settlementToRef.get(txnId) || '';
        const time = (txn.datetime || '').slice(11, 19);

        const isSweepDebit = type === 'debit' && (
            desc.toLowerCase().includes('split payment') || ref.toUpperCase().startsWith('SPLIT-'));

        const matches = allEntries.filter(e =>
            e.external_reference === txnId ||
            (ref && e.external_reference === ref) ||
            (ref && (e.description || '').includes(ref)));
        matches.forEach(m => matchedEntryIds.add(m.id));

        const saleRows = ref ? salesByRef.get(ref) : null;
        const face = saleRows ? round2(saleRows.reduce((s, r) => s + Number(r.amount_paid || 0), 0)) : null;
        const buyer = saleRows?.[0] ? `${(saleRows[0].customer_name || '').trim() || saleRows[0].customer_phone}` : null;
        const product = saleRows?.[0]?.products?.name || null;

        let verdict: string;
        if (isSweepDebit) {
            verdict = matches.length === 0 ? 'OK (sweep leg, intentionally unledgered)' : `!! sweep leg HAS ${matches.length} ledger entr(ies)`;
        } else if (matches.length === 0) {
            verdict = '!! MISSING from ledger';
        } else if (matches.length === 1) {
            const m = matches[0];
            const ledgerAmt = type === 'credit' ? Number(m.debit) : Number(m.credit);
            const expected = type === 'credit' && face != null ? face : amt;
            verdict = Math.abs(ledgerAmt - expected) <= 0.011
                ? `OK → ${m.reference_number || m.id.slice(0, 8)} [${m.status}] K${ledgerAmt}`
                : `AMOUNT MISMATCH → ${m.reference_number || m.id.slice(0, 8)} [${m.status}] ledger K${ledgerAmt}, lenco K${amt}${face != null ? `, face K${face}` : ''}`;
        } else {
            verdict = `!! ${matches.length} MATCHES (dupes?): ${matches.map(m => `${m.reference_number || m.id.slice(0, 8)}[${m.status}] K${m.debit}|${m.credit}`).join(', ')}`;
        }

        console.log(`${time} ${type.toUpperCase().padEnd(6)} K${String(amt).padEnd(8)} ${verdict}`);
        console.log(`         ref=${ref || '(none)'} txnId=${txnId}`);
        if (buyer) console.log(`         sale: ${product} → ${buyer} (face K${face})`);
        console.log(`         narration: ${desc.slice(0, 90)}`);
    }

    console.log(`\n════════ LEDGER ENTRIES (${TARGET_DATE}) WITH NO LENCO TXN ════════`);
    let orphans = 0;
    for (const e of allEntries) {
        if (matchedEntryIds.has(e.id)) continue;
        if (e.status === 'PENDING') continue; // intents aren't expected to match
        orphans++;
        console.log(`${e.created_at.slice(11, 19)} ${e.reference_number || e.id.slice(0, 8)} [${e.status}] debit=${e.debit} credit=${e.credit}`);
        console.log(`         ext_ref=${e.external_reference || '(none)'}`);
        console.log(`         ${(e.description || '').slice(0, 100)}`);
    }
    if (orphans === 0) console.log('(none — every non-pending ledger entry matches a Lenco transaction)');

    const pendingCount = allEntries.filter(e => e.status === 'PENDING').length;
    console.log(`\n(${pendingCount} PENDING intents dated ${TARGET_DATE} excluded from orphan check)`);

    const bal = await LencoService.getAccountBalance(org.lenco_subaccount_id, secretKey);
    console.log(`\nLenco balance now: available=${bal?.availableBalance} ledger=${bal?.ledgerBalance ?? bal?.balance}`);
}

main().then(() => process.exit(0)).catch(err => { console.error('Recon failed:', err.message); process.exit(1); });
