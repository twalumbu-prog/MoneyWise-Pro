import { Response } from 'express';
import * as svc from '../services/purchasing.service';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof svc.PurchasingError) return res.status(e.httpStatus).json({ error: e.message });
    console.error(`[Purchasing] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};
const org = (req: any) => req.user.organization_id as string;
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => { try { res.json(await fn(req)); } catch (e) { fail(res, e, what); } };

export const suppliers = run('load the suppliers', async (r) => ({ suppliers: await svc.listSuppliers(org(r)) }));
export const supplier = run('load the supplier', (r) => svc.supplierDetail(org(r), r.params.id));
export const createSupplier = run('save the supplier', async (r) => ({ supplier: await svc.saveSupplier(org(r), r.body) }));
export const updateSupplier = run('save the supplier', async (r) => ({ supplier: await svc.saveSupplier(org(r), r.body, r.params.id) }));
export const bills = run('load the bills', async (r) => ({ bills: await svc.listBills(org(r), r.query.status as string | undefined) }));
export const createBill = run('save the bill', async (r) => ({ bill: await svc.createBill(org(r), r.user.id, r.body) }));
export const payBill = run('record the payment', async (r) => ({ payment: await svc.payBill(org(r), r.user.id, r.params.id, r.body) }));
export const walletPay = run('request the payment', async (r) => ({ request: await svc.requestWalletPayment(org(r), r.user.id, r.params.id, r.body ?? {}) }));
export const voidBill = run('cancel the bill', async (r) => ({ bill: await svc.voidBill(org(r), r.user.id, r.params.id) }));
export const adjustStock = run('adjust the stock', async (r) => ({ movement: await svc.adjustStock(org(r), r.user.id, r.body) }));
export const movements = run('load the stock history', async (r) => ({ movements: await svc.stockMovements(org(r), r.query.productId as string | undefined) }));
export const valuation = run('value the stock', (r) => svc.inventoryValuation(org(r)));
export const ageing = run('load what is owed', (r) => svc.payablesAgeing(org(r)));
