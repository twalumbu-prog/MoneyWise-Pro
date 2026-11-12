import { Response } from 'express';
import * as tap from '../services/tapPay.service';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof tap.TapError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Tap] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

// Looking up a code is rate limited per person, so codes can't be guessed or the setting probed.
const hits = new Map<string, number[]>();
const tooMany = (key: string, limit = 30, windowMs = 60_000) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now); hits.set(key, recent);
    return recent.length > limit;
};

const me = (req: any) => ({ id: String(req.user?.id ?? ''), org: (req.user?.organization_id ?? null) as string | null, role: String(req.user?.role ?? '') });

export const getSettings = async (req: any, res: Response) => {
    try { res.json({ mode: await tap.getMode(me(req).id) }); } catch (e) { fail(res, e, 'load the setting'); }
};
export const putSettings = async (req: any, res: Response) => {
    try { res.json({ mode: await tap.setMode(me(req).id, req.body?.mode) }); } catch (e) { fail(res, e, 'save the setting'); }
};
export const create = async (req: any, res: Response) => {
    try { const u = me(req); res.json(await tap.createRequest({ userId: u.id, orgId: u.org, amount: req.body?.amount, note: req.body?.note, kind: req.body?.kind })); } catch (e) { fail(res, e, 'make the request'); }
};
export const resolve = async (req: any, res: Response) => {
    try {
        const u = me(req);
        if (tooMany(`resolve:${u.id}`)) return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.', code: 'RATE' });
        res.json(await tap.resolve(req.params.code, u.id));
    } catch (e) { fail(res, e, 'open the request'); }
};
export const claim = async (req: any, res: Response) => {
    try {
        const u = me(req);
        if (tooMany(`claim:${u.id}`, 15)) return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.', code: 'RATE' });
        res.json(await tap.claim(req.params.code, { id: u.id, role: u.role }));
    } catch (e) { fail(res, e, 'start the payment'); }
};
export const attach = async (req: any, res: Response) => {
    try { res.json(await tap.attach(req.params.code, me(req).id, String(req.body?.requisition_id ?? ''))); } catch (e) { fail(res, e, 'link the payment'); }
};
export const status = async (req: any, res: Response) => {
    try { res.json(await tap.status(req.params.id, me(req).id)); } catch (e) { fail(res, e, 'check the request'); }
};
export const cancel = async (req: any, res: Response) => {
    try { res.json(await tap.cancel(req.params.id, me(req).id)); } catch (e) { fail(res, e, 'cancel the request'); }
};
