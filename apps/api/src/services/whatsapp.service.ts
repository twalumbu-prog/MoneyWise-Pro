import axios from 'axios';
import { supabase } from '../lib/supabase';

/**
 * WhatsApp notifications via WaAPI (https://waapi.app).
 *
 * This is a server-to-server REST integration, NOT the WaAPI MCP server. The MCP
 * config (claude mcp add / .mcp.json) is only for driving WaAPI interactively from
 * a Claude client — it plays no part in the app sending messages. At runtime we call
 * the REST endpoint directly:
 *   POST {BASE_URL}/instances/{instanceId}/client/action/send-message
 *
 * Config (set in apps/api/.env, and on the PROD API since the Lenco webhook + 5-min
 * sync both run there — see lenco-sync-architecture memory):
 *   WAAPI_API_TOKEN            (required) Bearer token from waapi.app/user/api-tokens
 *   WAAPI_INSTANCE_ID          (required) The connected WhatsApp instance id
 *   WAAPI_ADMIN_PHONE          (optional) Fallback admin number when an org has no phone
 *   WAAPI_DEFAULT_COUNTRY_CODE (optional) Digits prepended to local numbers; default 260 (Zambia)
 *   WAAPI_BASE_URL             (optional) default https://waapi.app/api/v1
 *
 * Like email.service.ts, every failure is non-fatal and logged — a notification must
 * never block or roll back the payment ledger.
 */

const BASE_URL = process.env.WAAPI_BASE_URL || 'https://waapi.app/api/v1';
const API_TOKEN = process.env.WAAPI_API_TOKEN;
const INSTANCE_ID = process.env.WAAPI_INSTANCE_ID;
const ADMIN_PHONE = process.env.WAAPI_ADMIN_PHONE;
const DEFAULT_COUNTRY_CODE = (process.env.WAAPI_DEFAULT_COUNTRY_CODE || '260').replace(/\D/g, '');

const isConfigured = (): boolean => !!(API_TOKEN && INSTANCE_ID);

/**
 * Normalise a stored phone number into a WaAPI chatId: {country_code}{number}@c.us
 * with no leading + or 00. Handles the local Zambian formats we store
 * (e.g. 0977123456, +260 977 123 456, 260977123456, 977123456).
 * Returns null if there aren't enough digits to be a real number.
 */
export function toChatId(rawPhone: string | null | undefined): string | null {
    if (!rawPhone) return null;
    let digits = String(rawPhone).replace(/\D/g, '');
    if (!digits) return null;

    if (digits.startsWith('00')) {
        digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
        // National format with trunk prefix → swap the 0 for the country code.
        digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
    } else if (digits.length <= 9) {
        // Bare national significant number (no trunk 0, no country code).
        digits = DEFAULT_COUNTRY_CODE + digits;
    }
    // Otherwise assume it already carries a country code.

    if (digits.length < 10) return null; // too short to be dialable
    return `${digits}@c.us`;
}

export const whatsappService = {
    /**
     * Low-level WaAPI send. Resolves on success, swallows + logs errors so callers
     * can fire several messages without one failure aborting the rest.
     */
    async sendMessage(chatId: string | null, message: string): Promise<boolean> {
        if (!isConfigured()) {
            console.warn('[WhatsApp] WAAPI_API_TOKEN / WAAPI_INSTANCE_ID not set. Skipping send.');
            console.log('[WhatsApp] WOULD HAVE SENT to', chatId, '\n', message);
            return false;
        }
        if (!chatId) {
            console.warn('[WhatsApp] No valid chatId resolved. Skipping send.');
            return false;
        }

        try {
            await axios.post(
                `${BASE_URL}/instances/${INSTANCE_ID}/client/action/send-message`,
                { chatId, message },
                {
                    headers: {
                        Authorization: `Bearer ${API_TOKEN}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    timeout: 15000,
                }
            );
            console.log(`[WhatsApp] Sent message to ${chatId}`);
            return true;
        } catch (err: any) {
            const detail = err?.response?.data || err?.message || err;
            console.error(`[WhatsApp] Failed to send to ${chatId}:`, detail);
            return false;
        }
    },

    /**
     * Fire the two payment-confirmation messages for a paid one-time payment link:
     *   1. Admin   → "money has come in" with the customer + amount.
     *   2. Customer → a thank-you / receipt confirmation.
     *
     * Called from the Lenco collection handler only when the link actually
     * transitions ACTIVE→PAID, so it sends exactly once regardless of whether the
     * webhook or the periodic sync finalised the payment first.
     */
    async notifyPaymentLinkPaid(organizationId: string, reference: string): Promise<void> {
        try {
            if (!reference) return;

            const { data: link, error: linkError } = await supabase
                .from('payment_links')
                .select('customer_name, customer_phone, amount, products(name)')
                .eq('organization_id', organizationId)
                .eq('reference', reference)
                .maybeSingle();

            if (linkError || !link) {
                console.warn(`[WhatsApp] No payment link found for ref ${reference}; skipping notification.`);
                return;
            }

            const { data: org } = await supabase
                .from('organizations')
                .select('name, phone')
                .eq('id', organizationId)
                .maybeSingle();

            const orgName = org?.name || 'MoneyWise';
            const productName = (link as any).products?.name || 'your order';
            const customerName = link.customer_name || 'Customer';
            const amount = `K${Number(link.amount).toLocaleString()}`;
            const when = new Date().toLocaleString();

            // 1. Admin / business notification.
            const adminChatId = toChatId(org?.phone) || toChatId(ADMIN_PHONE);
            const adminMessage =
                `✅ *Payment received* — ${orgName}\n\n` +
                `Product: ${productName}\n` +
                `Customer: ${customerName} (${link.customer_phone})\n` +
                `Amount: ${amount}\n` +
                `Reference: ${reference}\n` +
                `${when}`;
            await this.sendMessage(adminChatId, adminMessage);

            // 2. Customer confirmation.
            const customerChatId = toChatId(link.customer_phone);
            const customerMessage =
                `Hi ${customerName}, we've received your payment of ${amount} for ${productName}. ` +
                `Thank you for your business with ${orgName}!\n\n` +
                `Reference: ${reference}`;
            await this.sendMessage(customerChatId, customerMessage);

            console.log(`[WhatsApp] Payment-link notifications dispatched for ref ${reference}.`);
        } catch (err: any) {
            // Never let a notification failure bubble into the payment flow.
            console.error(`[WhatsApp] notifyPaymentLinkPaid error for ref ${reference}:`, err?.message || err);
        }
    },

    /**
     * Confirmation for a public catalogue checkout — the external payment link where a
     * customer can pick multiple products. These land as one or more `product_sales`
     * rows sharing a reference (no one-time `payment_links` row).
     *
     * Called from the owning finalization of the Lenco collection handler (the dedup
     * guard means the success path runs once per reference). It self-guards two ways so
     * it's safe to call unconditionally: it skips references that belong to a one-time
     * link (handled by notifyPaymentLinkPaid) and no-ops for references with no product
     * sales (plain wallet deposits, change returns, etc.).
     */
    async notifyPublicSalePaid(organizationId: string, reference: string): Promise<void> {
        try {
            if (!reference) return;

            // A one-time link owns its own notification — don't double up.
            const { data: link } = await supabase
                .from('payment_links')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('reference', reference)
                .maybeSingle();
            if (link) return;

            const { data: sales, error: salesError } = await supabase
                .from('product_sales')
                .select('customer_name, customer_phone, quantity, amount_paid, products(name)')
                .eq('organization_id', organizationId)
                .eq('reference', reference);

            if (salesError || !sales || sales.length === 0) return; // not a product sale → nothing to confirm

            const { data: org } = await supabase
                .from('organizations')
                .select('name, phone')
                .eq('id', organizationId)
                .maybeSingle();

            const orgName = org?.name || 'MoneyWise';
            const customerName = (sales[0] as any).customer_name || 'Customer';
            const customerPhone = (sales[0] as any).customer_phone || '';
            const total = sales.reduce((sum, s: any) => sum + Number(s.amount_paid || 0), 0);
            const amount = `K${total.toLocaleString()}`;
            const when = new Date().toLocaleString();

            // One line per product: "2x Widget".
            const lines = sales
                .map((s: any) => `• ${s.quantity || 1}x ${s.products?.name || 'Item'}`)
                .join('\n');

            // 1. Admin / business notification.
            const adminChatId = toChatId(org?.phone) || toChatId(ADMIN_PHONE);
            const adminMessage =
                `✅ *Payment received* — ${orgName}\n\n` +
                `${lines}\n\n` +
                `Customer: ${customerName} (${customerPhone})\n` +
                `Total: ${amount}\n` +
                `Reference: ${reference}\n` +
                `${when}`;
            await this.sendMessage(adminChatId, adminMessage);

            // 2. Customer confirmation.
            const customerChatId = toChatId(customerPhone);
            const customerMessage =
                `Hi ${customerName}, we've received your payment of ${amount}. Thank you for your order with ${orgName}!\n\n` +
                `${lines}\n\n` +
                `Reference: ${reference}`;
            await this.sendMessage(customerChatId, customerMessage);

            console.log(`[WhatsApp] Public-sale notifications dispatched for ref ${reference} (${sales.length} item(s)).`);
        } catch (err: any) {
            console.error(`[WhatsApp] notifyPublicSalePaid error for ref ${reference}:`, err?.message || err);
        }
    },
};
