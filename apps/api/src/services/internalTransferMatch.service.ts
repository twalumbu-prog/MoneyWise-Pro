/**
 * internalTransferMatch.service.ts — keeps the Lenco sync from logging a wallet-to-wallet transfer twice.
 *
 * Investments (INVW-) and group-savings contributions (SVT-) are real Lenco on-us transfers that we book
 * ourselves the moment Lenco confirms them, tagging both ledger rows with OUR reference. Lenco reports
 * the same movement under its own transaction id, so the sync saw an unknown transaction and logged it a
 * second time: the company's wallet showed the money twice and the forward-to-bank automation paid it
 * out twice.
 *
 * Here the sync asks first: "is this a transfer we already booked?" The pairing is remembered in
 * app_settings (one marker per Lenco transaction, one per ledger row) so each ledger row absorbs exactly
 * one Lenco transaction and a repeat sync stays a no-op.
 */
import { supabase } from '../lib/supabase';

const TXN_KEY = (txnId: string) => `onus_txn:${txnId}`;
const ENTRY_KEY = (entryId: string) => `onus_entry:${entryId}`;

export async function matchesRecordedInternalTransfer(
    orgId: string,
    walletId: string,
    txn: { id: string; type: 'credit' | 'debit' | string; amount: number; date: string },
): Promise<boolean> {
    try {
        if (!txn.id || !(txn.amount > 0)) return false;

        const { data: seen } = await supabase.from('app_settings').select('key').eq('key', TXN_KEY(txn.id)).maybeSingle();
        if (seen) return true;

        const amountCol = txn.type === 'credit' ? 'debit' : 'credit';
        const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: rows } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('organization_id', orgId)
            .eq('wallet_id', walletId)
            .eq('account_type', 'MONEYWISE_WALLET')
            .or('external_reference.like.INVW-%,external_reference.like.SVT-%')
            .gte(amountCol, txn.amount - 0.01)
            .lte(amountCol, txn.amount + 0.01)
            .gt(txn.type === 'credit' ? 'debit' : 'credit', 0)
            .gte('created_at', since)
            .order('created_at', { ascending: true })
            .limit(10);
        if (!rows?.length) return false;

        const { data: used } = await supabase.from('app_settings').select('key').in('key', rows.map(r => ENTRY_KEY(r.id)));
        const usedKeys = new Set((used ?? []).map(u => u.key));
        const free = rows.find(r => !usedKeys.has(ENTRY_KEY(r.id)));
        if (!free) return false;

        const now = new Date().toISOString();
        const { error } = await supabase.from('app_settings').insert([
            { key: ENTRY_KEY(free.id), value: { txnId: txn.id }, description: 'Ledger row already represents this Lenco on-us transfer.', updated_at: now },
            { key: TXN_KEY(txn.id), value: { entryId: free.id }, description: 'Lenco transaction already booked as a ledger row.', updated_at: now },
        ]);
        if (error) {
            // Lost a race to another sync run that paired the same row: the transaction is covered either way.
            return (error as any).code === '23505';
        }
        console.log(`[Lenco Sync] Txn ${txn.id} is the on-us transfer already booked as entry ${free.id.slice(0, 8)}; not logging it again.`);
        return true;
    } catch (err: any) {
        console.error('[Lenco Sync] internal transfer match failed (continuing normally):', err.message);
        return false;
    }
}
