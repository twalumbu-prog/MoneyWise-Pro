import { Response } from 'express';
import * as salon from '../services/salon.service';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof salon.SalonError) return res.status(e.httpStatus).json({ error: e.message });
    console.error(`[Salon] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};
const org = (req: any) => req.user.organization_id as string;
const MANAGERS = ['ADMIN', 'MANAGER', 'MANAGEMENT', 'ACCOUNTANT', 'CASHIER', 'AUTHORISER'];

export const staff = async (req: any, res: Response) => { try { res.json(await salon.listStaff(org(req))); } catch (e) { fail(res, e, 'load the hairdressers'); } };
export const createStaff = async (req: any, res: Response) => { try { res.status(201).json({ staff: await salon.saveStaff(org(req), req.body) }); } catch (e) { fail(res, e, 'save the hairdresser'); } };
export const updateStaff = async (req: any, res: Response) => { try { res.json({ staff: await salon.saveStaff(org(req), req.body, req.params.id) }); } catch (e) { fail(res, e, 'save the hairdresser'); } };
export const bookings = async (req: any, res: Response) => {
    try { res.json({ bookings: await salon.bookingsForDay(org(req), String(req.query.date ?? ''), typeof req.query.staffId === 'string' ? req.query.staffId : undefined) }); } catch (e) { fail(res, e, 'load the bookings'); }
};
/** Managers can finish any booking; a hairdresser can finish their own (their sign-in is linked to their profile). */
export const complete = async (req: any, res: Response) => {
    try { res.json(await salon.completeBooking(org(req), req.params.id, (staffUser) => MANAGERS.includes(req.user.role) || (!!staffUser && staffUser === req.user.id))); } catch (e) { fail(res, e, 'mark the service finished'); }
};
