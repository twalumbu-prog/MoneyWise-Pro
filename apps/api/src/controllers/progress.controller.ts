import { Response } from 'express';
import * as progress from '../services/progress.service';

/** Maps the service's errors to a clean answer; anything else is a 500. */
const fail = (res: Response, e: any, what: string) => {
    if (e instanceof progress.ProgressError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Progress] ${what} failed:`, e?.message ?? e);
    return res.status(500).json({ error: `Couldn’t ${what}.` });
};

/** GET /progress: level, XP, points, credit, streak and every badge. Opening it counts as using the app today. */
export const getProgress = async (req: any, res: Response) => {
    try { res.json(await progress.record(req.user.id, req.user.organization_id ?? null)); } catch (e) { fail(res, e, 'load your progress'); }
};

/** POST /progress/event  { type: 'visit', path } | { type: 'mission', id } */
export const postEvent = async (req: any, res: Response) => {
    try {
        const b = req.body ?? {};
        const event = b.type === 'visit' && typeof b.path === 'string' ? { type: 'visit' as const, path: b.path.slice(0, 200) } : b.type === 'mission' && typeof b.id === 'string' ? { type: 'mission' as const, id: b.id.slice(0, 80) } : undefined;
        if (!event) return res.status(400).json({ error: 'Unknown event.' });
        res.json(await progress.record(req.user.id, req.user.organization_id ?? null, event));
    } catch (e) { fail(res, e, 'record that'); }
};

/** POST /progress/convert  { xp } */
export const convert = async (req: any, res: Response) => {
    try { const r = await progress.convertXp(req.user.id, req.body?.xp); res.json({ ...r, ...(await progress.snapshot(req.user.id, req.user.organization_id ?? null)) }); } catch (e) { fail(res, e, 'convert your XP'); }
};

/** POST /progress/redeem  { points } */
export const redeem = async (req: any, res: Response) => {
    try { const r = await progress.redeemPoints(req.user.id, req.body?.points); res.json({ ...r, ...(await progress.snapshot(req.user.id, req.user.organization_id ?? null)) }); } catch (e) { fail(res, e, 'redeem your points'); }
};
