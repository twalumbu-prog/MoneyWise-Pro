/**
 * notificationCounts.service.ts — the "needs your attention" numbers behind the in-app badges and the app-icon badge.
 */
import { supabase } from '../lib/supabase';

export interface NotificationCounts {
    requisitions: number; approvals: number; vouchers: number; disbursements: number; settings: number; wallets: number;
}

export async function getNotificationCounts(params: {
    organization_id: string; role: string; user_id: string; walletsSinceDate?: Date | null;
}): Promise<NotificationCounts> {
    const { organization_id, role: userRole, user_id, walletsSinceDate = null } = params;
    const counts = {
            requisitions: 0,
            approvals: 0,
            vouchers: 0,
            disbursements: 0,
            settings: 0,
            wallets: 0,
        };

        // REQUESTOR checks
        const { count: reqCount } = await supabase
            .from('requisitions')
            .select('*', { count: 'exact', head: true })
            .eq('requestor_id', user_id)
            .eq('has_unread_updates', true);
        counts.requisitions = reqCount || 0;

        // AUTHORISER, ACCOUNTANT, ADMIN checks for approvals
        if (['AUTHORISER', 'ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: appCount } = await supabase
                .from('requisitions')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .in('status', ['DRAFT', 'SUBMITTED']);
            counts.approvals = appCount || 0;
        }

        // ACCOUNTANT, ADMIN checks for vouchers (DRAFT)
        if (['ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: vouchCount } = await supabase
                .from('vouchers')
                .select('id, requisitions!inner(organization_id)', { count: 'exact', head: true })
                .eq('status', 'DRAFT')
                .eq('requisitions.organization_id', organization_id);
            counts.vouchers = vouchCount || 0;
        }

        // Cashier, Accountant, Admin checks
        if (['CASHIER', 'ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: disbCount } = await supabase
                .from('requisitions')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .in('status', ['AUTHORISED', 'CHANGE_SUBMITTED']);
            counts.disbursements = disbCount || 0;
        }

        // Admin checks
        if (userRole === 'ADMIN') {
            const { count: setCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .eq('status', 'PENDING_APPROVAL');
            counts.settings = setCount || 0;
        }

        // Wallets badge: INFLOW COMPLETED entries since last /cashbook visit.
        // Only meaningful when the caller supplies wallets_since; without it we
        // return 0 so the badge stays hidden until the user has visited once.
        if (walletsSinceDate && ['CASHIER', 'ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: walletsCount } = await supabase
                .from('cashbook_entries')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .eq('entry_type', 'INFLOW')
                .eq('status', 'COMPLETED')
                .gt('created_at', walletsSinceDate.toISOString());
            counts.wallets = walletsCount || 0;
        }

    return counts;
}

/** Everything that needs the person's attention, as one number (the red badge on the app icon). */
export async function getBadgeTotal(userId: string): Promise<number> {
    try {
        const { data: u } = await supabase.from('users').select('organization_id, role').eq('id', userId).maybeSingle();
        if (!u?.organization_id) return 0;
        const c = await getNotificationCounts({ organization_id: u.organization_id, role: (u as any).role || 'REQUESTOR', user_id: userId });
        return c.requisitions + c.approvals + c.vouchers + c.disbursements + c.settings;
    } catch {
        return 0;
    }
}
