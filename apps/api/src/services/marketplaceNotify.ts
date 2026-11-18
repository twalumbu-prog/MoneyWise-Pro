import { supabase } from '../lib/supabase';
import { emailService } from './email.service';
import { pushService } from './push.service';
import { getFrontendUrl } from '../utils/frontendUrl';

/**
 * Tells people what is happening to their auctions and orders: an email, and a push notification to their phone when the app is
 * installed. Never throws: a notification that fails must not undo a bid, a sale or a payment.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function contactOf(userId: string): Promise<{ email: string | null; name: string }> {
    const { data } = await supabase.from('users').select('email, name').eq('id', userId).maybeSingle();
    return { email: data?.email ?? null, name: data?.name ?? 'there' };
}

/** All active admins of an organisation (a business's sales notices go to whoever runs it). */
async function adminUserIds(orgId: string): Promise<string[]> {
    const { data } = await supabase.from('user_organizations').select('user_id').eq('organization_id', orgId).eq('status', 'ACTIVE').in('role', ['ADMIN']);
    return [...new Set((data ?? []).map((r: any) => r.user_id as string))];
}

export interface Notice {
    title: string;
    body: string;
    /** Where the notice should take them, as an app path: /marketplace/orders */
    path?: string;
    orgId?: string;
}

export async function notifyUser(userId: string, n: Notice): Promise<void> {
    try {
        const { email, name } = await contactOf(userId);
        const link = n.path ? `${getFrontendUrl()}${n.path}` : getFrontendUrl();
        await Promise.allSettled([
            pushService.sendToUser(userId, { title: n.title, body: n.body, data: { path: n.path ?? '/marketplace' }, orgId: n.orgId }),
            email
                ? emailService.sendEmail({
                    to: email,
                    subject: n.title,
                    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F1F1F">
                        <h2 style="margin:0 0 12px;font-size:20px">${esc(n.title)}</h2>
                        <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#3C4043">Hi ${esc(name.split(' ')[0] || 'there')}, ${esc(n.body)}</p>
                        <a href="${link}" style="display:inline-block;background:#0B57D0;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;font-size:14px">Open MoneyWise</a>
                        <p style="margin:24px 0 0;font-size:12px;color:#80868B">MoneyWise Marketplace</p>
                    </div>`,
                })
                : Promise.resolve(false),
        ]);
    } catch (e: any) {
        console.warn('[MarketplaceNotify] failed:', e?.message);
    }
}

export async function notifySeller(orgId: string, n: Notice): Promise<void> {
    try {
        const ids = await adminUserIds(orgId);
        await Promise.all(ids.map((id) => notifyUser(id, { ...n, orgId })));
    } catch (e: any) {
        console.warn('[MarketplaceNotify] seller notice failed:', e?.message);
    }
}
