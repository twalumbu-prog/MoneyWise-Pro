import { Resend } from 'resend';
import { supabase } from '../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);
// Falling back to localhost in production would send email recipients on other
// machines to a dead address — fall back to the real production domain instead,
// matching the pattern used in auth.controller.ts / user.controller.ts.
const FRONTEND_URL = process.env.FRONTEND_URL
    || (process.env.NODE_ENV === 'production' ? 'https://moneywise.blueopus.cloud' : 'http://localhost:5173');

export type NotificationType =
    | 'NEW_REQUISITION'
    | 'REQUISITION_APPROVED'
    | 'REQUISITION_REJECTED'
    | 'CASH_DISBURSED'
    | 'CHANGE_SUBMITTED'
    | 'REQUISITION_COMPLETED';

interface EmailParams {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
}

// A bare HTML body with no plain-text alternative is a well-known spam signal —
// most legitimate mail includes both parts. Auto-derive one when callers don't
// supply their own.
function htmlToPlainText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

interface PaymentLinkItemRow {
    name: string;
    quantity: number;
    unit_price: number;
    check_in?: string;
    check_out?: string;
}

/**
 * A payment_links row is either a legacy single-product link (product_id set,
 * items null — joined `products(name)`) or a multi-item invoice link (product_id
 * null, the basket snapshotted into the `items` JSONB column). Normalize both
 * shapes into one item list so notification emails/messages always itemize
 * correctly instead of falling back to a generic "your order" for invoices.
 */
function normalizePaymentLinkItems(link: { items?: any; amount: number; products?: { name?: string } | null }): PaymentLinkItemRow[] {
    if (Array.isArray(link.items) && link.items.length > 0) {
        return link.items.map((it: any) => ({
            name: it.name || 'Item',
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            ...(it.check_in && it.check_out ? { check_in: it.check_in, check_out: it.check_out } : {})
        }));
    }
    return [{ name: link.products?.name || 'your order', quantity: 1, unit_price: Number(link.amount) || 0 }];
}

function paymentLinkItemLabel(items: PaymentLinkItemRow[]): string {
    return items.map(it => `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''}`).join(', ') || 'your order';
}

export const emailService = {
    /**
     * Send a notification for a requisition event
     */
    async notifyRequisitionEvent(requisitionId: string, type: NotificationType) {
        try {
            // 1. Fetch requisition details
            const { data: requisition, error: reqError } = await supabase
                .from('requisitions')
                .select('*, requestor:users!requestor_id(name)')
                .eq('id', requisitionId)
                .single();

            if (reqError || !requisition) {
                console.error('[EmailService] Requisition not found:', requisitionId);
                return;
            }

            // The app opens a single requisition via a query param on the list page
            // (RequisitionList reads ?id=). There is no /requisitions/:id route, so the
            // old path form landed on a blank page.
            const requisitionLink = `${FRONTEND_URL}/requisitions?id=${requisitionId}`;
            const ref = requisition.reference_number || requisitionId.slice(0, 8);

            // 2. Determine recipients and content based on type
            let recipients: string[] = [];
            let subject = '';
            let body = '';

            switch (type) {
                case 'NEW_REQUISITION':
                    recipients = await this.getEmailsByRoles(requisition.organization_id, ['AUTHORISER', 'ACCOUNTANT', 'ADMIN']);
                    subject = `New Requisition Submitted: ${ref}`;
                    body = `
                        <h2>New Requisition Pending Review</h2>
                        <p><strong>Requestor:</strong> ${requisition.requestor.name}</p>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p><strong>Estimated Total:</strong> K${Number(requisition.estimated_total).toLocaleString()}</p>
                        <p>Please review and authorise the requisition to proceed.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Requisition</a>
                    `;
                    break;

                case 'REQUISITION_APPROVED':
                    recipients = await this.getUserEmail(requisition.requestor_id);
                    subject = `Requisition Approved: ${ref}`;
                    body = `
                        <h2>Your Requisition has been Approved!</h2>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p>Your requisition has been authorised. You will be notified once the funds are ready for collection.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Track Progress</a>
                    `;
                    break;

                case 'REQUISITION_REJECTED':
                    recipients = await this.getUserEmail(requisition.requestor_id);
                    subject = `Requisition Rejected: ${ref}`;
                    body = `
                        <h2 style="color:#002E3B;">Requisition Rejected</h2>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p>Unfortunately, your requisition was not approved at this time.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#002E3B;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Details</a>
                    `;
                    break;

                case 'CASH_DISBURSED':
                    recipients = await this.getUserEmail(requisition.requestor_id);
                    subject = `Funds Ready for Collection: ${ref}`;
                    body = `
                        <h2>Cash Disbursed</h2>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p>Funds for your requisition have been prepared and are ready for collection at the cashier's desk.</p>
                        <p>Please remember to acknowledge receipt in the app after collecting the cash.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Acknowledge Receipt</a>
                    `;
                    break;

                case 'CHANGE_SUBMITTED':
                    recipients = await this.getEmailsByRoles(requisition.organization_id, ['CASHIER', 'ACCOUNTANT', 'ADMIN']);
                    subject = `Change Submitted for Verification: ${ref}`;
                    body = `
                        <h2>Returned Cash Verification Required</h2>
                        <p><strong>Requestor:</strong> ${requisition.requestor.name}</p>
                        <p>The requestor has submitted their final expenditure and returned the unused cash.</p>
                        <p>Please verify the denominations and finalize the ledger entry.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Verify & Finalize</a>
                    `;
                    break;

                case 'REQUISITION_COMPLETED':
                    recipients = await this.getUserEmail(requisition.requestor_id);
                    subject = `Requisition Cycle Completed: ${ref}`;
                    body = `
                        <h2>Transaction Finalized</h2>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p>Your requisition cycle is now complete. The final expenditure has been verified and recorded.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Final Record</a>
                    `;
                    break;
            }

            if (recipients.length > 0) {
                await this.sendEmail({
                    to: recipients,
                    subject,
                    html: this.wrapTemplate(body)
                });
                console.log(`[EmailService] Notification sent successfully to ${recipients.join(', ')} for type ${type}`);
            } else {
                console.warn(`[EmailService] No recipients found for notification type ${type} on requisition ${requisitionId}`);
            }
        } catch (error) {
            console.error('[EmailService] Failed to send notification:', error);
        }
    },

    /**
     * Confirmation for a paid one-time payment link — fires two independent emails:
     *   1. Admin(s) — organizations.email if set, otherwise every ACTIVE ADMIN member
     *      (see getOrgNotificationRecipients).
     *   2. Customer — a receipt, sent only if they gave an email when the link was
     *      created (payment_links.customer_email). This previously never fired, so
     *      payers only ever got the admin-facing "you got paid" copy if it somehow
     *      reached them; now each recipient gets email worded for them.
     * Mirrors whatsappService.notifyPaymentLinkPaid; called alongside it, exactly
     * once per ref. Both legs are independently non-fatal — the admin email still
     * sends if the customer email fails and vice versa.
     */
    async notifyPaymentLinkPaid(organizationId: string, reference: string) {
        const { data: link, error: linkError } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email, amount, items, products(name)')
            .eq('organization_id', organizationId)
            .eq('reference', reference)
            .maybeSingle();

        if (linkError || !link) {
            console.warn(`[EmailService] No payment link found for ref ${reference}; skipping notification.`);
            return;
        }

        const items = normalizePaymentLinkItems(link as any);
        const productLabel = paymentLinkItemLabel(items);
        const amount = Number(link.amount);

        // 1. Admin notification.
        try {
            const { emails } = await this.getOrgNotificationRecipients(organizationId);
            if (emails.length === 0) {
                console.warn(`[EmailService] No admin email or ACTIVE admins found for org ${organizationId}; skipping admin payment-link notification.`);
            } else {
                const html = this.renderPaymentEmail({
                    amount,
                    customerName: link.customer_name || 'Customer',
                    customerPhone: link.customer_phone || undefined,
                    serviceLabel: productLabel,
                    reference,
                    when: new Date(),
                });
                await this.sendEmail({
                    to: emails,
                    subject: `You just got paid — K${amount.toLocaleString()}`,
                    html,
                });
                console.log(`[EmailService] Payment-link notification sent to ${emails.join(', ')} for ref ${reference}`);
            }
        } catch (error) {
            console.error(`[EmailService] Failed to send admin payment-link notification for ref ${reference}:`, error);
        }

        // 2. Customer receipt.
        if (link.customer_email) {
            try {
                const { data: org } = await supabase
                    .from('organizations')
                    .select('name, logo_url')
                    .eq('id', organizationId)
                    .maybeSingle();
                await this.sendPaymentLinkReceipt({
                    to: link.customer_email,
                    orgName: org?.name || 'the business',
                    orgLogoUrl: org?.logo_url || null,
                    customerName: link.customer_name || 'Customer',
                    items,
                    total: amount,
                    reference,
                });
            } catch (error) {
                console.error(`[EmailService] Failed to send customer receipt for ref ${reference}:`, error);
            }
        }
    },

    /**
     * Email confirmation for a paid public catalogue checkout (one or more product_sales
     * rows sharing a reference, no one-time payment_links row). Mirrors
     * whatsappService.notifyPublicSalePaid; skips references owned by a one-time link.
     */
    async notifyPublicSalePaid(organizationId: string, reference: string) {
        try {
            const { emails } = await this.getOrgNotificationRecipients(organizationId);

            if (emails.length === 0) {
                console.warn(`[EmailService] No admin email or ACTIVE admins found for org ${organizationId}; skipping sale notification.`);
                return;
            }

            const { data: link } = await supabase
                .from('payment_links')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('reference', reference)
                .maybeSingle();
            if (link) return; // owned by notifyPaymentLinkPaid

            const { data: sales, error: salesError } = await supabase
                .from('product_sales')
                .select('customer_name, customer_phone, quantity, amount_paid, products(name)')
                .eq('organization_id', organizationId)
                .eq('reference', reference);

            if (salesError || !sales || sales.length === 0) return;

            const customerName = (sales[0] as any).customer_name || 'Customer';
            const customerPhone = (sales[0] as any).customer_phone || '';
            const total = sales.reduce((sum: number, s: any) => sum + Number(s.amount_paid || 0), 0);
            const lines = sales
                .map((s: any) => `${s.quantity || 1}x ${s.products?.name || 'Item'}`)
                .join(', ');

            const html = this.renderPaymentEmail({
                amount: total,
                customerName,
                customerPhone: customerPhone || undefined,
                serviceLabel: lines,
                reference,
                when: new Date(),
            });

            await this.sendEmail({
                to: emails,
                subject: `You just got paid — K${total.toLocaleString()}`,
                html,
            });
            console.log(`[EmailService] Sale notification sent to ${emails.join(', ')} for ref ${reference} (${sales.length} item(s))`);
        } catch (error) {
            console.error(`[EmailService] Failed to send sale notification for ref ${reference}:`, error);
        }
    },

    /**
     * General-purpose "money came in" notification, covering any INFLOW cashbook entry
     * that isn't already covered by a dedicated notification (notifyPaymentLinkPaid /
     * notifyPublicSalePaid) — e.g. a plain wallet top-up, a manual cash/bank/mobile-money
     * inflow logged by staff, or a periodic-sync-healed deposit. Called from
     * cashbookService.createEntry / finalizePendingIntent for every non-PENDING INFLOW,
     * unless the caller opts out because a dedicated email is already being sent.
     */
    async notifyWalletInflow(organizationId: string, entry: {
        description: string;
        debit: number;
        account_type?: string;
        wallet_id?: string | null;
        reference_number?: string | null;
        external_reference?: string | null;
        date: string;
    }) {
        try {
            const { emails } = await this.getOrgNotificationRecipients(organizationId);

            if (emails.length === 0) {
                console.warn(`[EmailService] No admin email or ACTIVE admins found for org ${organizationId}; skipping inflow notification.`);
                return;
            }

            const amount = Number(entry.debit) || 0;
            if (amount <= 0) return;

            const accountLabel = entry.account_type === 'MONEYWISE_WALLET'
                ? 'MoneyWise Wallet'
                : (entry.account_type || 'External Account').replace(/_/g, ' ');
            const ref = entry.reference_number || entry.external_reference || 'N/A';

            const body = `
                <h2>New Inflow Recorded</h2>
                <p>A new inflow of <strong>K${amount.toLocaleString()}</strong> was recorded in your ${accountLabel}.</p>
                <p><strong>Description:</strong> ${entry.description}</p>
                <p><strong>Date:</strong> ${entry.date}</p>
                <p><strong>Reference:</strong> ${ref}</p>
                <a href="${FRONTEND_URL}/cashbook" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View in Cashbook</a>
            `;

            await this.sendEmail({
                to: emails,
                subject: `New Inflow: K${amount.toLocaleString()} — ${accountLabel}`,
                html: this.wrapTemplate(body),
            });
            console.log(`[EmailService] Inflow notification sent to ${emails.join(', ')} for ${accountLabel} (K${amount})`);
        } catch (error) {
            console.error(`[EmailService] Failed to send inflow notification:`, error);
        }
    },

    /**
     * Render the "payment received" celebration email (design: MoneyWise Payment Email,
     * option 1a). Amount is split into whole/decimal so the decimals render smaller,
     * matching the design's big-number treatment.
     */
    renderPaymentEmail(params: {
        amount: number;
        customerName: string;
        customerPhone?: string;
        serviceLabel: string;
        reference: string;
        when: Date;
    }) {
        const { amount, customerName, customerPhone, serviceLabel, reference, when } = params;
        const [whole, decimals = '00'] = amount.toFixed(2).split('.');
        const formattedWhole = Number(whole).toLocaleString();
        const formattedWhen = when.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
        });
        const ctaUrl = `${FRONTEND_URL}/cashbook`;
        const FONT_STACK = "'DM Sans','Figtree',-apple-system,sans-serif";

        // Fixed-width label column so every value starts at the same x position,
        // with a real gap between label and value (not just space-between on a flex
        // row, which several email clients collapse).
        const detailRow = (label: string, value: string, shaded = false, mono = false) => `
            <tr>
                <td style="padding:16px 22px; border-bottom:1px solid #F0F2F4; ${shaded ? 'background:#FAFBFC;' : ''} font-size:14px; color:#7A8189; font-weight:500; width:150px; white-space:nowrap; vertical-align:middle;">${label}</td>
                <td style="padding:16px 22px 16px 0; border-bottom:1px solid #F0F2F4; ${shaded ? 'background:#FAFBFC;' : ''} font-size:${mono ? '13px' : '14px'}; font-weight:700; text-align:left; vertical-align:middle; ${mono ? "font-family:ui-monospace,'SF Mono',Menlo,monospace; color:#5C636B;" : ''}">${value}</td>
            </tr>
        `;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900&family=Figtree:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900&display=swap" rel="stylesheet">
            </head>
            <body style="margin:0; background:#EAECEF; font-family:${FONT_STACK}; color:#16181D;">
                <div style="max-width:640px; margin:0 auto; padding:32px 16px;">
                    <div style="background:#fff; border:1px solid #E2E5E9; border-radius:14px; overflow:hidden; box-shadow:0 30px 60px -30px rgba(22,24,29,0.28);">

                        <div style="padding:30px 44px 8px; text-align:center;">
                            <div style="display:inline-flex; align-items:center;">
                                <span style="font-size:19px; font-weight:800; letter-spacing:-0.02em; font-family:${FONT_STACK};">MoneyWise</span>
                            </div>
                        </div>

                        <div style="padding:26px 44px 38px; text-align:center;">
                            <div style="font-size:15px; font-weight:700; color:#006AFF; letter-spacing:0.02em;">🎉 You just got paid</div>
                            <div style="margin:16px auto 6px;">
                                <div style="font-size:64px; font-weight:900; letter-spacing:-0.035em; line-height:1; font-variant-numeric:tabular-nums;">K${formattedWhole}<span style="font-size:34px; font-weight:800; color:#7A8189;">.${decimals}</span></div>
                            </div>
                            <div style="font-size:16px; color:#5C636B; margin-top:12px;">from <strong style="color:#16181D;">${customerName}</strong> for your <strong style="color:#16181D;">${serviceLabel}</strong></div>
                        </div>

                        <div style="padding:0 44px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EAECEF; border-radius:16px; border-collapse:separate; overflow:hidden;">
                                ${detailRow('Service', serviceLabel)}
                                ${detailRow('Customer', customerName)}
                                ${customerPhone ? detailRow('Phone', customerPhone) : ''}
                                ${detailRow('Payment method', 'Mobile Money')}
                                ${detailRow('Date', formattedWhen)}
                                ${detailRow('Transaction ID', reference, true, true)}
                            </table>
                        </div>

                        <div style="padding:30px 44px 8px; text-align:center;">
                            <a href="${ctaUrl}" style="display:block; background:#006AFF; color:#fff; font-size:16px; font-weight:800; padding:17px 24px; border-radius:12px; text-decoration:none; font-family:${FONT_STACK};">View payment in MoneyWise</a>
                        </div>

                        <div style="margin-top:26px; padding:24px 44px 34px; border-top:1px solid #F0F2F4; text-align:center;">
                            <div style="display:inline-flex; align-items:center; margin-bottom:12px;">
                                <span style="font-size:14px; font-weight:800;">MoneyWise</span>
                            </div>
                            <div style="font-size:12px; color:#9AA0A7; line-height:1.6;">This is an automated payment notification from MoneyWise.</div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
    },

    /**
     * Invoice email for a one-time payment link: itemized basket + a "Pay Now"
     * button linking to /pl/:token. Sent to the customer when an admin generates
     * an invoice link with "send email notification" on. Non-fatal to the caller.
     */
    async sendPaymentLinkInvoice(params: {
        to: string;
        orgName: string;
        orgLogoUrl?: string | null;
        customerName: string;
        items: { name: string; quantity: number; unit_price: number; check_in?: string; check_out?: string }[];
        total: number;
        token: string;
    }) {
        const { to, orgName, orgLogoUrl, customerName, items, total, token } = params;
        const payUrl = `${FRONTEND_URL}/pl/${token}`;
        const FONT_STACK = "'DM Sans','Figtree',-apple-system,sans-serif";
        const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        const rows = items.map(it => {
            const isBooking = !!(it.check_in && it.check_out);
            const qtyLabel = isBooking
                ? `${it.check_in} → ${it.check_out} · ${it.quantity} day(s)`
                : `x${it.quantity}`;
            return `
                <tr>
                    <td style="padding:14px 22px; border-bottom:1px solid #F0F2F4; font-size:14px; color:#16181D; font-weight:600;">
                        ${it.name}
                        <div style="font-size:12px; color:#7A8189; font-weight:500; margin-top:2px;">${qtyLabel}</div>
                    </td>
                    <td style="padding:14px 22px; border-bottom:1px solid #F0F2F4; font-size:14px; font-weight:700; text-align:right; white-space:nowrap;">${money(it.unit_price * it.quantity)}</td>
                </tr>`;
        }).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="margin:0; background:#EAECEF; font-family:${FONT_STACK}; color:#16181D;">
                <div style="max-width:640px; margin:0 auto; padding:32px 16px;">
                    <div style="background:#fff; border:1px solid #E2E5E9; border-radius:14px; overflow:hidden; box-shadow:0 30px 60px -30px rgba(22,24,29,0.28);">
                        <div style="padding:30px 44px 8px; text-align:center;">
                            ${orgLogoUrl ? `<img src="${orgLogoUrl}" alt="${orgName}" style="height:40px; width:auto; max-width:140px; object-fit:contain; margin-bottom:10px;">` : ''}
                            <div style="font-size:19px; font-weight:800; letter-spacing:-0.02em;">${orgName}</div>
                        </div>

                        <div style="padding:20px 44px 8px; text-align:center;">
                            <div style="font-size:15px; font-weight:700; color:#006AFF;">Payment request</div>
                            <div style="font-size:15px; color:#5C636B; margin-top:8px;">Hi ${customerName}, here's your invoice from <strong style="color:#16181D;">${orgName}</strong>.</div>
                            <div style="margin:18px auto 4px;">
                                <div style="font-size:48px; font-weight:900; letter-spacing:-0.03em; line-height:1;">${money(total)}</div>
                            </div>
                        </div>

                        <div style="padding:12px 44px 4px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EAECEF; border-radius:16px; border-collapse:separate; overflow:hidden;">
                                ${rows}
                                <tr>
                                    <td style="padding:16px 22px; font-size:15px; font-weight:800;">Total</td>
                                    <td style="padding:16px 22px; font-size:15px; font-weight:900; text-align:right;">${money(total)}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="padding:26px 44px 8px; text-align:center;">
                            <a href="${payUrl}" style="display:block; background:#006AFF; color:#fff; font-size:16px; font-weight:800; padding:17px 24px; border-radius:12px; text-decoration:none; font-family:${FONT_STACK};">Pay now</a>
                            <div style="font-size:12px; color:#9AA0A7; margin-top:12px; word-break:break-all;">${payUrl}</div>
                        </div>

                        <div style="margin-top:22px; padding:20px 44px 30px; border-top:1px solid #F0F2F4; text-align:center;">
                            <div style="font-size:12px; color:#9AA0A7; line-height:1.6;">This is a secure one-time payment link. Payments are processed via Lenco. Powered by MoneyWise.</div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        await this.sendEmail({
            to,
            subject: `${orgName} sent you an invoice — ${money(total)}`,
            html,
        });
        console.log(`[EmailService] Invoice link email sent to ${to} for token ${token}`);
    },

    /**
     * Receipt email for a paid one-time payment link, sent to the customer who
     * paid (payment_links.customer_email). Same visual language as
     * sendPaymentLinkInvoice but worded as a confirmation, not a request — no
     * "Pay now" button since the link is already settled.
     */
    async sendPaymentLinkReceipt(params: {
        to: string;
        orgName: string;
        orgLogoUrl?: string | null;
        customerName: string;
        items: { name: string; quantity: number; unit_price: number; check_in?: string; check_out?: string }[];
        total: number;
        reference: string;
    }) {
        const { to, orgName, orgLogoUrl, customerName, items, total, reference } = params;
        const FONT_STACK = "'DM Sans','Figtree',-apple-system,sans-serif";
        const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        const rows = items.map(it => {
            const isBooking = !!(it.check_in && it.check_out);
            const qtyLabel = isBooking
                ? `${it.check_in} → ${it.check_out} · ${it.quantity} day(s)`
                : `x${it.quantity}`;
            return `
                <tr>
                    <td style="padding:14px 22px; border-bottom:1px solid #F0F2F4; font-size:14px; color:#16181D; font-weight:600;">
                        ${it.name}
                        <div style="font-size:12px; color:#7A8189; font-weight:500; margin-top:2px;">${qtyLabel}</div>
                    </td>
                    <td style="padding:14px 22px; border-bottom:1px solid #F0F2F4; font-size:14px; font-weight:700; text-align:right; white-space:nowrap;">${money(it.unit_price * it.quantity)}</td>
                </tr>`;
        }).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="margin:0; background:#EAECEF; font-family:${FONT_STACK}; color:#16181D;">
                <div style="max-width:640px; margin:0 auto; padding:32px 16px;">
                    <div style="background:#fff; border:1px solid #E2E5E9; border-radius:14px; overflow:hidden; box-shadow:0 30px 60px -30px rgba(22,24,29,0.28);">
                        <div style="padding:30px 44px 8px; text-align:center;">
                            ${orgLogoUrl ? `<img src="${orgLogoUrl}" alt="${orgName}" style="height:40px; width:auto; max-width:140px; object-fit:contain; margin-bottom:10px;">` : ''}
                            <div style="font-size:19px; font-weight:800; letter-spacing:-0.02em;">${orgName}</div>
                        </div>

                        <div style="padding:20px 44px 8px; text-align:center;">
                            <div style="font-size:15px; font-weight:700; color:#059669;">✅ Payment confirmed</div>
                            <div style="font-size:15px; color:#5C636B; margin-top:8px;">Hi ${customerName}, thank you for your payment to <strong style="color:#16181D;">${orgName}</strong>.</div>
                            <div style="margin:18px auto 4px;">
                                <div style="font-size:48px; font-weight:900; letter-spacing:-0.03em; line-height:1;">${money(total)}</div>
                            </div>
                        </div>

                        <div style="padding:12px 44px 4px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EAECEF; border-radius:16px; border-collapse:separate; overflow:hidden;">
                                ${rows}
                                <tr>
                                    <td style="padding:16px 22px; font-size:15px; font-weight:800;">Total Paid</td>
                                    <td style="padding:16px 22px; font-size:15px; font-weight:900; text-align:right;">${money(total)}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="padding:20px 44px 8px; text-align:center;">
                            <div style="font-size:12px; color:#9AA0A7; font-family:ui-monospace,'SF Mono',Menlo,monospace;">Reference: ${reference}</div>
                        </div>

                        <div style="margin-top:14px; padding:20px 44px 30px; border-top:1px solid #F0F2F4; text-align:center;">
                            <div style="font-size:12px; color:#9AA0A7; line-height:1.6;">This is your receipt for a payment processed via Lenco. Powered by MoneyWise.</div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        await this.sendEmail({
            to,
            subject: `Payment received — ${money(total)}`,
            html,
        });
        console.log(`[EmailService] Payment receipt sent to ${to} for ref ${reference}`);
    },

    /**
     * Invite a new team member to join an organization. Sent via our own Resend
     * integration instead of Supabase's built-in invite email (which the org found
     * unreliable) — the auth user/invite token is still created via
     * supabase.auth.admin.generateLink, we just own delivery of the link.
     */
    async sendTeamInvite(params: { to: string; inviteeName: string; orgName: string; role: string; actionLink: string }) {
        const { to, inviteeName, orgName, role, actionLink } = params;
        const body = `
            <h2>You've been invited to join ${orgName}</h2>
            <p>Hi ${inviteeName || 'there'},</p>
            <p>You've been invited to join <strong>${orgName}</strong> on MoneyWise as a <strong>${role}</strong>.</p>
            <p>Click below to set your password and activate your account. This link expires in <strong>12 hours</strong>.</p>
            <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Accept Invitation</a>
            <p style="margin-top:16px; font-size:12px; color:#9ca3af;">If this invitation expires, ask your organization admin to resend it.</p>
        `;

        await this.sendEmail({
            to,
            subject: `You've been invited to join ${orgName} on MoneyWise`,
            html: this.wrapTemplate(body),
        });
    },

    /**
     * Notify someone who already has a MoneyWise account that an admin just added
     * them to ANOTHER organization. This path skips sendTeamInvite entirely (no
     * password to set — they already have an account), so without this the person
     * was silently linked into a new org with zero notification.
     */
    async notifyAddedToOrganization(params: { to: string; name: string; orgName: string; role: string }) {
        const { to, name, orgName, role } = params;
        const body = `
            <h2>You've been added to ${orgName}</h2>
            <p>Hi ${name || 'there'},</p>
            <p>An admin has added your existing MoneyWise account to <strong>${orgName}</strong> as a <strong>${role}</strong>.</p>
            <p>Sign in and use the organization switcher to access it.</p>
            <a href="${FRONTEND_URL}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Open MoneyWise</a>
            <p style="margin-top:16px; font-size:12px; color:#9ca3af;">If you weren't expecting this, contact that organization's admin.</p>
        `;

        await this.sendEmail({
            to,
            subject: `You've been added to ${orgName} on MoneyWise`,
            html: this.wrapTemplate(body),
        });
    },

    /**
     * Password reset email. Like sendTeamInvite, the recovery token is minted via
     * supabase.auth.admin.generateLink({ type: 'recovery' }) and we deliver the
     * action_link ourselves via Resend (Supabase's own recovery email was unreliable).
     */
    async sendPasswordReset(params: { to: string; name?: string; actionLink: string }) {
        const { to, name, actionLink } = params;
        const body = `
            <h2>Reset your password</h2>
            <p>Hi ${name || 'there'},</p>
            <p>We received a request to reset the password for your MoneyWise account. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
            <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Reset Password</a>
            <p style="margin-top:16px; font-size:12px; color:#9ca3af;">If you didn't request a password reset, you can safely ignore this email — your password will stay the same.</p>
        `;

        await this.sendEmail({
            to,
            subject: 'Reset your MoneyWise password',
            html: this.wrapTemplate(body),
        });
    },

    /**
     * Wrap body in a nice HTML email container
     */
    wrapTemplate(content: string) {
        return `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; color: #1f2937;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h1 style="color: #006AFF; margin: 0;">MoneyWise</h1>
                    <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0;">MoneyWise Cashflow Management</p>
                </div>
                ${content}
                <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #9ca3af; text-align: center;">
                    <p>This is an automated message from the MoneyWise system.</p>
                    <p>&copy; 2026 MoneyWise. All rights reserved.</p>
                </div>
            </div>
        `;
    },

    /**
     * Resolve who should receive payment/inflow notifications for an organization.
     *
     * organizations.email is a manually-entered field that most orgs never fill in —
     * an audit found 14 of 17 live organizations had it unset, silently swallowing
     * every payment-received / inflow email for them (confirmed live: a real payment
     * to TAEMJA General Dealers produced zero email because org.email was null).
     * Falls back to that org's ACTIVE ADMIN members, which always exist, instead of
     * silently dropping the notification.
     */
    async getOrgNotificationRecipients(organizationId: string): Promise<{ orgName: string; emails: string[] }> {
        const { data: org } = await supabase
            .from('organizations')
            .select('name, email')
            .eq('id', organizationId)
            .maybeSingle();

        const orgName = org?.name || 'your organization';

        if (org?.email) {
            return { orgName, emails: [org.email] };
        }

        const adminEmails = await this.getEmailsByRoles(organizationId, ['ADMIN']);
        return { orgName, emails: adminEmails };
    },

    /**
     * Get email address for a specific user ID
     */
    async getUserEmail(userId: string): Promise<string[]> {
        const { data, error } = await (supabase.auth as any).admin.getUserById(userId);
        if (error || !data.user?.email) return [];
        return [data.user.email];
    },

    /**
     * Get email addresses for all ACTIVE members of a SPECIFIC organization holding
     * one of the given roles.
     *
     * IMPORTANT: this must be scoped to the organization. Membership + per-org role live
     * in `user_organizations` (a user can belong to several orgs with different roles),
     * NOT in `public.users.role` (which only reflects the user's currently-active org).
     * An earlier version queried `public.users` by role with no org filter, which leaked
     * requisition notifications to admins of every other organization — a cross-tenant
     * data exposure. Always filter by organization_id here.
     */
    async getEmailsByRoles(organizationId: string, roles: string[]): Promise<string[]> {
        if (!organizationId) {
            console.error('[EmailService] getEmailsByRoles called without organizationId — refusing to send to avoid cross-tenant leak.');
            return [];
        }

        const { data, error } = await supabase
            .from('user_organizations')
            .select('user:users!inner(email)')
            .eq('organization_id', organizationId)
            .in('role', roles)
            .eq('status', 'ACTIVE');

        if (error || !data) {
            console.error('[EmailService] Error fetching org role members:', error);
            return [];
        }

        const recipients = [...new Set(
            data
                .map((r: any) => r.user?.email)
                .filter((e: any): e is string => !!e)
        )];

        console.log(`[EmailService] Matched ${recipients.length} recipients for org ${organizationId} with roles: ${roles.join(', ')}`);
        return recipients;
    },

    /**
     * Low-level send method
     */
    async sendEmail(params: EmailParams) {
        if (!process.env.RESEND_API_KEY) {
            console.warn('[EmailService] RESEND_API_KEY not set. Skipping email send.');
            console.log('[EmailService] WOULD HAVE SENT:', params.subject, 'to', params.to);
            return;
        }

        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'MoneyWise <notifications@resend.dev>', // Use verified domain in prod
            to: params.to,
            subject: params.subject,
            html: params.html,
            text: params.text || htmlToPlainText(params.html),
        });

        if (error) {
            console.error('[EmailService] Resend error:', error);
            throw error;
        }

        console.log('[EmailService] Email sent successfully:', data?.id);
    }
};
