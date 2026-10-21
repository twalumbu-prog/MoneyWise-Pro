import type { InflowDetail, InflowDetailEntry, ProductSale } from '../services/product.service';

/** Platform-neutral receipt content for one inflow, rendered to PDF on web and to print HTML on mobile. */

export interface ReceiptItem {
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    productType?: string;
    /** Buyer's answers to the product's checkout fields (size, name on shirt, ...). */
    responses: { label: string; value: string }[];
    /** null when the item is not something that gets handed over (services, donations). */
    delivery: { delivered: boolean; deliveredAt: string | null } | null;
}

export interface ReceiptJournalLine {
    account: string;
    debit: number;
    credit: number;
}

export interface InflowReceipt {
    organizationName: string;
    receiptNo: string;
    date: string;
    status: string;
    amount: number;
    paymentMethod: string;
    channel: string;
    wallet: string | null;
    payer: { name: string | null; phone: string | null };
    items: ReceiptItem[];
    fulfilment: { mode: 'deliver' | 'pickup'; address: string | null; rider: string | null; charge: number | null } | null;
    accounting: {
        summary: string;
        category: string | null;
        lines: ReceiptJournalLine[];
        recordedBy: string | null;
        accountingSync: string | null;
    };
}

const CHANNEL_LABEL: Record<string, string> = {
    CASH: 'Cash',
    AIRTEL_MONEY: 'Mobile Money',
    BANK: 'Bank',
    MONEYWISE_WALLET: 'MoneyWise Wallet',
    MASTERFEES: 'Master Fees',
    MASTERFEES_MANUAL: 'Master Fees (Manual)',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
    CASH: 'Cash',
    AIRTEL_MONEY: 'Mobile Money',
    BANK: 'Bank transfer',
    MONEYWISE_WALLET: 'MoneyWise Pay (Mobile Money / Card)',
    MASTERFEES: 'Master Fees',
    MASTERFEES_MANUAL: 'Master Fees (manual)',
};

export const channelLabel = (t?: string | null) => (t ? CHANNEL_LABEL[t] || t.replace(/_/g, ' ').toLowerCase() : '—');
export const paymentMethodLabel = (t?: string | null) => (t ? PAYMENT_METHOD_LABEL[t] || channelLabel(t) : '—');

const acct = (a?: { code?: string; name: string } | null) => (a ? `${a.code ? `${a.code} · ` : ''}${a.name}` : 'Unknown account');

/** A physical item is handed over; services, donations and bookings are not tracked for delivery. */
export const isDeliverable = (s: ProductSale): boolean =>
    s.products?.product_type === 'PRODUCT' || !!s.products?.requires_delivery || !!s.order_details;

export function buildInflowReceipt(detail: InflowDetail, fallback: { id: string; reference_number?: string; description?: string; debit?: number; date: string; status?: string; account_type?: string }): InflowReceipt {
    const entry: InflowDetailEntry | undefined = detail.entries.find((e) => e.id === fallback.id) || detail.entries[0];
    const sales = detail.sales;
    const first = sales[0];
    const delivery = sales.find((s) => s.order_details)?.order_details || null;

    const items: ReceiptItem[] = sales.map((s) => {
        const unit = s.quantity ? Number(s.amount_paid) / s.quantity : Number(s.amount_paid);
        return {
            name: s.products?.name || 'Item',
            quantity: s.quantity,
            unitPrice: unit,
            total: Number(s.amount_paid),
            productType: s.products?.product_type,
            responses: (s.customer_responses || []).map((r) => ({ label: r.label, value: r.value })),
            delivery: isDeliverable(s) ? { delivered: s.delivery_status === 'DELIVERED', deliveredAt: s.delivered_at || null } : null,
        };
    });

    const lines: ReceiptJournalLine[] = detail.journals.flatMap((j) =>
        j.journal_lines.map((l) => ({ account: acct(l.accounts), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
    );
    const category = entry?.accounts ? acct(entry.accounts) : null;
    const walletName = entry?.organization_wallets?.name || null;

    let summary: string;
    if (lines.length) {
        const dr = lines.filter((l) => l.debit > 0).map((l) => l.account).join(', ');
        const cr = lines.filter((l) => l.credit > 0).map((l) => l.account).join(', ');
        summary = `Recorded as income: money received into ${dr}, credited to ${cr}.`;
    } else if (category) {
        summary = `Categorised as ${category}.`;
    } else {
        summary = 'Received into the cashbook; not yet categorised to an income account.';
    }

    const ref = entry?.reference_number || entry?.external_reference || fallback.reference_number || fallback.id.slice(0, 8);
    const addr = delivery && delivery.mode === 'deliver'
        ? [delivery.street, delivery.apartment, delivery.state, delivery.country].filter(Boolean).join(', ') || null
        : null;
    const totalFromEntries = detail.entries.reduce((s, e) => s + (Number(e.debit) || 0), 0);

    return {
        organizationName: detail.organization?.name || 'MoneyWise',
        receiptNo: String(ref),
        date: entry?.date || fallback.date,
        status: entry?.status || fallback.status || 'COMPLETED',
        amount: entry ? (detail.entries.length > 1 ? totalFromEntries : Number(entry.debit) || 0) : Number(fallback.debit) || 0,
        paymentMethod: paymentMethodLabel(entry?.account_type || fallback.account_type),
        channel: channelLabel(entry?.account_type || fallback.account_type),
        wallet: walletName,
        payer: {
            name: entry?.sender_name || first?.customer_name || null,
            phone: entry?.sender_phone || first?.customer_phone || null,
        },
        items,
        fulfilment: delivery ? {
            mode: delivery.mode === 'pickup' ? 'pickup' : 'deliver',
            address: addr,
            rider: delivery.rider_service_name || null,
            charge: delivery.delivery_charge != null ? Number(delivery.delivery_charge) : null,
        } : null,
        accounting: {
            summary,
            category,
            lines,
            recordedBy: entry?.users?.name || null,
            accountingSync: entry?.qb_sync_status || null,
        },
    };
}

const money = (n: number) => `K${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const formatReceiptDate = (d: string) => {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Self-contained A4/Letter-friendly HTML for expo-print. */
export function renderReceiptHtml(r: InflowReceipt): string {
    const row = (k: string, v: string | null) => (v ? `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>` : '');
    const items = r.items.map((i) => `
        <tr>
            <td><div class="name">${esc(i.name)}</div>
            ${i.responses.map((x) => `<div class="sub">${esc(x.label)}: <b>${esc(x.value)}</b></div>`).join('')}
            ${i.delivery ? `<div class="sub">${i.delivery.delivered ? '✓ Delivered' + (i.delivery.deliveredAt ? ' · ' + esc(formatReceiptDate(i.delivery.deliveredAt)) : '') : 'Awaiting delivery'}</div>` : ''}</td>
            <td class="r">${i.quantity}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${money(i.total)}</td>
        </tr>`).join('');
    const lines = r.accounting.lines.map((l) => `<tr><td>${esc(l.account)}</td><td class="r">${l.debit ? money(l.debit) : ''}</td><td class="r">${l.credit ? money(l.credit) : ''}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:36px;font-size:12px}
h1{font-size:20px;margin:0}.muted{color:#64748b}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:16px}
.tag{color:#0058DB;font-weight:700;letter-spacing:1px}.paid{display:inline-block;margin-top:6px;background:#ecfdf5;color:#059669;font-weight:700;font-size:10px;padding:3px 10px;border-radius:99px;text-transform:uppercase}
h2{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin:22px 0 8px}
table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:left;vertical-align:top}th{font-size:10px;color:#64748b;background:#f8fafc;text-transform:uppercase}
.r{text-align:right}.k{color:#64748b;width:38%}.v{font-weight:600}.name{font-weight:600}.sub{color:#64748b;font-size:11px;margin-top:2px}
.total{display:flex;justify-content:space-between;margin-top:14px;padding:14px 16px;background:#f1f6ff;border-radius:12px;font-size:15px;font-weight:700}
.note{background:#f8fafc;border-radius:10px;padding:10px 12px;color:#334155;margin-bottom:8px}.foot{text-align:center;color:#94a3b8;margin-top:28px;font-size:10px}
</style></head><body>
<div class="top"><div><h1>${esc(r.organizationName)}</h1><div class="muted">Official payment receipt</div></div>
<div style="text-align:right"><div class="tag">RECEIPT</div><div class="muted">#${esc(r.receiptNo)}</div><div class="paid">${esc(r.status.toLowerCase().replace(/_/g, ' '))}</div></div></div>
<h2>Payment</h2><table>${row('Date', formatReceiptDate(r.date))}${row('Payment method', r.paymentMethod)}${row('Channel', r.channel)}${row('Received into', r.wallet)}</table>
<h2>Customer</h2><table>${row('Name', r.payer.name)}${row('Phone', r.payer.phone)}</table>
${r.items.length ? `<h2>Items</h2><table><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr>${items}</table>` : ''}
${r.fulfilment ? `<h2>${r.fulfilment.mode === 'pickup' ? 'Pick-up' : 'Delivery'}</h2><table>${row('Method', r.fulfilment.mode === 'pickup' ? 'Customer picks up' : 'Delivered to customer')}${row('Address', r.fulfilment.address)}${row('Rider service', r.fulfilment.rider)}${row('Delivery charge', r.fulfilment.charge != null ? money(r.fulfilment.charge) : null)}</table>` : ''}
<div class="total"><span>Total received</span><span>${money(r.amount)}</span></div>
<h2>Accounting treatment</h2><div class="note">${esc(r.accounting.summary)}</div>
${lines ? `<table><tr><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr>${lines}</table>` : ''}
<table>${row('Category', r.accounting.category)}${row('Recorded by', r.accounting.recordedBy)}</table>
<div class="foot">Thank you for your payment · Generated by MoneyWise</div>
</body></html>`;
}
