/**
 * Renders a credit-sale invoice (customer_invoices row) to a PDF. The same bytes are emailed to the
 * customer as the "e-invoice" and offered for download in the app, so both always match.
 */
import PDFDocument from 'pdfkit';

export interface InvoicePdfInput {
    orgName: string;
    invoice: {
        invoice_number: string;
        customer_name: string;
        customer_phone?: string | null;
        customer_email?: string | null;
        issue_date: string;
        follow_up_date: string;
        items: { name: string; quantity: number; unit_price: number; check_in?: string; check_out?: string }[];
        total: number;
        amount_paid: number;
        status: string;
        notes?: string | null;
    };
}

const PRIMARY = '#0F172A';
const ACCENT = '#006AFF';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const LIGHT = '#f8fafc';
const LEFT = 50;
const RIGHT = 545;

const money = (n: number) => `K ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(iso?: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '—';
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function buildCustomerInvoicePdf({ orgName, invoice }: InvoicePdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4', info: { Title: `Invoice ${invoice.invoice_number} – ${orgName}` } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(20).text(orgName.toUpperCase(), LEFT, 50, { width: 330 });
        doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(22).text('INVOICE', 380, 50, { width: RIGHT - 380, align: 'right' });
        doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(invoice.invoice_number, 380, 78, { width: RIGHT - 380, align: 'right' });
        doc.moveTo(LEFT, 110).lineTo(RIGHT, 110).strokeColor(BORDER).lineWidth(1).stroke();

        // Bill to / dates
        let y = 126;
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('BILL TO', LEFT, y);
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(12).text(invoice.customer_name, LEFT, y + 13, { width: 250 });
        let by = y + 30;
        doc.fillColor(MUTED).font('Helvetica').fontSize(9);
        if (invoice.customer_phone) { doc.text(invoice.customer_phone, LEFT, by); by += 12; }
        if (invoice.customer_email) { doc.text(invoice.customer_email, LEFT, by); by += 12; }

        const kv = (label: string, value: string, yy: number, bold = false) => {
            doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, 340, yy, { width: 90 });
            doc.fillColor(PRIMARY).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(value, 430, yy, { width: RIGHT - 430, align: 'right' });
        };
        kv('Invoice date', formatDate(invoice.issue_date), y);
        kv('Payment follow-up', formatDate(invoice.follow_up_date), y + 15, true);
        kv('Status', invoice.status === 'PAID' ? 'Paid' : invoice.status === 'PARTIAL' ? 'Partially paid' : 'Awaiting payment', y + 30);

        // Table header
        y = Math.max(by, y + 55) + 14;
        doc.rect(LEFT, y, RIGHT - LEFT, 22).fill(LIGHT);
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5);
        doc.text('DESCRIPTION', LEFT + 8, y + 7);
        doc.text('QTY', 330, y + 7, { width: 40, align: 'center' });
        doc.text('UNIT PRICE', 372, y + 7, { width: 80, align: 'right' });
        doc.text('AMOUNT', 456, y + 7, { width: RIGHT - 456 - 8, align: 'right' });
        y += 28;

        for (const it of invoice.items) {
            if (y > 720) { doc.addPage(); y = 60; }
            const stay = it.check_in && it.check_out ? `${formatDate(it.check_in)} → ${formatDate(it.check_out)}` : '';
            doc.fillColor(PRIMARY).font('Helvetica').fontSize(10).text(it.name, LEFT + 8, y, { width: 265 });
            const rowH = Math.max(18, doc.heightOfString(it.name, { width: 265 }) + (stay ? 11 : 0) + 6);
            if (stay) doc.fillColor(MUTED).fontSize(8).text(stay, LEFT + 8, y + rowH - 17, { width: 265 });
            doc.fillColor(PRIMARY).fontSize(10);
            doc.text(String(it.quantity), 330, y, { width: 40, align: 'center' });
            doc.text(money(it.unit_price), 372, y, { width: 80, align: 'right' });
            doc.text(money(it.unit_price * it.quantity), 456, y, { width: RIGHT - 456 - 8, align: 'right' });
            y += rowH;
            doc.moveTo(LEFT, y - 3).lineTo(RIGHT, y - 3).strokeColor('#f1f5f9').lineWidth(0.7).stroke();
        }

        // Totals
        y += 10;
        const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0));
        const totalRow = (label: string, value: string, bold = false, color = PRIMARY) => {
            doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(label, 330, y, { width: 120, align: 'right' });
            doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).text(value, 456, y, { width: RIGHT - 456 - 8, align: 'right' });
            y += bold ? 20 : 16;
        };
        totalRow('Total', money(invoice.total));
        if (Number(invoice.amount_paid) > 0) totalRow('Paid to date', `- ${money(invoice.amount_paid)}`);
        totalRow('Balance due', money(balance), true, balance > 0 ? ACCENT : '#059669');

        if (invoice.notes && invoice.notes.trim()) {
            y += 14;
            doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('NOTES', LEFT, y);
            doc.fillColor(PRIMARY).font('Helvetica').fontSize(9).text(invoice.notes.trim(), LEFT, y + 12, { width: RIGHT - LEFT });
        }

        doc.fillColor(MUTED).font('Helvetica').fontSize(8)
            .text(`Please arrange payment by ${formatDate(invoice.follow_up_date)}. Thank you for your business.`, LEFT, 780, { width: RIGHT - LEFT, align: 'center' });
        doc.end();
    });
}
