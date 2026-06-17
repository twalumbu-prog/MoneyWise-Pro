import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { ledgerService } from './ledger.service';

/**
 * Flip a one-time payment link tied to this collection reference to PAID so it
 * auto-deactivates after the first successful payment. No-op for non-link sales.
 */
export async function markPaymentLinkPaid(orgId: string, reference: string): Promise<void> {
    try {
        const { error } = await supabase
            .from('payment_links')
            .update({ status: 'PAID', paid_at: new Date().toISOString() })
            .eq('organization_id', orgId)
            .eq('reference', reference)
            .eq('status', 'ACTIVE');
        if (error) {
            console.error(`[ProductRouting] Failed to mark payment link PAID for ref ${reference}:`, error.message);
        }
    } catch (err: any) {
        console.error(`[ProductRouting] markPaymentLinkPaid error for ref ${reference}:`, err.message);
    }
}

/**
 * Route a finalized product sale's revenue to each product's mapped destination
 * wallet and income account. The single finalized inflow is split into one cashbook
 * entry per (wallet, income_account) group: the largest group keeps the original
 * (primary) entry; the rest become sibling INFLOWs with a `::gN` reference suffix.
 * Because the GL posting engine derives each journal from a single cashbook entry's
 * own wallet_id + account_id, this split yields correct per-wallet balances and
 * per-income-account revenue postings with no change to the ledger engine.
 *
 * A group with no mapped income account leaves account_id null so the existing AI
 * sweep still classifies that slice. Idempotent: a no-op once siblings exist or when
 * there is nothing to split.
 */
export async function applyProductRevenueRouting(orgId: string, reference: string): Promise<void> {
    try {
        // Already split on a prior run? Sibling entries carry a `::g` suffix.
        const { data: existingSiblings } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('organization_id', orgId)
            .like('external_reference', `${reference}::g%`)
            .limit(1);
        if (existingSiblings && existingSiblings.length > 0) return;

        // The finalized primary inflow for this reference.
        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('id, wallet_id, account_id, debit, date, description, created_at, account_type, status')
            .eq('organization_id', orgId)
            .eq('external_reference', reference)
            .eq('entry_type', 'INFLOW')
            .neq('status', 'PENDING')
            .maybeSingle();
        if (!entry) return;

        const { data: sales } = await supabase
            .from('product_sales')
            .select('amount_paid, products(wallet_id, income_account_id)')
            .eq('organization_id', orgId)
            .eq('reference', reference);
        if (!sales || sales.length === 0) return;

        // Group by (destination wallet, income account). Missing wallet ⇒ the entry's
        // existing wallet; missing income account ⇒ null (AI fallback preserved).
        const defaultWallet: string | null = entry.wallet_id;
        const groups = new Map<string, { wallet_id: string | null; account_id: string | null; amount: number }>();
        for (const s of sales as any[]) {
            const w: string | null = s.products?.wallet_id || defaultWallet;
            const a: string | null = s.products?.income_account_id || null;
            const key = `${w || 'NULL'}::${a || 'NULL'}`;
            const g = groups.get(key) || { wallet_id: w, account_id: a, amount: 0 };
            g.amount += Number(s.amount_paid || 0);
            groups.set(key, g);
        }

        const groupList = [...groups.values()].sort((x, y) => y.amount - x.amount);

        // Single group that changes nothing (same wallet, no income mapping) → leave as-is.
        if (groupList.length === 1 &&
            groupList[0].account_id === null &&
            groupList[0].wallet_id === entry.wallet_id) {
            return;
        }

        const primary = groupList[0];
        const oldWallet = entry.wallet_id;
        const affectedWallets = new Set<string>();
        const entriesToRepost: string[] = [entry.id];
        if (oldWallet) affectedWallets.add(oldWallet);

        // Re-point the primary entry to the largest group.
        const primaryUpdate: any = {
            wallet_id: primary.wallet_id,
            debit: primary.amount,
            account_id: primary.account_id
        };
        // A mapped income account is deterministic → mark ACCOUNTED so the AI sweep
        // leaves it alone; otherwise keep the existing status for AI classification.
        if (primary.account_id) primaryUpdate.status = 'ACCOUNTED';
        await supabase.from('cashbook_entries').update(primaryUpdate).eq('id', entry.id);
        if (primary.wallet_id) affectedWallets.add(primary.wallet_id);

        // Sibling entries for the remaining groups.
        for (let i = 1; i < groupList.length; i++) {
            const g = groupList[i];
            const { data: refNum } = await supabase.rpc('generate_sequential_reference', {
                p_org_id: orgId,
                p_entity_type: 'INFLOW',
                p_prefix: 'REC'
            });
            const { data: sibling, error: sibErr } = await supabase
                .from('cashbook_entries')
                .insert({
                    organization_id: orgId,
                    entry_type: 'INFLOW',
                    account_type: entry.account_type || 'MONEYWISE_WALLET',
                    description: entry.description,
                    debit: g.amount,
                    credit: 0,
                    balance_after: 0,
                    date: entry.date,
                    status: g.account_id ? 'ACCOUNTED' : 'COMPLETED',
                    wallet_id: g.wallet_id,
                    account_id: g.account_id,
                    external_reference: `${reference}::g${i + 1}`,
                    reference_number: refNum
                })
                .select('id')
                .single();
            if (sibErr) {
                console.error(`[ProductRouting] Failed to create split inflow for ref ${reference}:`, sibErr.message);
                continue;
            }
            if (sibling?.id) entriesToRepost.push(sibling.id);
            if (g.wallet_id) affectedWallets.add(g.wallet_id);
        }

        // Recalculate running balances for every wallet touched.
        for (const w of affectedWallets) {
            await cashbookService.recalculateBalancesFrom(
                orgId,
                entry.date,
                entry.created_at,
                entry.account_type || 'MONEYWISE_WALLET',
                w
            );
        }

        // (Re)post each affected entry's GL journal (primary debit/account changed; siblings are new).
        for (const id of entriesToRepost) {
            await ledgerService.repostForCashbookEntry(id);
        }
    } catch (err: any) {
        console.error(`[ProductRouting] applyProductRevenueRouting failed for ref ${reference}:`, err.message);
    }
}
