import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { QuickBooksService } from '../services/quickbooks.service';
import { supabase } from '../lib/supabase';

export const connectQuickBooks = async (req: Request, res: Response) => {
    try {
        const url = QuickBooksService.getAuthUrl();
        res.json({ url });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const quickBooksCallback = async (req: Request, res: Response) => {
    const { code, realmId } = req.query;

    if (!code || !realmId) {
        return res.status(400).json({ error: 'Missing code or realmId' });
    }

    try {
        await QuickBooksService.exchangeCodeForToken(code as string, realmId as string);
        // Redirect back to frontend settings page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/settings?tab=integrations&status=success`);
    } catch (error: any) {
        console.error('[QB Callback Error]', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/settings?tab=integrations&status=error&message=${encodeURIComponent(error.message)}`);
    }
};

export const getIntegrationStatus = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('integrations')
            .select('provider, token_expires_at, updated_at, realm_id')
            .eq('provider', 'QUICKBOOKS')
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json({
            connected: !!data,
            details: data || null
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getQuickBooksAccounts = async (req: Request, res: Response) => {
    try {
        const accounts = await QuickBooksService.fetchAccounts();
        res.json(accounts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const disconnectQuickBooks = async (req: Request, res: Response) => {
    try {
        const { error } = await supabase
            .from('integrations')
            .delete()
            .eq('provider', 'QUICKBOOKS');

        if (error) throw error;
        res.json({ message: 'Disconnected successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const syncRequisition = async (req: Request, res: Response) => {
    const { id } = req.params;
    // req.user is populated by requireAuth middleware
    const userId = (req as any).user?.id;

    try {
        await QuickBooksService.createExpense(id, userId);
        res.json({ message: 'Sync initiated' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
