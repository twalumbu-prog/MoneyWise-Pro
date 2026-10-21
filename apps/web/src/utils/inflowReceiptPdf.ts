import jsPDF from 'jspdf';
import { formatReceiptDate, type InflowReceipt } from 'core';

const money = (n: number) => `K${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Draws the inflow receipt (payment, customer, items + collected info + delivery, accounting) and downloads it. */
export function downloadInflowReceiptPdf(r: InflowReceipt) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 18, R = 192, W = R - L;
    const slate = '#0f172a', muted = '#64748b', faint = '#94a3b8', blue = '#0058DB', line = '#e2e8f0';
    let y = 22;

    const ensure = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20; } };
    const text = (s: string, x: number, opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' | 'center' } = {}) => {
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
        doc.setFontSize(opts.size ?? 9.5);
        doc.setTextColor(opts.color ?? slate);
        doc.text(s, x, y, { align: opts.align ?? 'left' });
    };
    const section = (title: string) => {
        ensure(14);
        y += 8;
        text(title.toUpperCase(), L, { size: 7.5, bold: true, color: faint });
        y += 2;
        doc.setDrawColor(line); doc.line(L, y, R, y);
        y += 6;
    };
    const kv = (k: string, v?: string | null) => {
        if (!v) return;
        ensure(7);
        text(k, L, { color: muted });
        const lines = doc.splitTextToSize(v, W - 55) as string[];
        lines.forEach((ln, i) => { text(ln, L + 55, { bold: true }); if (i < lines.length - 1) y += 5; });
        y += 6;
    };

    // Header
    text(r.organizationName.toUpperCase(), L, { size: 17, bold: true });
    text('RECEIPT', R, { size: 11, bold: true, color: blue, align: 'right' });
    y += 6;
    text('Official payment receipt', L, { size: 9, color: muted });
    text(`#${r.receiptNo}`, R, { size: 9, color: muted, align: 'right' });
    y += 4;
    doc.setDrawColor(line); doc.line(L, y, R, y);

    // Amount banner
    y += 6;
    doc.setFillColor('#f1f6ff'); doc.roundedRect(L, y, W, 18, 3, 3, 'F');
    y += 7;
    text('Total received', L + 5, { size: 8.5, color: muted });
    text(r.status.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), R - 5, { size: 8.5, bold: true, color: '#059669', align: 'right' });
    y += 7;
    text(money(r.amount), L + 5, { size: 15, bold: true });
    y += 8;

    section('Payment');
    kv('Date', formatReceiptDate(r.date));
    kv('Payment method', r.paymentMethod);
    kv('Channel', r.channel);
    kv('Received into', r.wallet);

    if (r.payer.name || r.payer.phone) {
        section('Customer');
        kv('Name', r.payer.name);
        kv('Phone', r.payer.phone);
    }

    if (r.items.length) {
        section('Items');
        doc.setFillColor('#f8fafc'); doc.rect(L, y - 4, W, 7, 'F');
        text('Item', L + 2, { size: 8, bold: true, color: muted });
        text('Qty', 118, { size: 8, bold: true, color: muted, align: 'center' });
        text('Unit', 150, { size: 8, bold: true, color: muted, align: 'right' });
        text('Total', R - 2, { size: 8, bold: true, color: muted, align: 'right' });
        y += 7;
        r.items.forEach((i) => {
            ensure(14 + i.responses.length * 5);
            text(i.name, L + 2, { bold: true });
            text(String(i.quantity), 118, { align: 'center' });
            text(money(i.unitPrice), 150, { align: 'right' });
            text(money(i.total), R - 2, { align: 'right' });
            y += 5;
            i.responses.forEach((x) => { text(`${x.label}: ${x.value}`, L + 2, { size: 8.5, color: muted }); y += 4.5; });
            if (i.delivery) {
                text(i.delivery.delivered
                    ? `Delivered${i.delivery.deliveredAt ? ' · ' + formatReceiptDate(i.delivery.deliveredAt) : ''}`
                    : 'Awaiting delivery', L + 2, { size: 8.5, bold: true, color: i.delivery.delivered ? '#059669' : '#b45309' });
                y += 4.5;
            }
            doc.setDrawColor('#f1f5f9'); doc.line(L, y, R, y);
            y += 5;
        });
    }

    if (r.fulfilment) {
        section(r.fulfilment.mode === 'pickup' ? 'Pick-up' : 'Delivery');
        kv('Method', r.fulfilment.mode === 'pickup' ? 'Customer picks up' : 'Delivered to customer');
        kv('Address', r.fulfilment.address);
        kv('Rider service', r.fulfilment.rider);
        kv('Delivery charge', r.fulfilment.charge != null ? money(r.fulfilment.charge) : null);
    }

    section('Accounting treatment');
    const sum = doc.splitTextToSize(r.accounting.summary, W - 8) as string[];
    ensure(sum.length * 5 + 10);
    doc.setFillColor('#f8fafc'); doc.roundedRect(L, y - 4, W, sum.length * 5 + 4, 2, 2, 'F');
    sum.forEach((ln) => { text(ln, L + 4, { size: 9, color: '#334155' }); y += 5; });
    y += 3;
    if (r.accounting.lines.length) {
        text('Account', L + 2, { size: 8, bold: true, color: muted });
        text('Debit', 150, { size: 8, bold: true, color: muted, align: 'right' });
        text('Credit', R - 2, { size: 8, bold: true, color: muted, align: 'right' });
        y += 5;
        r.accounting.lines.forEach((l) => {
            ensure(7);
            text(l.account, L + 2);
            if (l.debit) text(money(l.debit), 150, { align: 'right' });
            if (l.credit) text(money(l.credit), R - 2, { align: 'right' });
            y += 5.5;
        });
        y += 1;
    }
    kv('Category', r.accounting.category);
    kv('Recorded by', r.accounting.recordedBy);

    ensure(16);
    y += 8;
    text('Thank you for your payment', 105, { size: 9, color: faint, align: 'center' });
    y += 5;
    text('Generated by MoneyWise', 105, { size: 7.5, color: faint, align: 'center' });

    doc.save(`receipt-${r.receiptNo}.pdf`);
}
