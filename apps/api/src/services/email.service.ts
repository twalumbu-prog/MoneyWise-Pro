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

            const requisitionLink = `${FRONTEND_URL}/requisitions/${requisitionId}`;
            const ref = requisition.reference_number || requisitionId.slice(0, 8);

            // 2. Determine recipients and content based on type
            let recipients: string[] = [];
            let subject = '';
            let body = '';

            switch (type) {
                case 'NEW_REQUISITION':
                    recipients = await this.getEmailsByRoles(['AUTHORISER', 'ACCOUNTANT', 'ADMIN']);
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
                    recipients = await this.getEmailsByRoles(['CASHIER', 'ACCOUNTANT', 'ADMIN']);
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

            // ---------------------------------------------------------------------------
            // TEST OVERRIDE: Redirect all emails to account owner for testing
            // ---------------------------------------------------------------------------
            // Since we are on Resend's free tier without a verified domain, we can ONLY
            // send to the registered account email. We override the real recipients here.
            const TEST_RECIPIENT = 'twalumbuaccsdept@gmail.com';
            if (process.env.NODE_ENV !== 'production' || true) { // Forced for now as per user request
                console.log(`[EmailService] TEST MODE: Redirecting email for ${type} from [${recipients.join(', ')}] to ${TEST_RECIPIENT}`);
                recipients = [TEST_RECIPIENT];
            }
            // ---------------------------------------------------------------------------

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
     * Wrap body in a nice HTML email container
     */
    wrapTemplate(content: string) {
        return `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; color: #1f2937;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h1 style="color: #4f46e5; margin: 0;">AE&CF</h1>
                    <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0;">MoneyWise Cashflow Management</p>
                </div>
                ${content}
                <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #9ca3af; text-align: center;">
                    <p>This is an automated message from the MoneyWise system.</p>
                    <p>&copy; 2026 AE&CF. All rights reserved.</p>
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
     * Get email addresses for all users with specific roles
     */
    async getEmailsByRoles(roles: string[]): Promise<string[]> {
        // 1. Get user IDs from public.users
        const { data: publicUsers, error: pubError } = await supabase
            .from('users')
            .select('id')
            .in('role', roles);

        if (pubError || !publicUsers) {
            console.error('[EmailService] Error fetching public users:', pubError);
            return [];
        }

        console.log(`[EmailService] Found ${publicUsers.length} users with roles: ${roles.join(', ')}`);
        const userIds = publicUsers.map((u: any) => u.id);

        // 2. Get emails from auth.users (fetching all for now as listUsers is usually small)
        // In a large org, we'd want to join or filter more efficiently.
        const { data, error } = await (supabase.auth as any).admin.listUsers();
        if (error || !data.users) {
            console.error('[EmailService] Error fetching auth users:', error);
            return [];
        }

        const recipients = data.users
            .filter((u: any) => userIds.includes(u.id))
            .map((u: any) => u.email)
            .filter((e: any): e is string => !!e);

        console.log(`[EmailService] Matched ${recipients.length} email recipients`);
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
        });

        if (error) {
            console.error('[EmailService] Resend error:', error);
            throw error;
        }

        console.log('[EmailService] Email sent successfully:', data?.id);
    }
};
