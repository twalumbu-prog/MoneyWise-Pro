import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';

/**
 * Real (non-demo) investment targets shown at the top of the Invest feature.
 * Each row is a real organization + wallet that can receive actual money via
 * mobile money (existing wallet-scoped Lenco collection endpoints, unchanged)
 * or an internal MoneyWise wallet-to-wallet transfer (walletTransferToTarget
 * below).
 */
export const listInvestmentTargets = async (req: any, res: any): Promise<any> => {
    try {
        const { data, error } = await supabase
            .from('investment_targets')
            .select('id, organization_id, wallet_id, display_name, category, description, logo_url, priority')
            .eq('is_active', true)
            .order('priority', { ascending: true });

        if (error) throw error;

        res.json((data || []).map((t) => ({
            id: t.id,
            organizationId: t.organization_id,
            walletId: t.wallet_id,
            displayName: t.display_name,
            category: t.category,
            description: t.description,
            logoUrl: t.logo_url,
        })));
    } catch (error: any) {
        console.error('Error listing investment targets:', error);
        res.status(500).json({ error: 'Failed to load investment targets', details: error.message });
    }
};

/**
 * Moves real ledger funds from the caller's own wallet into a real investment
 * target's wallet — the "MoneyWise wallet" funding method on the Invest page.
 * Mirrors transferSubwalletFunds (cashbook.controller.ts), except the two
 * paired cashbook entries land in two DIFFERENT organizations rather than one.
 * The destination must be a row in investment_targets (never an arbitrary
 * org/wallet id supplied by the client) so this can't be used as a general
 * cross-tenant transfer primitive.
 */
export const walletTransferToInvestmentTarget = async (req: any, res: any): Promise<any> => {
    try {
        const { sourceWalletId, targetId, amount, description } = req.body;
        const organizationId = (req as any).user.organization_id;
        const userId = (req as any).user.id;

        if (!sourceWalletId || !targetId || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Source wallet, investment target, and a valid amount are required' });
        }
        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const { data: target, error: targetError } = await supabase
            .from('investment_targets')
            .select('organization_id, wallet_id, display_name')
            .eq('id', targetId)
            .eq('is_active', true)
            .single();

        if (targetError || !target) {
            return res.status(404).json({ error: 'Investment target not found' });
        }
        if (target.organization_id === organizationId) {
            return res.status(400).json({ error: 'Cannot invest into your own organization' });
        }

        const { data: sourceWallet, error: sourceWalletError } = await supabase
            .from('organization_wallets')
            .select('id, name')
            .eq('id', sourceWalletId)
            .eq('organization_id', organizationId)
            .single();

        if (sourceWalletError || !sourceWallet) {
            return res.status(404).json({ error: 'Source wallet not found' });
        }

        const sourceBalance = await cashbookService.getCurrentBalance(organizationId, 'MONEYWISE_WALLET', sourceWalletId);
        if (sourceBalance < amount) {
            return res.status(400).json({ error: `Insufficient funds in ${sourceWallet.name}. Available: K${sourceBalance.toFixed(2)}` });
        }

        const transferDesc = description || `Investment: ${sourceWallet.name} ➜ ${target.display_name}`;
        const today = new Date().toISOString().split('T')[0];

        const outflowEntry = await cashbookService.createEntry(organizationId, {
            entry_type: 'ADJUSTMENT',
            description: `${transferDesc} (Outflow)`,
            debit: 0,
            credit: amount,
            date: today,
            created_by: userId,
            account_type: 'MONEYWISE_WALLET',
            wallet_id: sourceWalletId,
            status: 'COMPLETED',
        } as any);

        const inflowEntry = await cashbookService.createEntry(target.organization_id, {
            entry_type: 'ADJUSTMENT',
            description: `${transferDesc} (Inflow)`,
            debit: amount,
            credit: 0,
            date: today,
            created_by: userId,
            account_type: 'MONEYWISE_WALLET',
            wallet_id: target.wallet_id,
            status: 'COMPLETED',
        } as any);

        res.json({
            message: 'Investment transfer completed successfully',
            outflowEntryId: outflowEntry.id,
            inflowEntryId: inflowEntry.id,
        });
    } catch (error: any) {
        console.error('Error transferring investment funds:', error);
        res.status(500).json({ error: 'Failed to transfer funds', details: error.message });
    }
};
