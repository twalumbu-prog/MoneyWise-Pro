import { supabase } from '../../lib/supabase';
import { pushService, PUSH_CATEGORIES } from '../push.service';

/**
 * Daily "N transactions to confirm" push, one per person and workspace with captured mobile money transactions still
 * waiting for a category. "Review now" (or a tap) opens the quick-confirm queue: pick a category, Next, repeat.
 *
 * Complements the instant per-message prompt rather than replacing it: that one is easy to miss or put off, and these
 * pile up. Only captures from the last 30 days count, so something old and forgotten does not nag forever; people who
 * switched "Transactions to confirm" off, or chose email-only for their personal account, are skipped by pushService.
 */
const WINDOW_DAYS = 30;

export function confirmDigestMessage(count: number): { title: string; body: string } {
    return count === 1
        ? { title: '1 transaction to confirm', body: 'Tap its category and you’re done.' }
        : { title: `${count} transactions to confirm`, body: 'Tap a category for each and press Next. It takes under a minute.' };
}

/** Groups waiting captures by person and workspace. Pure, so it can be tested without a database. */
export function groupPending(rows: { user_id: string; organization_id: string }[]): { userId: string; orgId: string; count: number }[] {
    const m = new Map<string, { userId: string; orgId: string; count: number }>();
    for (const r of rows) {
        const k = `${r.user_id}|${r.organization_id}`;
        const g = m.get(k) ?? { userId: r.user_id, orgId: r.organization_id, count: 0 };
        g.count++;
        m.set(k, g);
    }
    return [...m.values()];
}

export async function sendMomoConfirmDigests(budgetMs: number) {
    const deadline = Date.now() + budgetMs;
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
    const result = { people: 0, sent: 0, errors: [] as string[] };

    const rows: { user_id: string; organization_id: string }[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('momo_captures').select('user_id, organization_id')
            .eq('status', 'PENDING').gte('occurred_at', since).order('id').range(from, from + 999);
        if (error) throw new Error(`Could not load waiting captures: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
    }

    for (const g of groupPending(rows)) {
        if (Date.now() > deadline) break;
        result.people++;
        try {
            await pushService.sendToUser(g.userId, {
                ...confirmDigestMessage(g.count),
                topic: 'to_confirm',
                category: PUSH_CATEGORIES.TO_CONFIRM,
                orgId: g.orgId,
                data: { type: 'momo_confirm', count: g.count },
            });
            result.sent++;
        } catch (e: any) {
            result.errors.push(`user ${g.userId}: ${e?.message}`);
        }
    }
    return result;
}
