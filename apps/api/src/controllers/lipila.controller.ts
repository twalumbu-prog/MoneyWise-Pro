import { Request, Response } from 'express';
import * as lipila from '../services/lipila.service';

/** Where Lipila should call back: the public address of this API (API_PUBLIC_URL), or the address this request came in on. */
const apiBase = (req: Request): string | null => {
    if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL;
    const host = req.get('x-forwarded-host') || req.get('host');
    return host ? `${req.get('x-forwarded-proto') || req.protocol}://${host}` : null;
};

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof lipila.LipilaError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Lipila] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

/* ── Customers (public) ── */

/** POST /lipila/public/card  Starts a card payment for a sale the checkout has already recorded. Returns the card page to open. */
export const initiate = async (req: Request, res: Response) => {
    try {
        const b = req.body ?? {};
        const r = await lipila.initiateCard({
            organizationId: String(b.organizationId ?? ''), reference: String(b.reference ?? ''), apiBase: apiBase(req), returnUrl: typeof b.returnUrl === 'string' ? b.returnUrl.slice(0, 300) : undefined,
            customer: { firstName: b.firstName, lastName: b.lastName, email: b.email, phone: b.phone }, context: { kind: b.kind ?? null, token: b.token ?? null },
        });
        res.json({ success: true, ...r });
    } catch (e) { fail(res, e, 'start the card payment'); }
};

/** POST /lipila/deposit  A signed-in member tops up the business's card wallet by card. Returns the card page to open. */
export const deposit = async (req: any, res: Response) => {
    try {
        const org = req.user?.organization_id; if (!org) return res.status(400).json({ error: 'No account on this sign-in.' });
        const b = req.body ?? {};
        const name = String(req.user?.name ?? '').trim().split(/\s+/);
        const r = await lipila.initiateDeposit({
            organizationId: org, userId: req.user.id, amount: b.amount, apiBase: apiBase(req), returnUrl: typeof b.returnUrl === 'string' ? b.returnUrl.slice(0, 300) : undefined,
            customer: { firstName: name[0] || undefined, lastName: name.slice(1).join(' ') || undefined, email: req.user?.email || undefined, phone: b.phone },
        });
        res.json({ success: true, ...r });
    } catch (e) { fail(res, e, 'start the card deposit'); }
};

/** GET /lipila/public/status/:reference  The outcome (asks Lipila, and records the payment the first time it is confirmed). */
export const status = async (req: Request, res: Response) => {
    try {
        const o = await lipila.finalizeCard(req.params.reference);
        if (o.state === 'successful') return res.json({ verified: true, status: 'COMPLETED', source: 'lipila', referenceNumber: o.referenceNumber ?? null });
        if (o.state === 'failed') return res.json({ verified: false, status: 'failed', reasonCode: 'CARD_DECLINED', message: o.message });
        return res.json({ verified: false, status: 'pending', message: o.message ?? 'Waiting for the card payment.' });
    } catch (e) { fail(res, e, 'check the card payment'); }
};

/* ── Lipila calling us ── */

/** POST /webhooks/lipila  Signed. Only a signal to check: the answer comes from Lipila's status API. */
export const webhook = async (req: Request, res: Response) => {
    try {
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
        const v = await lipila.verifyWebhook(raw, req.headers as any);
        if (!v.ok) return res.status(401).send('Invalid signature');
        if (v.reference) {
            // Awaited before the answer: a serverless function may be stopped once it has replied.
            await lipila.finalizeCard(v.reference).catch((e) => console.error('[Lipila] webhook finalize failed:', e?.message));
        }
        return res.json({ received: true });
    } catch (e) { fail(res, e, 'handle the webhook'); }
};

/* ── The wallet (signed in, finance roles) ── */

export const wallet = async (req: any, res: Response) => {
    try { const org = req.user?.organization_id; if (!org) return res.status(400).json({ error: 'No account on this sign-in.' }); res.json(await lipila.walletSummary(org)); } catch (e) { fail(res, e, 'load the Lipila wallet'); }
};
export const cardPayments = async (req: any, res: Response) => {
    try { const org = req.user?.organization_id; if (!org) return res.status(400).json({ error: 'No account on this sign-in.' }); res.json({ payments: await lipila.recentCardPayments(org, Number(req.query.limit) || 50) }); } catch (e) { fail(res, e, 'load the card payments'); }
};

/* ── The owner's settings (signed in, account holder only) ── */

const owner = (req: any, res: Response): string | null => {
    const org = req.user?.organization_id;
    if (!org) { res.status(400).json({ error: 'No account on this sign-in.' }); return null; }
    if (req.user.role !== 'ADMIN') { res.status(403).json({ error: 'Only the account holder can change card payment settings.' }); return null; }
    return org;
};

export const getSettings = async (req: any, res: Response) => {
    try { const org = req.user?.organization_id; res.json(org ? await lipila.settingsView(org, apiBase(req)) : { available: false }); } catch (e) { fail(res, e, 'load the card settings'); }
};
export const saveSettings = async (req: any, res: Response) => {
    try { const org = owner(req, res); if (!org) return; res.json(await lipila.saveCredentials(org, req.user.id, req.body ?? {}, apiBase(req))); } catch (e) { fail(res, e, 'save the card settings'); }
};
export const testSettings = async (req: any, res: Response) => {
    try { const org = owner(req, res); if (!org) return; res.json(await lipila.testKey(org)); } catch (e) { fail(res, e, 'test the connection'); }
};
export const removeSettings = async (req: any, res: Response) => {
    try { const org = owner(req, res); if (!org) return; res.json(await lipila.removeCredentials(org)); } catch (e) { fail(res, e, 'remove the key'); }
};
