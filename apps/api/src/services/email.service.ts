import { Resend } from 'resend';
import { supabase } from '../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Requisition</a>
                    `;
                    break;

                case 'REQUISITION_APPROVED':
                    recipients = await this.getUserEmail(requisition.requestor_id);
                    subject = `Requisition Approved: ${ref}`;
                    body = `
                        <h2>Your Requisition has been Approved!</h2>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p>Your requisition has been authorised. You will be notified once the funds are ready for collection.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#10b981;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Track Progress</a>
                    `;
                    break;

                case 'REQUISITION_REJECTED':
                    recipients = await this.getUserEmail(requisition.requestor_id);
                    subject = `Requisition Rejected: ${ref}`;
                    body = `
                        <h2 style="color:#dc2626;">Requisition Rejected</h2>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p>Unfortunately, your requisition was not approved at this time.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#ef4444;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Details</a>
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
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#9333ea;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Acknowledge Receipt</a>
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
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#059669;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Verify & Finalize</a>
                    `;
                    break;

                case 'REQUISITION_COMPLETED':
                    recipients = await this.getUserEmail(requisition.requestor_id);
                    subject = `Requisition Cycle Completed: ${ref}`;
                    body = `
                        <h2>Transaction Finalized</h2>
                        <p><strong>Description:</strong> ${requisition.description}</p>
                        <p>Your requisition cycle is now complete. The final expenditure has been verified and recorded.</p>
                        <a href="${requisitionLink}" style="display:inline-block;padding:12px 24px;background-color:#4b5563;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Final Record</a>
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
     * Email confirmation for a paid one-time payment link, sent to the organization's
     * registered admin email (organizations.email). Mirrors
     * whatsappService.notifyPaymentLinkPaid; called alongside it, exactly once per ref.
     */
    async notifyPaymentLinkPaid(organizationId: string, reference: string) {
        try {
            const { data: org } = await supabase
                .from('organizations')
                .select('name, email')
                .eq('id', organizationId)
                .maybeSingle();

            if (!org?.email) {
                console.warn(`[EmailService] No admin email configured for org ${organizationId}; skipping payment-link notification.`);
                return;
            }

            const { data: link, error: linkError } = await supabase
                .from('payment_links')
                .select('customer_name, customer_phone, amount, products(name)')
                .eq('organization_id', organizationId)
                .eq('reference', reference)
                .maybeSingle();

            if (linkError || !link) {
                console.warn(`[EmailService] No payment link found for ref ${reference}; skipping notification.`);
                return;
            }

            const productName = (link as any).products?.name || 'your order';
            const amount = Number(link.amount);
            const html = this.renderPaymentEmail({
                amount,
                customerName: link.customer_name || 'Customer',
                customerPhone: link.customer_phone || undefined,
                serviceLabel: productName,
                reference,
                when: new Date(),
            });

            await this.sendEmail({
                to: [org.email],
                subject: `You just got paid — K${amount.toLocaleString()}`,
                html,
            });
            console.log(`[EmailService] Payment-link notification sent to ${org.email} for ref ${reference}`);
        } catch (error) {
            console.error(`[EmailService] Failed to send payment-link notification for ref ${reference}:`, error);
        }
    },

    /**
     * Email confirmation for a paid public catalogue checkout (one or more product_sales
     * rows sharing a reference, no one-time payment_links row). Mirrors
     * whatsappService.notifyPublicSalePaid; skips references owned by a one-time link.
     */
    async notifyPublicSalePaid(organizationId: string, reference: string) {
        try {
            const { data: org } = await supabase
                .from('organizations')
                .select('name, email')
                .eq('id', organizationId)
                .maybeSingle();

            if (!org?.email) {
                console.warn(`[EmailService] No admin email configured for org ${organizationId}; skipping sale notification.`);
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
                to: [org.email],
                subject: `You just got paid — K${total.toLocaleString()}`,
                html,
            });
            console.log(`[EmailService] Sale notification sent to ${org.email} for ref ${reference} (${sales.length} item(s))`);
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
            const { data: org } = await supabase
                .from('organizations')
                .select('name, email')
                .eq('id', organizationId)
                .maybeSingle();

            if (!org?.email) {
                console.warn(`[EmailService] No admin email configured for org ${organizationId}; skipping inflow notification.`);
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
                <a href="${FRONTEND_URL}/cashbook" style="display:inline-block;padding:12px 24px;background-color:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View in Cashbook</a>
            `;

            await this.sendEmail({
                to: org.email,
                subject: `New Inflow: K${amount.toLocaleString()} — ${accountLabel}`,
                html: this.wrapTemplate(body),
            });
            console.log(`[EmailService] Inflow notification sent to ${org.email} for ${accountLabel} (K${amount})`);
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
                            <div style="font-size:15px; font-weight:700; color:#2563FF; letter-spacing:0.02em;">🎉 You just got paid</div>
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
                            <a href="${ctaUrl}" style="display:block; background:#2563FF; color:#fff; font-size:16px; font-weight:800; padding:17px 24px; border-radius:12px; text-decoration:none; font-family:${FONT_STACK};">View payment in MoneyWise</a>
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
            <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background-color:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Accept Invitation</a>
            <p style="margin-top:16px; font-size:12px; color:#9ca3af;">If this invitation expires, ask your organization admin to resend it.</p>
        `;

        await this.sendEmail({
            to,
            subject: `You've been invited to join ${orgName} on MoneyWise`,
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
                    <h1 style="color: #4f46e5; margin: 0;">MoneyWise</h1>
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
