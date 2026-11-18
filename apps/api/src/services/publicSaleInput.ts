/**
 * Validation for POST /api/v1/sales, kept free of I/O so it can be tested on its own (npm run test:sales).
 * Turns the public body into the staff screen's cart shape that services/manualSale.service.ts books.
 */
import type { ManualSaleItem } from './manualSale.service';

export const SALE_ACCOUNT_TYPES = ['CASH', 'AIRTEL_MONEY', 'BANK'] as const;
export type SaleAccountType = typeof SALE_ACCOUNT_TYPES[number];

/** Label shown at the end of the cashbook description, matching the staff New Sale screen ("… | Cash"). */
export const METHOD_LABELS: Record<SaleAccountType, string> = { CASH: 'Cash', AIRTEL_MONEY: 'Airtel Money', BANK: 'Bank' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SALE_ITEMS = 100;

export const isIsoDate = (s: unknown): s is string =>
    typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export interface ParsedProductItem { kind: 'product'; product_id: string; quantity: number; price: number; check_in: string | null; check_out: string | null }
export interface ParsedCustomItem { kind: 'custom'; name: string; income_account: string | null; quantity: number; price: number }
export type ParsedSaleItem = ParsedProductItem | ParsedCustomItem;

export interface ParsedSale {
    external_reference: string;
    date: string;
    amount: number;
    account_type: SaleAccountType;
    customer_name: string | null;
    customer_phone: string | null;
    items: ParsedSaleItem[];
}

export type ParseResult = { ok: true; sale: ParsedSale } | { ok: false; error: string };

const optString = (v: unknown, field: string, max: number): string | null | { error: string } => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string' || v.trim().length > max) return { error: `\`${field}\` must be a string of at most ${max} characters` };
    return v.trim() || null;
};

export function parseSaleBody(body: any): ParseResult {
    const b = body ?? {};
    const bad = (error: string): ParseResult => ({ ok: false, error });

    const ref = typeof b.external_reference === 'string' ? b.external_reference.trim() : '';
    if (!ref || ref.length > 120) return bad('`external_reference` (1–120 characters) is required');

    if (!isIsoDate(b.date)) return bad('`date` must be a valid YYYY-MM-DD date');

    const amount = typeof b.amount === 'number' ? b.amount : NaN;
    if (!Number.isFinite(amount) || amount <= 0) return bad('`amount` must be a number greater than 0');

    const accountType = typeof b.account_type === 'string' ? b.account_type.toUpperCase() : '';
    if (!(SALE_ACCOUNT_TYPES as readonly string[]).includes(accountType)) return bad(`\`account_type\` must be one of: ${SALE_ACCOUNT_TYPES.join(', ')}`);

    const customerName = optString(b.customer_name, 'customer_name', 200);
    if (customerName && typeof customerName === 'object') return bad(customerName.error);
    const customerPhone = optString(b.customer_phone, 'customer_phone', 40);
    if (customerPhone && typeof customerPhone === 'object') return bad(customerPhone.error);

    if (!Array.isArray(b.items) || b.items.length === 0) return bad('`items` must be a non-empty array');
    if (b.items.length > MAX_SALE_ITEMS) return bad(`At most ${MAX_SALE_ITEMS} items per sale`);

    const items: ParsedSaleItem[] = [];
    for (let i = 0; i < b.items.length; i++) {
        const it = b.items[i] ?? {};
        const at = `items[${i}]`;
        const quantity = it.quantity === undefined ? 1 : it.quantity;
        if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return bad(`\`${at}.quantity\` must be a number greater than 0`);
        const price = it.price;
        if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return bad(`\`${at}.price\` must be a non-negative number`);

        if (it.product_id !== undefined && it.product_id !== null) {
            if (typeof it.product_id !== 'string' || !UUID.test(it.product_id)) return bad(`\`${at}.product_id\` must be a UUID`);
            const ci = it.check_in ?? null, co = it.check_out ?? null;
            if ((ci === null) !== (co === null)) return bad(`\`${at}\` needs both check_in and check_out, or neither`);
            if (ci !== null && (!isIsoDate(ci) || !isIsoDate(co) || co <= ci)) return bad(`\`${at}.check_out\` must be a YYYY-MM-DD date after check_in`);
            items.push({ kind: 'product', product_id: it.product_id, quantity, price, check_in: ci, check_out: co });
            continue;
        }

        const name = typeof it.name === 'string' ? it.name.trim() : '';
        if (!name || name.length > 200) return bad(`\`${at}\` needs a \`product_id\` or a \`name\` (1–200 characters)`);
        if (price <= 0) return bad(`\`${at}.price\` must be greater than 0 for an item without a product_id`);
        if (it.check_in !== undefined || it.check_out !== undefined) return bad(`\`${at}\`: booking dates need a \`product_id\``);
        let income: string | null = null;
        if (it.income_account !== undefined && it.income_account !== null) {
            if (typeof it.income_account !== 'string' || it.income_account.trim().length > 200) return bad(`\`${at}.income_account\` must be a string`);
            income = it.income_account.trim() || null;
        }
        items.push({ kind: 'custom', name, income_account: income, quantity, price });
    }

    return {
        ok: true,
        sale: {
            external_reference: ref,
            date: b.date,
            amount: Math.round(amount * 100) / 100,
            account_type: accountType as SaleAccountType,
            customer_name: customerName as string | null,
            customer_phone: customerPhone as string | null,
            items,
        },
    };
}

export interface IncomeAccount { id: string; code: string | null; name: string; is_active?: boolean | null }

/**
 * An INCOME account named by id, code or name (case-insensitive). When it's missing or matches nothing, falls back to
 * the organization's income account whose name contains "accommodation" (active first, then by name); null if none.
 */
export function resolveIncomeAccount(accounts: IncomeAccount[], given: string | null): IncomeAccount | null {
    const usable = [...accounts].sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false) || a.name.localeCompare(b.name));
    if (given) {
        const q = given.trim().toLowerCase();
        const hit = usable.find(a => a.id.toLowerCase() === q)
            ?? usable.find(a => (a.code ?? '').trim().toLowerCase() === q)
            ?? usable.find(a => a.name.trim().toLowerCase() === q);
        if (hit) return hit;
    }
    return usable.find(a => a.name.toLowerCase().includes('accommodation')) ?? null;
}

/** The parsed items in the cart shape recordManualSale books (custom lines carry their resolved income account id). */
export function toCartItems(items: ParsedSaleItem[], incomeIdFor: (item: ParsedCustomItem) => string): ManualSaleItem[] {
    return items.map(it => it.kind === 'product'
        ? { id: it.product_id, quantity: it.quantity, price: it.price, ...(it.check_in ? { check_in: it.check_in, check_out: it.check_out } : {}) }
        : { custom: true, name: it.name, income_account_id: incomeIdFor(it), quantity: it.quantity, price: it.price });
}
