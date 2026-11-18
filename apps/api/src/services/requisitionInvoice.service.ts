/**
 * Import an invoice into a request for funds.
 *
 * The person uploads a supplier invoice (photo or PDF). It is stored privately, read by the same vision AI as receipts, and turned into
 * line items with the invoice's own prices. Those lines are then "locked": the request has to match the invoice, so the prices cannot be
 * edited. What was read is kept next to the file, and a request is only ever built from that saved copy, never from numbers the browser
 * sends back, so a locked price really is what the invoice said.
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { ocrService, InvoiceOcrData } from './ai/ocr.service';

export class InvoiceError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

export interface InvoiceLine { description: string; quantity: number; unit_price: number; amount: number; original_total?: number }
export interface ScannedInvoice {
    path: string;                 // storage path inside the receipts bucket
    file_name: string | null;
    supplier: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    currency: string;             // currency printed on the invoice
    exchange_rate: number;        // kwacha per unit of that currency (1 for kwacha)
    invoice_total: number | null; // total payable, in the invoice's own currency
    total_zmw: number;            // sum of the lines, in kwacha: this is what the request is for
    lines: InvoiceLine[];
    warnings: string[];
    confidence: number | null;
    scanned_by: string;
    organization_id: string;
}

const BUCKET = 'receipts';
const MAX_BYTES = 10 * 1024 * 1024;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null;
const isoDate = (v: unknown) => { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

/** Turns what the AI read into request lines in kwacha, and says plainly when the lines don't add up to the invoice total. */
export function buildInvoiceLines(ocr: InvoiceOcrData): { lines: InvoiceLine[]; warnings: string[]; currency: string; rate: number; invoiceTotal: number | null } {
    const warnings: string[] = [];
    const currency = (ocr.currency || 'ZMW').toUpperCase();
    let rate = 1;
    if (currency !== 'ZMW') {
        rate = num(ocr.exchange_rate);
        if (!(rate > 0)) throw new InvoiceError(`This invoice is in ${currency} and the exchange rate to kwacha is not available right now. Please try again in a moment.`, 503);
        warnings.push(`Invoice is in ${currency}; converted to kwacha at ${rate.toFixed(4)}${ocr.exchange_rate_source ? ` (${ocr.exchange_rate_source})` : ''}.`);
    }
    const invoiceTotal = num(ocr.total_amount) > 0 ? num(ocr.total_amount) : num(ocr.amount_due) > 0 ? num(ocr.amount_due) : null;

    type Raw = { description: string; quantity: number; unit: number; total: number };
    const raw: Raw[] = [];
    for (const li of ocr.line_items ?? []) {
        const description = text(li?.description, 300);
        let quantity = num(li?.quantity); if (!(quantity > 0)) quantity = 1;
        let unit = num(li?.unit_price);
        let total = num(li?.total);
        if (!total && unit) total = round2(quantity * unit);
        if (!unit && total) unit = total / quantity;
        if (!description && !total) continue;
        raw.push({ description: description || 'Item', quantity, unit, total });
    }

    if (raw.length === 0 && invoiceTotal) {
        raw.push({ description: `Invoice ${ocr.invoice_number ?? ''}${ocr.supplier ? ` — ${ocr.supplier}` : ''}`.replace(/\s+/g, ' ').trim(), quantity: 1, unit: invoiceTotal, total: invoiceTotal });
        warnings.push('No individual lines could be read, so the invoice total is one line.');
    }

    const sum = round2(raw.reduce((s, r) => s + r.total, 0));
    if (invoiceTotal && Math.abs(sum - invoiceTotal) > 0.02) {
        const vat = num(ocr.vat_amount);
        if (vat > 0 && Math.abs(sum + vat - invoiceTotal) <= 0.02) {
            raw.push({ description: `VAT${ocr.vat_rate ? ` (${ocr.vat_rate}%)` : ''}`, quantity: 1, unit: vat, total: vat });
        } else {
            warnings.push(`The lines add up to ${currency} ${sum.toFixed(2)} but the invoice total is ${currency} ${invoiceTotal.toFixed(2)}. Check the lines against the invoice before you send the request.`);
        }
    }

    const lines: InvoiceLine[] = raw.map((r) => ({
        description: r.description,
        quantity: r.quantity,
        unit_price: round2(r.unit * rate),
        amount: round2(r.total * rate),
        ...(rate !== 1 ? { original_total: r.total } : {}),
    }));
    return { lines, warnings, currency, rate, invoiceTotal };
}

const extFor = (buf: Buffer): 'pdf' | 'png' | 'webp' | 'jpg' | null => {
    const h = buf.subarray(0, 12).toString('hex');
    if (h.startsWith('25504446')) return 'pdf';
    if (h.startsWith('89504e47')) return 'png';
    if (h.startsWith('52494646') && h.substring(16, 24) === '57454250') return 'webp';
    if (h.startsWith('ffd8ff')) return 'jpg';
    return null;
};

const pathPattern = (orgId: string) => new RegExp(`^invoices/${orgId}/[0-9a-f-]{36}\\.(pdf|png|webp|jpg)$`);

export async function scanInvoice(orgId: string, userId: string, input: { fileBase64?: string; fileName?: string }): Promise<ScannedInvoice> {
    const b64 = String(input.fileBase64 ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!b64) throw new InvoiceError('Choose an invoice to upload.');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 200) throw new InvoiceError('That file looks empty. Please choose the invoice again.');
    if (buf.length > MAX_BYTES) throw new InvoiceError('That file is too large. Invoices up to 10 MB are supported.');
    const ext = extFor(buf);
    if (!ext) throw new InvoiceError('Upload the invoice as a PDF or a photo (JPG, PNG or WebP).');

    const path = `invoices/${orgId}/${randomUUID()}.${ext}`;
    const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const up = await supabase.storage.from(BUCKET).upload(path, buf, { contentType, upsert: false });
    if (up.error) throw new InvoiceError(`The invoice could not be saved: ${up.error.message}`, 500);

    const ocr = await ocrService.analyzeInvoice(buf);
    if (ocr.error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw new InvoiceError(ocr.error === 'AI analysis not configured' ? 'Invoice reading is not switched on yet. Please add the lines by hand.' : 'We could not read that invoice. Try a clearer photo or the PDF.', 422);
    }

    let built;
    try { built = buildInvoiceLines(ocr); } catch (e) { await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined); throw e; }
    if (built.lines.length === 0) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw new InvoiceError('No items or total could be found on that file. Is it an invoice?', 422);
    }

    const result: ScannedInvoice = {
        path,
        file_name: text(input.fileName, 200),
        supplier: text(ocr.supplier, 200),
        invoice_number: text(ocr.invoice_number, 80),
        invoice_date: isoDate(ocr.invoice_date),
        due_date: isoDate(ocr.due_date),
        currency: built.currency,
        exchange_rate: built.rate,
        invoice_total: built.invoiceTotal,
        total_zmw: round2(built.lines.reduce((s, l) => s + l.amount, 0)),
        lines: built.lines,
        warnings: built.warnings,
        confidence: typeof ocr.confidence === 'number' ? ocr.confidence : null,
        scanned_by: userId,
        organization_id: orgId,
    };
    const side = await supabase.from('requisition_invoice_scans').insert({ path, organization_id: orgId, scanned_by: userId, data: result });
    if (side.error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw new InvoiceError(`The invoice could not be saved: ${side.error.message}`, 500);
    }
    return result;
}

/** The saved reading of an invoice, only for the business and person that scanned it. */
export async function loadScannedInvoice(orgId: string, userId: string, path: unknown): Promise<ScannedInvoice> {
    const p = String(path ?? '');
    if (!pathPattern(orgId).test(p)) throw new InvoiceError('That invoice does not belong to this account. Upload it again.', 403);
    const { data, error } = await supabase.from('requisition_invoice_scans').select('data, organization_id, scanned_by').eq('path', p).maybeSingle();
    if (error || !data) throw new InvoiceError('That invoice could not be found. Upload it again.', 404);
    if (data.organization_id !== orgId || data.scanned_by !== userId) throw new InvoiceError('That invoice was uploaded by someone else.', 403);
    return data.data as ScannedInvoice;
}

/**
 * Which lines of the invoice go into the request. Everything by default; the person may drop lines they are not asking for (for example an
 * item already paid), but cannot change a price. `keep` is a list of line numbers (0-based).
 */
export function pickInvoiceLines(scan: ScannedInvoice, keep?: unknown): InvoiceLine[] {
    if (!Array.isArray(keep)) return scan.lines;
    const wanted = new Set(keep.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < scan.lines.length));
    const lines = scan.lines.filter((_, i) => wanted.has(i));
    if (lines.length === 0) throw new InvoiceError('Keep at least one line from the invoice.');
    return lines;
}

/** Fields of the requisition row that point back at the invoice. */
export function invoiceColumns(scan: ScannedInvoice) {
    return {
        invoice_url: scan.path,
        invoice_number: scan.invoice_number,
        invoice_supplier: scan.supplier,
        invoice_date: scan.invoice_date,
        invoice_total: scan.invoice_total,
        invoice_currency: scan.currency,
        invoice_ocr_data: { file_name: scan.file_name, exchange_rate: scan.exchange_rate, confidence: scan.confidence, warnings: scan.warnings, due_date: scan.due_date, lines: scan.lines },
    };
}

/** A short-lived link so the invoice can be viewed from the request. */
export async function signedInvoiceUrl(path: string, seconds = 3600): Promise<string | null> {
    if (!/^invoices\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|png|webp|jpg)$/.test(path)) return null;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
}
