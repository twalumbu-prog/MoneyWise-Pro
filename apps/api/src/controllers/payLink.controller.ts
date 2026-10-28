import { Request, Response } from 'express';
import { payLinkService, PayLinkError } from '../services/payLink.service';

const user = (req: Request) => (req as any).user as { id: string; organization_id: string; role: string };

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof PayLinkError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[PayLink] ${what}:`, e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

/** Who a pay link pays, how much, whether it can be paid here, and the payer's wallets with balances. */
export const resolvePayTarget = async (req: Request, res: Response) => {
    try {
        const { token, username } = req.query as { token?: string; username?: string };
        if (!token && !username) return res.status(400).json({ error: 'token or username is required' });
        res.json(await payLinkService.resolvePayTarget(user(req).organization_id, { token, username }));
    } catch (e) { fail(res, e, 'open this link'); }
};

/** Pay a pay link from one of the payer's wallets. */
export const payWithWallet = async (req: Request, res: Response) => {
    try {
        const u = user(req);
        const { token, username, amount, purpose, walletId } = req.body ?? {};
        if (!token && !username) return res.status(400).json({ error: 'token or username is required' });
        res.json(await payLinkService.payWithWallet(
            { organizationId: u.organization_id, userId: u.id, role: u.role, today: new Date().toISOString().split('T')[0] },
            { token, username, amount, purpose, walletId },
        ));
    } catch (e) { fail(res, e, 'make the payment'); }
};
