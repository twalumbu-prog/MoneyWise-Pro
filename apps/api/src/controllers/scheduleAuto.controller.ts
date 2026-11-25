import { Request, Response } from 'express';
import * as svc from '../services/scheduleAuto.service';
import { scanEmailsForBills } from '../services/scheduleScan.service';
import { backfillMailbox } from '../services/mailboxBackfill.service';

const user = (req: Request) => (req as any).user as { organization_id: string; id: string };

export async function getSuggestions(req: Request, res: Response) {
    try { res.json({ suggestions: await svc.suggestions(user(req).organization_id) }); }
    catch (e: any) { console.error('[ScheduleAuto] suggestions:', e?.message ?? e); res.status(500).json({ error: 'Could not look for repeating payments.' }); }
}
export async function acceptSuggestion(req: Request, res: Response) {
    try { res.json({ item: await svc.acceptSuggestion(user(req).organization_id, user(req).id, String(req.body?.key ?? '')) }); }
    catch (e: any) { res.status(400).json({ error: e?.message ?? 'Could not add it.' }); }
}
export async function dismissSuggestion(req: Request, res: Response) {
    try { res.json(await svc.dismissSuggestion(user(req).organization_id, String(req.body?.key ?? ''))); }
    catch (e: any) { res.status(400).json({ error: e?.message ?? 'Could not save that.' }); }
}
export async function scanEmails(req: Request, res: Response) {
    try { res.json(await scanEmailsForBills(user(req).organization_id)); }
    catch (e: any) { console.error('[ScheduleScan]', e?.message ?? e); res.status(500).json({ error: 'Could not read your emails for bills.' }); }
}
export async function backfillEmails(req: Request, res: Response) {
    try { res.json(await backfillMailbox(user(req).organization_id)); }
    catch (e: any) { console.error('[MailboxBackfill]', e?.message ?? e); res.status(500).json({ error: e?.message ?? 'Could not look further back in your mailbox.' }); }
}
