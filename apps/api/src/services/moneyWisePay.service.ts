/**
 * moneyWisePay.service.ts — a MoneyWise user paying another MoneyWise user ("MoneyWise Pay").
 *
 * Every MoneyWise organization has its own Lenco account, so a MoneyWise-to-MoneyWise payment is a REAL Lenco
 * on-us transfer between two Lenco accounts (POST /transfers/lenco-merchant: source account + the recipient's till
 * number). Until 2026-10 this path only wrote ledger rows — an inflow in the recipient's books and a debit in the
 * sender's — and never asked Lenco to move the money. The books said K100 had moved; in Lenco it had not, so the
 * recipient saw a balance that wasn't there and their next payout was rejected for insufficient funds.
 *
 * Now: (1) check the sender really has the money at Lenco, (2) have Lenco move it, (3) wait for Lenco to confirm,
 * (4) only then book the recipient's inflow (see creditRecipient, called from the same confirmation point as every
 * other wallet payout). A failed transfer books nothing and the requisition returns to AUTHORISED, as for any payout.
 */
import { supabase } from '../lib/supabase';
import { LencoService } from './lenco.service';
import { ensureValidLencoAccountId } from './lencoAccountLink.service';
import { cashbookService } from './cashbook.service';

const LENCO_ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const memoKey = (ref: string) => `mwpay:${ref}`;

export interface OnUsResult {
    status: 'successful' | 'pending';
    reference: string;
    fee: number;
    at?: string;
    senderKey?: string;
    simulated?: boolean;
}

async function orgLenco(orgId: string) {
    const { data } = await supabase.from('organizations')
        .select('name, lenco_subaccount_id, lenco_secret_key, payment_test_mode').eq('id', orgId).maybeSingle();
    const row: any = data || {};
    let accountId = String(row.lenco_subaccount_id || '');
    // Some organizations were linked with a till number in place of the account id; repair on the spot when it is safe to.
    if (!LENCO_ACCOUNT_ID.test(accountId)) {
        const fixed = await ensureValidLencoAccountId(orgId).catch(() => ({ ok: false } as any));
        if (fixed?.ok) accountId = fixed.accountId;
    }
    return { name: row.name as string | undefined, accountId, key: (row.lenco_secret_key as string | undefined) || undefined, testMode: !!row.payment_test_mode };
}

export const moneyWisePayService = {
    /**
     * Moves `amount` from the sender's Lenco account to the recipient's, and waits (briefly) for Lenco to confirm.
     * Throws on anything that means the money did not move, so the caller can reset the requisition for a retry.
     */
    async sendOnUs(p: { senderOrgId: string; recipientOrgId: string; amount: number; requisitionId: string; narration?: string }): Promise<OnUsResult> {
        const baseRef = `MWPAY-${p.requisitionId.slice(0, 8)}`;
        const sender = await orgLenco(p.senderOrgId);
        const recipient = await orgLenco(p.recipientOrgId);

        // Organizations in payment test mode never touch real money.
        if (sender.testMode) return { status: 'successful', reference: `${baseRef}-SIM`, fee: 0, simulated: true };

        if (!LENCO_ACCOUNT_ID.test(sender.accountId)) throw new Error('Your wallet isn’t fully connected for transfers yet. Please contact support.');
        if (!LENCO_ACCOUNT_ID.test(recipient.accountId)) throw new Error('This person’s wallet can’t receive MoneyWise payments yet.');

        // The money must really be at Lenco, not just on the ledger (that gap is what made the old flow possible).
        const real = await LencoService.getAccountBalance(sender.accountId, sender.key).catch(() => null);
        const available = Number(real?.availableBalance ?? real?.balance ?? NaN);
        if (Number.isFinite(available) && available + 0.005 < p.amount) {
            throw new Error(`Your wallet doesn’t have K${p.amount.toFixed(2)} available at the moment (K${Math.max(0, available).toFixed(2)} available).`);
        }

        const details = await LencoService.getAccountDetails(recipient.accountId, recipient.key).catch(() => null);
        const till = details?.details?.tillNumber ? String(details.details.tillNumber) : '';
        if (!till) throw new Error('This person’s wallet can’t receive a MoneyWise payment right now. Please try again later.');

        // Retry-safe reference: reuse a transfer already made for this requisition unless it failed.
        let reference = baseRef;
        let existing: any = null;
        for (let i = 0; i < 10; i++) {
            reference = i === 0 ? baseRef : `${baseRef}-R${i}`;
            existing = await LencoService.getTransferStatus(reference, sender.key);
            if (!existing || String(existing.status).toLowerCase() !== 'failed') break;
        }

        let transfer: any = existing;
        if (!existing) {
            transfer = await LencoService.transferToLencoMerchant(
                { amount: p.amount, reference, tillNumber: till, narration: (p.narration || 'MoneyWise Pay').slice(0, 60) },
                sender.accountId, sender.key,
            );
        }

        // On-us transfers normally settle in seconds.
        let status = String(transfer?.status || 'pending').toLowerCase();
        let latest = transfer;
        for (let i = 0; i < 6 && status !== 'successful' && status !== 'failed'; i++) {
            await sleep(1500);
            latest = (await LencoService.getTransferStatus(reference, sender.key).catch(() => null)) || latest;
            status = String(latest?.status || 'pending').toLowerCase();
        }
        if (status === 'failed' || status === 'declined' || status === 'rejected') {
            throw new Error(latest?.reasonForFailure || latest?.message || 'Lenco could not complete the transfer. Nothing was taken.');
        }
        return {
            status: status === 'successful' ? 'successful' : 'pending',
            reference,
            fee: latest?.fee ? parseFloat(latest.fee) : 0,
            at: latest?.completedAt || latest?.initiatedAt || latest?.createdAt,
            senderKey: sender.key,
        };
    },

    /** Remember who to credit once Lenco confirms (kept in app_settings; no schema change needed). */
    async remember(reference: string, memo: { recipientOrgId: string; senderName: string; amount: number }) {
        await supabase.from('app_settings').upsert(
            { key: memoKey(reference), value: memo, description: 'Pending MoneyWise Pay payment awaiting Lenco confirmation (safe to delete once settled).', updated_at: new Date().toISOString() },
            { onConflict: 'key' },
        );
    },

    /**
     * Books the recipient's inflow for a MoneyWise Pay payment. Idempotent, and only ever called once Lenco has
     * confirmed the transfer (it runs from the shared "wallet payout confirmed" point, finalizeWalletDisbursementLedger).
     * Both ledger rows carry the transfer reference so the 5-minute Lenco sync recognises them instead of logging
     * the same movement a second time.
     */
    async creditRecipient(requisitionId: string): Promise<void> {
        const { data: d } = await supabase.from('disbursements')
            .select('organization_id, payment_method, external_reference, requisition_id')
            .eq('requisition_id', requisitionId).maybeSingle();
        const ref = (d as any)?.external_reference as string | undefined;
        if (!d || (d as any).payment_method !== 'MONEYWISE_PAY' || !ref || !ref.startsWith('MWPAY-')) return;

        const { data: memoRow } = await supabase.from('app_settings').select('value').eq('key', memoKey(ref)).maybeSingle();
        const memo: any = memoRow?.value;
        if (!memo?.recipientOrgId) return; // an older payment from before this flow existed: nothing to credit

        const { data: already } = await supabase.from('cashbook_entries').select('id')
            .eq('organization_id', memo.recipientOrgId).eq('external_reference', ref).limit(1);
        if (already && already.length > 0) return;

        const { data: recWallet } = await supabase.from('organization_wallets').select('id')
            .eq('organization_id', memo.recipientOrgId).eq('is_main', true).maybeSingle();

        await cashbookService.createEntry(memo.recipientOrgId, {
            entry_type: 'INFLOW',
            account_type: 'MONEYWISE_WALLET',
            wallet_id: recWallet?.id || null,
            debit: Number(memo.amount),
            credit: 0,
            description: `MoneyWise Pay from ${memo.senderName || 'a MoneyWise user'}`,
            reference_number: ref,
            external_reference: ref,
            sender_name: memo.senderName || null,
            date: new Date().toISOString().split('T')[0],
            status: 'COMPLETED',
        } as any);

        // Tag the sender's own outflow with the same reference so the sync pairs Lenco's debit with it.
        await supabase.from('cashbook_entries').update({ external_reference: ref })
            .eq('organization_id', (d as any).organization_id).eq('requisition_id', requisitionId)
            .eq('entry_type', 'DISBURSEMENT').is('external_reference', null);

        console.log(`[MoneyWise Pay] K${memo.amount} credited to ${memo.recipientOrgId} after Lenco confirmed ${ref}.`);
    },
};
