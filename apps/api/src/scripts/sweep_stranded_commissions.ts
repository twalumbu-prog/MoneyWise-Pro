import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env BEFORE other imports
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { LencoService } from '../services/lenco.service';
import { supabase } from '../lib/supabase';
import { calculatePlatformFee } from '../utils/platformFee';

/**
 * One-off remediation (2026-06-12, owner-approved): forward the MoneyWise
 * platform commission for public sales that the webhook never processed.
 *
 * These payments were recovered into the ledger by the periodic sync, but the
 * commission sweep only runs in the webhook path, so the customer-paid fee was
 * never forwarded to the settlement merchant (Blue Opus) and is still sitting
 * in the collecting sub-account.
 *
 * Uses the exact same convention as sweepPlatformCommission in the webhook:
 *   - reference `SPLIT-<originalRef>` (deterministic → idempotent; the
 *     Amatoasts sync skips this debit leg by SPLIT-/narration guard, and the
 *     Blue Opus sync logs + categorizes the credit leg)
 *   - narration 'Split payment'
 *   - skip if a transfer with that reference already exists
 */

const ORG_ID = 'a98fa5d9-903c-4ec0-b343-dc5de49426a2'; // Amatoasts
const SETTLEMENT_TILL_NUMBER = process.env.MONEYWISE_SETTLEMENT_TILL_NUMBER || '9838830';

// Approved scope: the six webhook-missed sales reported on 2026-06-12 (K14.65).
const SWEEPS: { ref: string; subtotal: number; label: string }[] = [
    { ref: 'DEP-1781251269899-fd6ca760-PUB', subtotal: 85, label: 'CR-2026-0033 Natasha Chisanga' },
    { ref: 'DEP-1781253501546-fd6ca760-PUB', subtotal: 85, label: 'CR-2026-0036 conelious/Luyando Nabanyama' },
    { ref: 'DEP-1781265909291-fd6ca760-PUB', subtotal: 85, label: 'CR-2026-0046 Ngao Mutambo' },
    { ref: 'DEP-1781267213224-fd6ca760-PUB', subtotal: 85, label: 'CR-2026-0048 Austin chama/Douglas Mbewe' },
    { ref: 'DEP-1781267841593-fd6ca760-PUB', subtotal: 85, label: 'CR-2026-0049 Melody Mushela' },
    { ref: 'DEP-1781269935108-fd6ca760-PUB', subtotal: 200, label: 'CR-2026-0051 Jemi Bezos/Phiri Gibson' },
];

// Check-only (not approved for transfer in this run): Asaf Mvula's recovered
// June-11 payment, REC-2026-0038. Report its sweep status for a decision.
const CHECK_ONLY: { ref: string; subtotal: number; label: string }[] = [
    { ref: 'DEP-1781195511889-fd6ca760-PUB', subtotal: 200, label: 'REC-2026-0038 Asaf Mvula (check only)' },
];

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log(`--- Stranded commission sweep ${DRY_RUN ? '(DRY RUN)' : ''} ---`);

    const { data: org, error } = await supabase
        .from('organizations')
        .select('name, lenco_subaccount_id, lenco_secret_key')
        .eq('id', ORG_ID)
        .single();

    if (error || !org?.lenco_subaccount_id) {
        throw new Error(`Failed to load org credentials: ${error?.message || 'no subaccount'}`);
    }
    const secretKey = org.lenco_secret_key || process.env.LENCO_SECRET_KEY;
    if (!secretKey) throw new Error('No Lenco secret key available');

    const balBefore = await LencoService.getAccountBalance(org.lenco_subaccount_id, secretKey);
    console.log(`Org: ${org.name} | Subaccount: ${org.lenco_subaccount_id}`);
    console.log(`Balance before: ${JSON.stringify(balBefore?.availableBalance ?? balBefore?.balance)}`);

    let totalSwept = 0;

    for (const item of [...SWEEPS, ...CHECK_ONLY]) {
        const isCheckOnly = CHECK_ONLY.includes(item);
        const splitRef = `SPLIT-${item.ref}`;
        const fee = calculatePlatformFee(item.subtotal);

        // Idempotency guard — identical to sweepPlatformCommission
        let existing: any = null;
        try {
            existing = await LencoService.getTransferStatus(splitRef, secretKey);
        } catch (_) {
            existing = null; // not found → safe to send
        }

        if (existing) {
            console.log(`SKIP   ${item.label}: transfer already exists (${splitRef}, status: ${existing.status || 'unknown'})`);
            continue;
        }

        if (isCheckOnly) {
            console.log(`CHECK  ${item.label}: NO sweep found for ${splitRef} — fee K${fee.toFixed(2)} still stranded (not transferring in this run).`);
            continue;
        }

        if (DRY_RUN) {
            console.log(`WOULD  ${item.label}: transfer K${fee.toFixed(2)} → till ${SETTLEMENT_TILL_NUMBER} (ref ${splitRef})`);
            totalSwept += fee;
            continue;
        }

        const result = await LencoService.transferToLencoMerchant({
            amount: fee,
            reference: splitRef,
            tillNumber: SETTLEMENT_TILL_NUMBER,
            narration: 'Split payment'
        }, org.lenco_subaccount_id, secretKey);

        totalSwept += fee;
        console.log(`SWEPT  ${item.label}: K${fee.toFixed(2)} → till ${SETTLEMENT_TILL_NUMBER} (ref ${splitRef}, status: ${result?.status || 'submitted'})`);
    }

    console.log(`--- Total ${DRY_RUN ? 'to sweep' : 'swept'}: K${totalSwept.toFixed(2)} ---`);

    if (!DRY_RUN) {
        const balAfter = await LencoService.getAccountBalance(org.lenco_subaccount_id, secretKey);
        console.log(`Balance after: ${JSON.stringify(balAfter?.availableBalance ?? balAfter?.balance)}`);
    }
}

main().then(() => process.exit(0)).catch((err) => {
    console.error('Sweep failed:', err.message);
    process.exit(1);
});
