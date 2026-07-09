/**
 * Server → client cache invalidation over Supabase Realtime Broadcast.
 *
 * After a write, the API publishes a tiny `{ entities }` event on the org's
 * private channel (`org:<uuid>`). The web app maps each entity to a React
 * Query key prefix and invalidates it, so any mounted screen refetches
 * immediately — live-updating UI with no database migration and no client
 * dependency on the socket staying up (refetch-on-focus/reconnect still
 * covers missed events on flaky carriers).
 *
 * Client-side authorization is enforced by RLS on realtime.messages
 * (migration 20260709150000): users can only receive their own org's topic.
 * Sends are stateless REST calls with the service-role key — no socket held.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Entity vocabulary shared with the web app's query keys. Keep in sync with
// apps/web (query keys start with one of these prefixes).
export type InvalidationEntity =
    | 'cashbook-overview'
    | 'cashbook-entries'
    | 'cashbook-balance'
    | 'external-balances'
    | 'cashbook-recent'
    | 'inflows'
    | 'wallets'
    | 'requisitions'
    | 'vouchers'
    | 'accounts'
    | 'departments';

/**
 * Fire-and-forget: broadcast failures must never break the write they follow.
 * Callers should NOT await this on the request path — invoke as
 * `void broadcastInvalidate(...)`.
 */
export async function broadcastInvalidate(
    organizationId: string | null | undefined,
    entities: InvalidationEntity[]
): Promise<void> {
    if (!organizationId || entities.length === 0) return;
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return; // not configured (e.g. tests)

    try {
        const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    {
                        topic: `org:${organizationId}`,
                        event: 'invalidate',
                        payload: { entities },
                        private: true,
                    },
                ],
            }),
        });
        if (!res.ok) {
            console.error(`[realtime] broadcast failed: ${res.status} ${await res.text().catch(() => '')}`);
        }
    } catch (err) {
        console.error('[realtime] broadcast error:', err);
    }
}

// Route-prefix → entities map for the after-write middleware. Coarse on
// purpose: an extra invalidation is a cheap background refetch, a missing one
// is a stale screen.
const ROUTE_ENTITIES: [RegExp, InvalidationEntity[]][] = [
    [/^\/cashbook/, ['cashbook-overview', 'cashbook-entries', 'cashbook-balance', 'external-balances', 'cashbook-recent', 'inflows', 'wallets']],
    [/^\/requisitions/, ['requisitions', 'vouchers']],
    [/^\/vouchers/, ['vouchers', 'requisitions']],
    [/^\/lenco/, ['cashbook-overview', 'cashbook-entries', 'cashbook-balance', 'external-balances', 'cashbook-recent', 'inflows', 'wallets']],
    [/^\/accounts/, ['accounts']],
    [/^\/departments/, ['departments']],
];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Express middleware: after any successful authenticated mutation, broadcast
 * the matching invalidation to the rest of the org. Runs on response finish so
 * it never delays the reply. Unauthenticated writes (public payment intents,
 * the background Lenco sync) are covered separately at the service layer.
 */
export function broadcastAfterWrite(req: any, res: any, next: any): void {
    if (MUTATING_METHODS.has(req.method)) {
        res.on('finish', () => {
            if (res.statusCode >= 400) return;
            const organizationId = req.user?.organization_id;
            if (!organizationId) return;
            const match = ROUTE_ENTITIES.find(([re]) => re.test(req.path));
            if (match) void broadcastInvalidate(organizationId, match[1]);
        });
    }
    next();
}
