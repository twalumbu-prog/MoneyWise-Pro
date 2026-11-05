/**
 * invoiceShortLink.service.ts — short, readable invoice links: /<business-code>/invoice/<n>.
 *
 * The business code is its initials ("Twalumbu Education Centre" → "tec"), made unique with a numeric suffix when two
 * businesses share initials. The number is that business's own running invoice number, so code + number is globally
 * unique. The long /pl/<token> link keeps working; this only adds a friendlier way in that resolves to the same link.
 */
import { supabase } from '../lib/supabase';

const MAX_CODE = 5;

export const initialsOf = (name: string): string => {
    const words = (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const stop = new Set(['of', 'and', 'the', 'for', 'ltd', 'limited', 'plc']);
    const sig = words.filter((w) => !stop.has(w));
    const use = sig.length ? sig : words;
    if (use.length >= 2) return use.map((w) => w[0]).join('').slice(0, MAX_CODE);
    return (use[0] || 'inv').slice(0, 3);
};

/** The business's invoice code, created on first use. */
export async function ensureInvoiceCode(orgId: string): Promise<string> {
    const { data: org } = await supabase.from('organizations').select('name, invoice_code').eq('id', orgId).maybeSingle();
    if (!org) throw new Error('Organization not found');
    if (org.invoice_code) return org.invoice_code;

    const base = initialsOf(org.name);
    for (let n = 0; n < 50; n++) {
        const candidate = n === 0 ? base : `${base}${n + 1}`;
        const { error } = await supabase.from('organizations').update({ invoice_code: candidate }).eq('id', orgId).is('invoice_code', null);
        if (!error) {
            const { data: now } = await supabase.from('organizations').select('invoice_code').eq('id', orgId).maybeSingle();
            if (now?.invoice_code) return now.invoice_code; // ours, or one a concurrent request set first
        } else if (error.code !== '23505') throw error;
    }
    throw new Error('Could not allocate an invoice code');
}

export interface ShortLink { code: string; invoice_no: number; path: string }

/**
 * Gives a payment link its short path (idempotent). `preferredNo` lets a credit invoice's link reuse the invoice's own
 * number (INV-0007 → /tec/invoice/7) when that number is still free.
 */
export async function assignShortLink(orgId: string, linkId: string, preferredNo?: number): Promise<ShortLink> {
    const code = await ensureInvoiceCode(orgId);
    const { data: link } = await supabase.from('payment_links').select('invoice_no').eq('id', linkId).eq('organization_id', orgId).maybeSingle();
    if (link?.invoice_no) return { code, invoice_no: link.invoice_no, path: `/${code}/invoice/${link.invoice_no}` };

    for (let attempt = 0; attempt < 8; attempt++) {
        let no = attempt === 0 && preferredNo && preferredNo > 0 ? preferredNo : 0;
        if (!no) {
            const { data: top } = await supabase.from('payment_links').select('invoice_no').eq('organization_id', orgId)
                .not('invoice_no', 'is', null).order('invoice_no', { ascending: false }).limit(1).maybeSingle();
            no = (top?.invoice_no || 0) + 1;
        }
        const { error } = await supabase.from('payment_links').update({ invoice_no: no }).eq('id', linkId).is('invoice_no', null);
        if (!error) return { code, invoice_no: no, path: `/${code}/invoice/${no}` };
        if (error.code !== '23505') throw error;
    }
    throw new Error('Could not allocate an invoice number');
}

/** Short path for a link that already has one (no side effects). */
export async function shortPathFor(orgId: string, invoiceNo: number | null | undefined): Promise<string | null> {
    if (!invoiceNo) return null;
    const { data } = await supabase.from('organizations').select('invoice_code').eq('id', orgId).maybeSingle();
    return data?.invoice_code ? `/${data.invoice_code}/invoice/${invoiceNo}` : null;
}

/** code + number → the payment link's token (null when there is no such link). */
export async function resolveShortLink(code: string, invoiceNo: number): Promise<string | null> {
    const { data: org } = await supabase.from('organizations').select('id').eq('invoice_code', String(code).toLowerCase()).maybeSingle();
    if (!org) return null;
    const { data: link } = await supabase.from('payment_links').select('token').eq('organization_id', org.id).eq('invoice_no', invoiceNo).maybeSingle();
    return link?.token || null;
}
