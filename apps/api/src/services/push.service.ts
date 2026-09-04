/**
 * pushService — mobile push notifications, mirroring emailService's shape on
 * purpose: every method here that has an email counterpart takes the same
 * params and is called from the same spot, so a notification always fires on
 * both channels together instead of drifting apart over time.
 *
 * One real difference from email: a push needs a *device* that has the app
 * installed and has registered a token, not just an email address. A few
 * email notifications (sendTeamInvite, sendScheduledProofOfPayment's
 * pop_email) go to people/addresses with no such device — those have no
 * push equivalent and are intentionally not mirrored here.
 */

import type { Expo as ExpoType, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { supabase } from '../lib/supabase';

// expo-server-sdk ships ESM-only; a static import gets compiled to require()
// on our CJS build target and crashes the whole function at cold start. Load
// it lazily via dynamic import() instead, which works from CommonJS too.
let expoModulePromise: Promise<typeof import('expo-server-sdk')> | undefined;
function loadExpoModule() {
    if (!expoModulePromise) expoModulePromise = import('expo-server-sdk');
    return expoModulePromise;
}

let expoClient: ExpoType | undefined;
async function getExpoClient(): Promise<ExpoType> {
    if (!expoClient) {
        const { Expo } = await loadExpoModule();
        expoClient = new Expo();
    }
    return expoClient;
}

interface PushPayload {
    title: string;
    body: string;
    /** Delivered to the app so a tap can deep-link straight to the relevant screen. */
    data?: Record<string, any>;
}

// ── Token registry ───────────────────────────────────────────────────────────

async function getTokensForUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await supabase
        .from('push_tokens')
        .select('token')
        .in('user_id', userIds);

    if (error || !data) {
        console.error('[PushService] Failed to fetch tokens:', error);
        return [];
    }
    return [...new Set(data.map((r: any) => r.token as string))];
}

/**
 * Fans a payload out to every token for a set of users, chunked the way
 * Expo's API requires. A token that comes back DeviceNotRegistered (app
 * uninstalled, or a stale token from a reinstall) is deleted so the next
 * send doesn't keep paying for it.
 */
async function sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    const { Expo } = await loadExpoModule();
    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
    if (validTokens.length === 0) return;

    const messages: ExpoPushMessage[] = validTokens.map((to) => ({
        to,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
    }));

    const expo = await getExpoClient();
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
        try {
            tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
        } catch (err) {
            console.error('[PushService] Chunk send failed:', err);
        }
    }

    const deadTokens = tickets
        .map((ticket, i) => (ticket.status === 'error' && (ticket as any).details?.error === 'DeviceNotRegistered' ? validTokens[i] : null))
        .filter((t): t is string => !!t);

    if (deadTokens.length > 0) {
        await supabase.from('push_tokens').delete().in('token', deadTokens);
        console.log(`[PushService] Removed ${deadTokens.length} dead token(s).`);
    }
}

export const pushService = {
    /** Register (or refresh) a device's push token. Idempotent on the token itself. */
    async registerToken(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
        const { Expo } = await loadExpoModule();
        if (!Expo.isExpoPushToken(token)) {
            console.warn('[PushService] Ignoring non-Expo push token on register.');
            return;
        }
        const { error } = await supabase
            .from('push_tokens')
            .upsert({ user_id: userId, token, platform, last_seen_at: new Date().toISOString() }, { onConflict: 'token' });
        if (error) console.error('[PushService] Failed to register token:', error);
    },

    /** Called on sign-out so a shared/reset device stops receiving another user's pushes. */
    async unregisterToken(token: string): Promise<void> {
        const { error } = await supabase.from('push_tokens').delete().eq('token', token);
        if (error) console.error('[PushService] Failed to unregister token:', error);
    },

    async sendToUser(userId: string, payload: PushPayload): Promise<void> {
        await sendToTokens(await getTokensForUserIds([userId]), payload);
    },

    async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
        await sendToTokens(await getTokensForUserIds(userIds), payload);
    },

    /**
     * Mirrors emailService.getEmailsByRoles: every ACTIVE member of an org
     * holding one of the given roles, scoped by organization_id so this can
     * never leak a push to another organization's staff.
     */
    async getUserIdsByRoles(organizationId: string, roles: string[]): Promise<string[]> {
        if (!organizationId) return [];
        const { data, error } = await supabase
            .from('user_organizations')
            .select('user_id')
            .eq('organization_id', organizationId)
            .in('role', roles)
            .eq('status', 'ACTIVE');

        if (error || !data) return [];
        return [...new Set(data.map((r: any) => r.user_id as string))];
    },

    async sendToRoles(organizationId: string, roles: string[], payload: PushPayload): Promise<void> {
        const userIds = await this.getUserIdsByRoles(organizationId, roles);
        await this.sendToUsers(userIds, payload);
    },

    /**
     * Mirrors emailService.notifyRequisitionEvent exactly: same event types,
     * same recipient (requestor vs. reviewer roles), called from the same
     * ~8 spots right alongside the email call.
     */
    async notifyRequisitionEvent(
        requisitionId: string,
        type: 'NEW_REQUISITION' | 'REQUISITION_APPROVED' | 'REQUISITION_REJECTED' | 'CASH_DISBURSED' | 'CHANGE_SUBMITTED' | 'REQUISITION_COMPLETED',
    ): Promise<void> {
        try {
            const { data: requisition, error } = await supabase
                .from('requisitions')
                .select('organization_id, requestor_id, description, estimated_total, reference_number, requestor:users!requestor_id(name)')
                .eq('id', requisitionId)
                .single();

            if (error || !requisition) return;

            const ref = requisition.reference_number || requisitionId.slice(0, 8);
            const requestorName = (requisition as any).requestor?.name || 'A team member';
            const data = { type: 'requisition', id: requisitionId };

            switch (type) {
                case 'NEW_REQUISITION': {
                    const userIds = await this.getUserIdsByRoles(requisition.organization_id, ['AUTHORISER', 'ACCOUNTANT', 'ADMIN']);
                    await this.sendToUsers(userIds, {
                        title: 'New requisition to review',
                        body: `${requestorName} — ${requisition.description} (K${Number(requisition.estimated_total).toLocaleString()})`,
                        data,
                    });
                    break;
                }
                case 'REQUISITION_APPROVED':
                    await this.sendToUser(requisition.requestor_id, {
                        title: 'Requisition approved',
                        body: `${ref}: ${requisition.description}`,
                        data,
                    });
                    break;
                case 'REQUISITION_REJECTED':
                    await this.sendToUser(requisition.requestor_id, {
                        title: 'Requisition rejected',
                        body: `${ref}: ${requisition.description}`,
                        data,
                    });
                    break;
                case 'CASH_DISBURSED':
                    await this.sendToUser(requisition.requestor_id, {
                        title: 'Funds ready for collection',
                        body: `${ref}: ${requisition.description}`,
                        data,
                    });
                    break;
                case 'CHANGE_SUBMITTED': {
                    const userIds = await this.getUserIdsByRoles(requisition.organization_id, ['CASHIER', 'ACCOUNTANT', 'ADMIN']);
                    await this.sendToUsers(userIds, {
                        title: 'Change submitted for verification',
                        body: `${requestorName} returned change for ${ref}`,
                        data,
                    });
                    break;
                }
                case 'REQUISITION_COMPLETED':
                    await this.sendToUser(requisition.requestor_id, {
                        title: 'Requisition completed',
                        body: `${ref}: ${requisition.description}`,
                        data,
                    });
                    break;
            }
        } catch (err) {
            console.error('[PushService] notifyRequisitionEvent failed:', err);
        }
    },

    /** Mirrors emailService.notifyWalletInflow — the general "cash came in" push. */
    async notifyWalletInflow(organizationId: string, entry: { description: string; debit: number; account_type?: string }): Promise<void> {
        try {
            const amount = Number(entry.debit) || 0;
            if (amount <= 0) return;
            const accountLabel = entry.account_type === 'MONEYWISE_WALLET'
                ? 'MoneyWise Wallet'
                : (entry.account_type || 'External Account').replace(/_/g, ' ');

            await this.sendToRoles(organizationId, ['ADMIN'], {
                title: `New inflow: K${amount.toLocaleString()}`,
                body: `${entry.description} — ${accountLabel}`,
                data: { type: 'cashbook' },
            });
        } catch (err) {
            console.error('[PushService] notifyWalletInflow failed:', err);
        }
    },

    async sendPaymentReceivedPush(organizationId: string, amount: number, label: string): Promise<void> {
        await this.sendToRoles(organizationId, ['ADMIN'], {
            title: `You just got paid — K${amount.toLocaleString()}`,
            body: label,
            data: { type: 'cashbook' },
        });
    },

    /**
     * Mirrors the admin leg of emailService.notifyPaymentLinkPaid — same
     * self-guarded lookup (no matching payment_links row → silently skip),
     * so this never fires a false "you got paid" push for an unrelated
     * transaction that merely happens to carry the same reference.
     */
    async notifyPaymentLinkPaid(organizationId: string, reference: string): Promise<void> {
        try {
            const { data: link } = await supabase
                .from('payment_links')
                .select('amount, products(name)')
                .eq('organization_id', organizationId)
                .eq('reference', reference)
                .maybeSingle();
            if (!link) return;

            await this.sendPaymentReceivedPush(organizationId, Number(link.amount) || 0, (link as any).products?.name || `ref ${reference}`);
        } catch (err) {
            console.error('[PushService] notifyPaymentLinkPaid failed:', err);
        }
    },

    /** Mirrors the admin leg of emailService.notifyPublicSalePaid — same self-guarded product_sales lookup. */
    async notifyPublicSalePaid(organizationId: string, reference: string): Promise<void> {
        try {
            const { data: link } = await supabase
                .from('payment_links')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('reference', reference)
                .maybeSingle();
            if (link) return; // owned by notifyPaymentLinkPaid

            const { data: sales } = await supabase
                .from('product_sales')
                .select('amount_paid, quantity, products(name)')
                .eq('organization_id', organizationId)
                .eq('reference', reference);
            if (!sales || sales.length === 0) return;

            const total = sales.reduce((sum: number, s: any) => sum + Number(s.amount_paid || 0), 0);
            const label = sales.map((s: any) => `${s.quantity || 1}x ${s.products?.name || 'Item'}`).join(', ');
            await this.sendPaymentReceivedPush(organizationId, total, label);
        } catch (err) {
            console.error('[PushService] notifyPublicSalePaid failed:', err);
        }
    },

    /** Mirrors emailService.notifyAddedToOrganization — only fires for an existing account (has a user_id already). */
    async notifyAddedToOrganization(userId: string, orgName: string, role: string): Promise<void> {
        try {
            await this.sendToUser(userId, {
                title: `Added to ${orgName}`,
                body: `You've been added as ${role.charAt(0) + role.slice(1).toLowerCase()}. Switch organizations to access it.`,
                data: { type: 'organization_switch' },
            });
        } catch (err) {
            console.error('[PushService] notifyAddedToOrganization failed:', err);
        }
    },

    /** Mirrors emailService.notifyAutoCategorizationReminder — takes the same requisition list, looks up requestor_id itself. */
    async notifyAutoCategorizationReminder(requisitions: Array<{ id: string }>): Promise<void> {
        try {
            if (requisitions.length === 0) return;
            const { data: lineups } = await supabase
                .from('requisitions')
                .select('requestor_id')
                .in('id', requisitions.map((r) => r.id));

            const byRequestor = new Map<string, number>();
            for (const r of lineups || []) {
                if (!r.requestor_id) continue;
                byRequestor.set(r.requestor_id, (byRequestor.get(r.requestor_id) || 0) + 1);
            }

            await Promise.all([...byRequestor.entries()].map(([requestorId, count]) =>
                this.sendToUser(requestorId, {
                    title: `${count} expense${count !== 1 ? 's' : ''} need accounting for`,
                    body: 'These will be auto-categorized in 12 hours if not actioned.',
                    data: { type: 'requisitions' },
                }),
            ));
        } catch (err) {
            console.error('[PushService] notifyAutoCategorizationReminder failed:', err);
        }
    },

    /** Mirrors emailService.notifyAutoCategorizationComplete. */
    async notifyAutoCategorizationComplete(categorized: Array<{ requestor_id: string }>): Promise<void> {
        try {
            if (categorized.length === 0) return;
            const byRequestor = new Map<string, number>();
            for (const r of categorized) byRequestor.set(r.requestor_id, (byRequestor.get(r.requestor_id) || 0) + 1);

            await Promise.all([...byRequestor.entries()].map(([requestorId, count]) =>
                this.sendToUser(requestorId, {
                    title: `${count} requisition${count !== 1 ? 's' : ''} auto-categorized`,
                    body: 'No action was taken in time, so MoneyWise categorized them for you. Tap to review.',
                    data: { type: 'requisitions' },
                }),
            ));
        } catch (err) {
            console.error('[PushService] notifyAutoCategorizationComplete failed:', err);
        }
    },
};
