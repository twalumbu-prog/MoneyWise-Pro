import { Response } from 'express';
import { supabase } from '../lib/supabase';

/**
 * Super-admin management of the pre-created wallet pool (see wallet_pool table).
 * Wallets are provisioned here ahead of time; onboarding only ever LINKS them.
 * Secrets are write-only: list responses never include api_secret.
 */

export const listWalletPool = async (_req: any, res: Response): Promise<any> => {
    try {
        const { data, error } = await supabase
            .from('wallet_pool')
            .select('id, provider_account_id, public_key, status, linked_organization_id, linked_at, created_at, organizations:linked_organization_id(name)')
            .order('created_at', { ascending: true });
        if (error) throw error;

        const available = (data || []).filter(w => w.status === 'AVAILABLE').length;
        return res.json({ wallets: data || [], available });
    } catch (error: any) {
        console.error('[Admin WalletPool] list error:', error);
        return res.status(500).json({ error: 'Failed to list wallet pool' });
    }
};

export const addPoolWallet = async (req: any, res: Response): Promise<any> => {
    try {
        const provider_account_id = String(req.body?.provider_account_id || '').trim();
        const api_secret = String(req.body?.api_secret || '').trim();
        const public_key = String(req.body?.public_key || '').trim();

        if (!provider_account_id || !api_secret || !public_key) {
            return res.status(400).json({ error: 'provider_account_id, api_secret and public_key are required' });
        }

        const { data, error } = await supabase
            .from('wallet_pool')
            .insert({ provider_account_id, api_secret, public_key, status: 'AVAILABLE' })
            .select('id, provider_account_id, status, created_at')
            .single();

        if (error) {
            if (error.message?.includes('duplicate') || error.code === '23505') {
                return res.status(409).json({ error: 'A wallet with that provider account ID already exists' });
            }
            throw error;
        }
        return res.status(201).json(data);
    } catch (error: any) {
        console.error('[Admin WalletPool] add error:', error);
        return res.status(500).json({ error: 'Failed to add wallet to pool' });
    }
};

/**
 * Enable/disable a pool wallet. Linked wallets can be DISABLED (stops nothing
 * retroactively, but marks them out of service) — they can never go back to
 * AVAILABLE, because a wallet must never be reused by another organization.
 */
export const updatePoolWallet = async (req: any, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const status = String(req.body?.status || '').trim().toUpperCase();

        if (!['AVAILABLE', 'DISABLED'].includes(status)) {
            return res.status(400).json({ error: 'status must be AVAILABLE or DISABLED' });
        }

        const { data: wallet } = await supabase
            .from('wallet_pool')
            .select('id, status, linked_organization_id')
            .eq('id', id)
            .maybeSingle();
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        // A wallet that has ever been linked belongs to that org forever.
        if (status === 'AVAILABLE' && wallet.linked_organization_id) {
            return res.status(409).json({ error: 'Linked wallets can never be returned to the pool' });
        }

        const { error } = await supabase.from('wallet_pool').update({ status }).eq('id', id);
        if (error) throw error;
        return res.json({ message: 'Wallet updated', status });
    } catch (error: any) {
        console.error('[Admin WalletPool] update error:', error);
        return res.status(500).json({ error: 'Failed to update wallet' });
    }
};

/** Read/update the configurable wallet-activation amount. */
export const getActivationSettings = async (_req: any, res: Response): Promise<any> => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value, description, updated_at')
            .eq('key', 'wallet_activation_amount')
            .maybeSingle();
        if (error) throw error;
        return res.json(data || { value: { amount: 50, currency: 'ZMW' } });
    } catch (error: any) {
        console.error('[Admin WalletPool] settings get error:', error);
        return res.status(500).json({ error: 'Failed to load activation settings' });
    }
};

export const updateActivationSettings = async (req: any, res: Response): Promise<any> => {
    try {
        const amount = Number(req.body?.amount);
        const currency = String(req.body?.currency || 'ZMW').trim().toUpperCase();
        if (isNaN(amount) || amount <= 0 || amount > 1000000) {
            return res.status(400).json({ error: 'amount must be a positive number' });
        }

        const { error } = await supabase.from('app_settings').upsert({
            key: 'wallet_activation_amount',
            value: { amount, currency },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
        if (error) throw error;

        return res.json({ message: 'Activation amount updated', amount, currency });
    } catch (error: any) {
        console.error('[Admin WalletPool] settings update error:', error);
        return res.status(500).json({ error: 'Failed to update activation settings' });
    }
};
