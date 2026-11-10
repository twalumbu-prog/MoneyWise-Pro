/**
 * Import an invoice into a request: reading, locked lines, who may use a scan, and what is saved on the request.
 * The AI reader is stood in; storage and the database are live, with a throwaway business removed at the end.
 * Run: npx tsx src/scripts/test_requisition_invoice.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { ocrService } from '../services/ai/ocr.service';
import * as inv from '../services/requisitionInvoice.service';
import { createRequisition, updateRequisition } from '../controllers/requisition.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

// a tiny valid PNG header padded past the minimum size, so the file-type check passes
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(400, 1)]).toString('base64');
let reading: any = {};
(ocrService as any).analyzeInvoice = async () => reading;

const call = async (fn: any, user: any, body: any, params: any = {}) => {
    let status = 200; let json: any = null;
    const res: any = { status(s: number) { status = s; return this; }, json(j: any) { json = j; return this; } };
    await fn({ user, body, params }, res);
    return { status, json };
};

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = ''; const paths: string[] = []; let reqId = '';
    try {
        // ---- reading the lines
        const a = inv.buildInvoiceLines({ currency: 'ZMW', total_amount: 1160, vat_amount: 160, vat_rate: 16, line_items: [{ description: 'Cement 50kg', quantity: 10, unit_price: 100, total: 1000 }] });
        check('lines are kept exactly, and missing VAT is added so the total matches', a.lines.length === 2 && a.lines[0].amount === 1000 && a.lines[1].amount === 160 && a.warnings.length === 0, JSON.stringify(a.lines.map((l) => l.amount)));
        const b = inv.buildInvoiceLines({ currency: 'ZMW', total_amount: 900, line_items: [{ description: 'Sand', quantity: 2, unit_price: 100, total: 200 }] });
        check('lines that do not add up to the invoice are flagged, not invented', b.lines.length === 1 && b.warnings.some((w) => /add up/i.test(w)));
        const c = inv.buildInvoiceLines({ currency: 'USD', exchange_rate: 25, total_amount: 30, line_items: [{ description: 'Router', quantity: 2, unit_price: 15, total: 30 }] });
        check('a dollar invoice is converted to kwacha', c.lines[0].unit_price === 375 && c.lines[0].amount === 750 && c.currency === 'USD');
        let threw = false; try { inv.buildInvoiceLines({ currency: 'USD', total_amount: 5, line_items: [{ description: 'x', total: 5 }] }); } catch { threw = true; }
        check('a foreign invoice with no exchange rate is refused', threw);
        const d = inv.buildInvoiceLines({ currency: 'ZMW', total_amount: 450, line_items: [] });
        check('an invoice with only a total becomes one line', d.lines.length === 1 && d.lines[0].amount === 450);
        const e = inv.buildInvoiceLines({ currency: 'ZMW', line_items: [{ description: 'Pipe', quantity: 3, total: 90 }] });
        check('a missing unit price is worked out from the total', e.lines[0].unit_price === 30 && e.lines[0].quantity === 3);

        // ---- scanning and saving
        const { data: o, error: oe } = await supabase.from('organizations').insert({ name: `ZZ TEST invoice ${tag}`, slug: `zz-test-invoice-${tag}` }).select('id').single();
        if (oe) throw oe; org = o!.id;
        const { data: u } = await supabase.from('users').select('id').limit(1).single();
        const user = { id: u!.id, organization_id: org, role: 'ADMIN' };

        reading = { supplier: 'Lusaka Hardware', invoice_number: 'INV-1042', invoice_date: '2026-11-01', currency: 'ZMW', total_amount: 1500, line_items: [
            { description: 'Cement 50kg', quantity: 10, unit_price: 100, total: 1000 }, { description: 'River sand (tonne)', quantity: 1, unit_price: 500, total: 500 }] };
        const scan = await inv.scanInvoice(org, user.id, { fileBase64: PNG, fileName: 'inv.png' }); paths.push(scan.path);
        check('the scan keeps supplier, number and lines', scan.supplier === 'Lusaka Hardware' && scan.invoice_number === 'INV-1042' && scan.lines.length === 2 && scan.total_zmw === 1500);
        check('the file is stored under this business', scan.path.startsWith(`invoices/${org}/`));

        let rejected = '';
        try { await inv.scanInvoice(org, user.id, { fileBase64: Buffer.from('hello world, not an invoice'.repeat(20)).toString('base64') }); } catch (x: any) { rejected = x.message; }
        check('a file that is not a PDF or image is refused', /PDF or a photo/.test(rejected), rejected);

        const back = await inv.loadScannedInvoice(org, user.id, scan.path);
        check('the saved reading loads for the person who scanned it', back.lines.length === 2);
        let denied = 0;
        try { await inv.loadScannedInvoice(randomUUID(), user.id, scan.path); } catch { denied++; }
        try { await inv.loadScannedInvoice(org, randomUUID(), scan.path); } catch { denied++; }
        try { await inv.loadScannedInvoice(org, user.id, `invoices/${org}/../x.png`); } catch { denied++; }
        check('another business, another person, or a made-up path is refused', denied === 3, String(denied));
        check('keeping chosen lines works and an empty choice is refused', inv.pickInvoiceLines(scan, [1]).length === 1 && (() => { try { inv.pickInvoiceLines(scan, []); return false; } catch { return true; } })());

        // ---- the request itself
        const made = await call(createRequisition, user, { description: '', estimated_total: 1, type: 'EXPENSE', invoice_path: scan.path, items: [{ description: 'Tampered', quantity: 1, unit_price: 1, estimated_amount: 1 }] });
        reqId = made.json?.id ?? '';
        check('the request is created from the invoice', made.status < 300 && !!reqId, JSON.stringify(made.json).slice(0, 200));
        const { data: row } = await supabase.from('requisitions').select('*, line_items(*)').eq('id', reqId).single();
        check('the total is the invoice total, not what the browser sent', Number(row?.estimated_total) === 1500);
        check('the invoice is referenced on the request', row?.invoice_number === 'INV-1042' && row?.invoice_supplier === 'Lusaka Hardware' && row?.invoice_url === scan.path && row?.invoice_currency === 'ZMW');
        check('lines come from the invoice, locked, and the browser’s own lines are ignored', (row?.line_items ?? []).length === 2 && (row?.line_items ?? []).every((l: any) => l.price_locked === true) && !(row?.line_items ?? []).some((l: any) => l.description === 'Tampered'));
        check('a description is filled in from the invoice', /INV-1042/.test(row?.description ?? ''));

        const upd = await call(updateRequisition, user, { description: 'edited', estimated_total: 5 }, { id: reqId });
        const { data: after } = await supabase.from('requisitions').select('estimated_total').eq('id', reqId).single();
        check('a draft’s total cannot be changed away from its invoice', upd.status < 300 && Number(after?.estimated_total) === 1500);

        const loan = await call(createRequisition, user, { description: 'x', estimated_total: 10, type: 'LOAN', invoice_path: scan.path });
        check('an invoice cannot be attached to a loan', loan.status === 400);
        const stranger = await call(createRequisition, { ...user, id: user.id, organization_id: randomUUID() }, { description: 'x', estimated_total: 10, type: 'EXPENSE', invoice_path: scan.path });
        check('another business cannot build a request from this invoice', stranger.status >= 400);

        const url = await inv.signedInvoiceUrl(scan.path);
        check('a view link is produced for the stored invoice', !!url && url.includes('http'));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (reqId) { await supabase.from('line_items').delete().eq('requisition_id', reqId); await supabase.from('requisitions').delete().eq('id', reqId); }
        if (org) {
            await supabase.from('requisitions').delete().eq('organization_id', org);
            await supabase.from('requisition_invoice_scans').delete().eq('organization_id', org);
            if (paths.length) await supabase.storage.from('receipts').remove(paths);
            await supabase.from('organizations').delete().eq('id', org);
        }
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST invoice ${tag}`);
        console.log(`cleanup: ${count ?? 0} test businesses left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
