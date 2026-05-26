/**
 * lenco_source_of_truth_reconcile.ts
 *
 * AUTHORITATIVE RECONCILIATION — Lenco is the single source of truth.
 *
 * This script:
 *  1. Fetches ALL transactions from the Lenco subaccount (2026-03-18 → 2026-05-01)
 *  2. WIPES all existing MONEYWISE_WALLET cashbook_entries for the org
 *  3. Rebuilds the cashbook purely from Lenco's transaction log, chronologically
 *  4. Links each cashbook entry to the matching requisition via external_reference
 *  5. Flags any Lenco transactions that have NO matching requisition
 *  6. Verifies the closing balance matches K105.29 to 2 decimal places
 *
 * Usage:
 *   DRY_RUN=true npx ts-node src/scripts/lenco_source_of_truth_reconcile.ts
 *   npx ts-node src/scripts/lenco_source_of_truth_reconcile.ts
 */

import { supabase } from '../lib/supabase';
import { LencoService } from '../services/lenco.service';

const DRY_RUN    = process.env.DRY_RUN === 'true';
const ORG_ID     = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const ACCOUNT_TYPE = 'MONEYWISE_WALLET';
const EXPECTED_CLOSING_BALANCE = 5628.13;

async function retryQuery(fn: () => any, retries = 5, delay = 2000): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const res: any = await fn();
            if (res && res.error) {
                const errMsg = String(res.error.message || '');
                if (errMsg.includes('fetch failed') || errMsg.includes('timeout') || errMsg.includes('ConnectTimeoutError')) {
                    console.warn(`[Supabase Retry] Attempt ${i + 1} returned transient error: ${errMsg}`);
                    if (i === retries - 1) return res;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            return res;
        } catch (err: any) {
            console.warn(`[Supabase Retry] Attempt ${i + 1} threw exception:`, err.message || err);
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Unreachable');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// Fetch ALL pages of Lenco transactions for the subaccount
async function fetchAllLencoTransactions(accountId: string, secretKey: string): Promise<any[]> {
    let allTxns: any[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
        console.log(`  Fetching page ${page}...`);
        const resp = await LencoService.getAccountTransactions(
            accountId,
            { page },
            secretKey
        );

        console.log(`    Page ${page} response keys:`, Object.keys(resp));
        if (resp.meta) console.log(`    Meta:`, JSON.stringify(resp.meta));

        const txns: any[] = resp?.data || resp?.transactions || resp || [];
        if (!Array.isArray(txns) || txns.length === 0) break;

        allTxns = allTxns.concat(txns);
        if (txns.length < pageSize) break; // no more pages
        page++;
        await new Promise(r => setTimeout(r, 300)); // rate-limit politely
    }

    return allTxns;
}

async function main() {
    console.log('='.repeat(72));
    console.log('LENCO SOURCE-OF-TRUTH RECONCILIATION');
    console.log(`Mode: ${DRY_RUN ? '🟡 DRY RUN (no writes)' : '🔴 LIVE'}`);
    console.log(`Expected closing balance: K${EXPECTED_CLOSING_BALANCE}`);
    console.log('='.repeat(72));

    // ── 1. Load org credentials ──────────────────────────────────────────────
    const { data: org, error: orgErr } = await retryQuery(() => supabase
        .from('organizations')
        .select('lenco_subaccount_id, lenco_secret_key')
        .eq('id', ORG_ID)
        .single()
    );

    if (orgErr || !org?.lenco_subaccount_id || !org?.lenco_secret_key) {
        console.error('❌ Cannot load org credentials:', orgErr?.message);
        process.exit(1);
    }

    const { lenco_subaccount_id: subaccountId, lenco_secret_key: secretKey } = org;
    console.log(`\nSubaccount: ${subaccountId}`);

    // ── 2. Fetch live Lenco balance ──────────────────────────────────────────
    console.log('\n📡 Fetching live Lenco balance...');
    const balanceData = await LencoService.getAccountBalance(subaccountId, secretKey);
    const lencoLiveBalance = round2(parseFloat(balanceData?.availableBalance || balanceData?.balance || '0'));
    console.log(`   Lenco live balance: K${lencoLiveBalance}`);

    // ── 3. Fetch all Lenco transactions ───────────────────────────────────────
    console.log('\n📡 Fetching all Lenco transactions...');
    const lencoTxns = await fetchAllLencoTransactions(subaccountId, secretKey);
    console.log(`   Found ${lencoTxns.length} transactions from Lenco.`);

    if (lencoTxns.length === 0) {
        console.error('❌ No transactions returned from Lenco. Aborting.');
        process.exit(1);
    }

    // Sort chronologically (oldest first)
    console.log('\nSample first transaction (after sort):', JSON.stringify(lencoTxns[0], null, 2));
    console.log('Sample last transaction (after sort):', JSON.stringify(lencoTxns[lencoTxns.length - 1], null, 2));
    
    lencoTxns.sort((a, b) => {

        const dateA = new Date(a.datetime || 0).getTime();
        const dateB = new Date(b.datetime || 0).getTime();
        return dateA - dateB;
    });

    console.log('\nFirst 5 transactions (after sort):');
    lencoTxns.slice(0, 5).forEach(t => console.log(`  ${t.datetime} | ${t.type} | K${t.amount} | ${t.narration || t.reference}`));
    console.log('Last 5 transactions (after sort):');
    lencoTxns.slice(-5).forEach(t => console.log(`  ${t.datetime} | ${t.type} | K${t.amount} | ${t.narration || t.reference}`));

    // Check for duplicates by Lenco ID
    const ids = new Set();
    const dups = [];
    for (const t of lencoTxns) {
        const id = t.id || t.transactionId;
        if (ids.has(id)) dups.push(id);
        else ids.add(id);
    }
    if (dups.length > 0) console.log(`\n⚠️  Found ${dups.length} duplicate transaction IDs!`);


    // ── 4. Load all disbursements to build reference → requisition_id map ────
    console.log('\n🔗 Building reference → requisition map...');
    const { data: allDisbursements } = await retryQuery(() => supabase
        .from('disbursements')
        .select('requisition_id, external_reference, organization_id, cashier_id, payment_method, requisitions!inner(organization_id, updated_at, description)')
        .eq('requisitions.organization_id', ORG_ID)
    );

    // Map: external_reference → disbursement record
    const refToDisb = new Map<string, any>();
    // Map: requisition_id (short) → disbursement record
    const reqIdToDisb = new Map<string, any>();

    for (const d of allDisbursements || []) {
        if (d.external_reference) {
            refToDisb.set(d.external_reference.trim().toLowerCase(), d);
        }
        if (d.requisition_id) {
            reqIdToDisb.set(d.requisition_id.slice(0, 8).toLowerCase(), d);
        }
    }
    console.log(`   Loaded ${refToDisb.size} reference(s) and ${reqIdToDisb.size} requisition ID(s) for matching.`);

    // ── 5. Process each Lenco transaction ─────────────────────────────────────
    console.log('\n📋 Processing transactions...\n');

    const START_DATE = '2026-03-18';
    const filteredTxns = lencoTxns.filter(txn => (txn.datetime || '').split('T')[0] >= START_DATE);

    const entriesToInsert: any[] = [];
    const unpaired: any[] = [];
    
    // Add Opening Balance Entry
    if (filteredTxns.length > 0) {
        const first = filteredTxns[0];
        const firstAmt = round2(parseFloat(first.amount || '0'));
        const firstType = (first.type || '').toLowerCase();
        const firstBal = round2(parseFloat(first.balance || '0'));
        const openingBal = firstType === 'credit' ? round2(firstBal - firstAmt) : round2(firstBal + firstAmt);

        console.log(`  🏠 OPENING BALANCE as of ${START_DATE}: K${openingBal.toFixed(2)}`);
        entriesToInsert.push({
            organization_id: ORG_ID,
            account_type:    ACCOUNT_TYPE,
            date:            START_DATE,
            description:     `OPENING BALANCE (Reconciliation as of ${START_DATE})`,
            debit:           0,
            credit:          0,
            balance_after:   openingBal,
            entry_type:      'ADJUSTMENT',
            status:          'ACCOUNTED',
            created_at:      new Date(new Date(first.datetime).getTime() - 1000).toISOString()
        });
    }

    let runningBalanceTracker = entriesToInsert.length > 0 ? entriesToInsert[0].balance_after : 0;
    const usedRequisitionIds = new Set<string>();

    for (const txn of filteredTxns) {
        // Normalize Lenco transaction fields
        const txnDate  = (txn.datetime || '').split('T')[0];
        const txnRef   = (txn.reference || txn.clientReference || '').trim();
        const txnType   = (txn.type || '').toLowerCase(); // 'credit' or 'debit'
        const txnDesc   = txn.narration || txn.description || txn.remarks || '';
        const txnStatus = (txn.status || '').toLowerCase();
        const txnLencoBalance = round2(parseFloat(txn.balance || '0'));

        // Skip failed transactions — they never hit the balance
        if (txnStatus === 'failed' || txnStatus === 'reversed') {
            continue;
        }

        // CRITICAL FIX: The Lenco 'amount' field often only shows the NET amount (excluding fees).
        // To show the ACTUAL deduction in the ledger, we calculate the amount as the 
        // difference between the previous balance and the current balance.
        const txnAmount = Math.abs(round2(txnLencoBalance - runningBalanceTracker));
        runningBalanceTracker = txnLencoBalance;

        // Determine debit/credit for our cashbook (wallet perspective)
        const isInflow   = txnType === 'credit';
        const cashDebit  = isInflow ? txnAmount : 0;
        const cashCredit = isInflow ? 0 : txnAmount;

        // Try to match to a requisition
        let matchedDisb: any = null;
        const refLower = txnRef.toLowerCase();

        // 1. Direct ref match (only if not empty)
        if (refLower && refToDisb.has(refLower)) {
            matchedDisb = refToDisb.get(refLower);
        } 
        // 2. Partial ref match (only if not empty)
        if (!matchedDisb && refLower) {
            for (const [key, disb] of refToDisb.entries()) {
                if (key && (refLower.includes(key) || key.includes(refLower))) {
                    matchedDisb = disb;
                    break;
                }
            }
        }
        // 3. Extract REQ ID from narration/description
        if (!matchedDisb) {
            const reqMatch = txnDesc.match(/#([a-f0-9]{8})/i);
            if (reqMatch) {
                const shortId = reqMatch[1].toLowerCase();
                matchedDisb = reqIdToDisb.get(shortId);
            }
        }

        let requisitionId   = matchedDisb?.requisition_id || null;
        if (requisitionId) {
            if (usedRequisitionIds.has(requisitionId)) {
                console.log(`⚠️  Requisition ${requisitionId.slice(0, 8)} already matched to a prior transaction. Setting requisition_id to null for this entry to avoid unique constraint violation.`);
                requisitionId = null;
            } else {
                usedRequisitionIds.add(requisitionId);
            }
        }
        const cashierId        = matchedDisb?.cashier_id || null;
        const entryType        = isInflow ? 'INFLOW' : 'DISBURSEMENT';
        const entryStatus      = isInflow ? 'COMPLETED' : 'DISBURSED';
        const description      = txnDesc || (isInflow
            ? `Wallet top-up | Ref: ${txnRef}`
            : `${matchedDisb?.payment_method || 'Wallet'} disbursed for Req #${requisitionId?.slice(0, 8) || 'UNKNOWN'} | Ref: ${txnRef}`);

        const entry = {
            organization_id: ORG_ID,
            account_type:    ACCOUNT_TYPE,
            date:            txnDate,
            description,
            debit:           cashDebit,
            credit:          cashCredit,
            balance_after:   txnLencoBalance, // USE LENCO'S TRUTH
            entry_type:      entryType,
            status:          entryStatus,
            requisition_id:  requisitionId,
            created_by:      cashierId,
            created_at:      txn.datetime
        };

        entriesToInsert.push(entry);

        const sign  = isInflow ? `+K${txnAmount.toFixed(2)}` : `-K${txnAmount.toFixed(2)}`;
        const match = requisitionId ? `→ REQ ${requisitionId.slice(0,8)}` : '⚠️  NO MATCH';
        console.log(`  ${txnDate} | ${sign.padStart(12)} | bal: K${txnLencoBalance.toFixed(2).padStart(10)} | ${match}`);
        console.log(`           "${txnDesc.slice(0, 80)}"`);

        if (!requisitionId && !isInflow) {
            unpaired.push({ txnDate, txnRef, txnAmount, txnDesc, txnType });
        }
    }

    // ── 6. Verify closing balance ─────────────────────────────────────────────
    console.log('\n' + '='.repeat(72));
    console.log('CLOSING BALANCE CHECK');
    const finalBalance = entriesToInsert.length > 0 ? entriesToInsert[entriesToInsert.length - 1].balance_after : 0;
    console.log(`  Final ledger balance: K${finalBalance.toFixed(2)}`);
    console.log(`  Expected (Lenco live): K${EXPECTED_CLOSING_BALANCE}`);

    console.log(`  Lenco live API balance:      K${lencoLiveBalance}`);

    const matchesExpected = Math.abs(finalBalance - EXPECTED_CLOSING_BALANCE) < 0.015;
    const matchesLive     = Math.abs(finalBalance - lencoLiveBalance) < 0.015;

    if (matchesExpected) {
        console.log(`  ✅ MATCHES expected closing balance of K${EXPECTED_CLOSING_BALANCE}`);
    } else {
        console.log(`  ⚠️  DOES NOT match expected K${EXPECTED_CLOSING_BALANCE} (diff: K${(finalBalance - EXPECTED_CLOSING_BALANCE).toFixed(2)})`);
        console.log(`     This likely means some transactions in the date range are still missing from Lenco's API response.`);
    }

    // ── 7. Unpaired transactions report ──────────────────────────────────────
    console.log('\n' + '='.repeat(72));
    console.log('LENCO TRANSACTIONS NOT PAIRED TO A REQUISITION:');
    if (unpaired.length === 0) {
        console.log('  ✅ All outflow transactions are paired to a requisition.');
    } else {
        for (const u of unpaired) {
            console.log(`  ⚠️  ${u.txnDate} | -K${u.txnAmount.toFixed(2)} | ${u.txnRef}`);
            console.log(`         "${u.txnDesc}"`);
        }
    }

    // ── 8. Apply to database ──────────────────────────────────────────────────
    console.log('\n' + '='.repeat(72));
    console.log(`Entries to write: ${entriesToInsert.length}`);
    console.log(`Unpaired outflows: ${unpaired.length}`);

    if (DRY_RUN) {
        console.log('\n[DRY RUN] No changes written. Run without DRY_RUN=true to apply.');
        return;
    }

    // Step A: Delete all existing MONEYWISE_WALLET entries for this org
    console.log('\n🗑️  Deleting existing MONEYWISE_WALLET cashbook entries...');
    const { error: deleteErr, count: deletedCount } = await retryQuery(() => supabase
        .from('cashbook_entries')
        .delete({ count: 'exact' })
        .eq('organization_id', ORG_ID)
        .eq('account_type', ACCOUNT_TYPE)
    );

    if (deleteErr) {
        console.error('❌ Failed to delete existing entries:', deleteErr.message);
        process.exit(1);
    }
    console.log(`   Deleted ${deletedCount} existing entries.`);

    // Step B: Insert all entries from Lenco in one batch (split into chunks of 50)
    console.log('📥 Inserting rebuilt cashbook entries...');
    const CHUNK = 50;
    let insertedTotal = 0;
    for (let i = 0; i < entriesToInsert.length; i += CHUNK) {
        const chunk = entriesToInsert.slice(i, i + CHUNK);
        const { error: insertErr, count } = await retryQuery(() => supabase
            .from('cashbook_entries')
            .insert(chunk, { count: 'exact' })
        );

        if (insertErr) {
            console.error(`❌ Insert failed at chunk ${i / CHUNK + 1}:`, insertErr.message);
            // Attempt to continue with next chunk
        } else {
            insertedTotal += count || chunk.length;
            process.stdout.write(`   Inserted ${insertedTotal}/${entriesToInsert.length}...\r`);
        }
    }
    console.log(`\n   ✅ Inserted ${insertedTotal} entries.`);

    // Step C: Final verification — read back the last balance
    const { data: lastEntry } = await retryQuery(() => supabase
        .from('cashbook_entries')
        .select('balance_after, date')
        .eq('organization_id', ORG_ID)
        .eq('account_type', ACCOUNT_TYPE)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    const dbFinalBalance = round2(Number(lastEntry?.balance_after || 0));
    console.log('\n' + '='.repeat(72));
    console.log('FINAL VERIFICATION');
    console.log(`  DB closing balance:   K${dbFinalBalance.toFixed(2)}`);
    console.log(`  Expected balance:     K${EXPECTED_CLOSING_BALANCE}`);
    console.log(`  Lenco live balance:   K${lencoLiveBalance}`);

    if (Math.abs(dbFinalBalance - EXPECTED_CLOSING_BALANCE) < 0.015) {
        console.log(`\n  ✅ RECONCILED — Ledger closing balance matches K${EXPECTED_CLOSING_BALANCE} to 2 decimal places.`);
    } else {
        console.log(`\n  ⚠️  NOT RECONCILED — Diff: K${(dbFinalBalance - EXPECTED_CLOSING_BALANCE).toFixed(2)}`);
        console.log('     Review Lenco transaction log for any missing/additional entries.');
    }
    console.log('='.repeat(72));
}

main()
    .then(() => process.exit(0))
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
