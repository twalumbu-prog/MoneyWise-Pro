import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { QuickBooksService } from '../services/quickbooks.service';
import { supabase } from '../lib/supabase';

export const connectQuickBooks = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = (req as any).user.organization_id;
        const url = QuickBooksService.getAuthUrl(organizationId);
        res.json({ url });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const quickBooksCallback = async (req: Request, res: Response) => {
    const { code, realmId, state, error } = req.query;

    if (error) {
        return res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&status=error&message=${error}`);
    }

    if (!state || typeof state !== 'string') {
        return res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&status=error&message=Invalid state`);
    }

    // Parse organizationId from state "org:UUID"
    const [prefix, organizationId] = state.split(':');
    if (prefix !== 'org' || !organizationId) {
        return res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&status=error&message=Invalid state format`);
    }

    try {
        await QuickBooksService.exchangeCodeForToken(code as string, realmId as string, organizationId);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/settings?tab=integrations&status=success`);
    } catch (error: any) {
        console.error('[QB Callback Error]', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/settings?tab=integrations&status=error&message=${encodeURIComponent(error.message)}`);
    }
};

export const getIntegrationStatus = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = (req as any).user.organization_id;

        const { data, error } = await supabase
            .from('integrations')
            .select('provider, updated_at, token_expires_at')
            .eq('provider', 'QUICKBOOKS')
            .eq('organization_id', organizationId)
            .single();

        if (error || !data) {
            return res.json({ connected: false });
        }
        res.json({ connected: true, ...data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getQuickBooksAccounts = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = (req as any).user.organization_id;
        const accounts = await QuickBooksService.fetchAccounts(organizationId);
        res.json(accounts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const disconnectQuickBooks = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = (req as any).user.organization_id;

        const { error } = await supabase
            .from('integrations')
            .delete()
            .eq('provider', 'QUICKBOOKS')
            .eq('organization_id', organizationId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const syncRequisition = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        const result = await QuickBooksService.createExpense(id, userId, organizationId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
