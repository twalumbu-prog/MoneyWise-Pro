import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';

// Simplified for direct ANY access to bypass Vercel TS environment issues
export type AuthRequest = any;

// Supabase signs access tokens with this project secret (HS256). Verifying
// the signature locally skips the network round-trip to GoTrue's /user
// endpoint, which was previously hit on every single API request. Falls
// back to the remote getUser() check below when this isn't configured, so
// deployments that haven't set it yet don't hard-break.
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// Decoded shape of a Supabase access token payload (subset we use).
interface SupabaseAccessTokenPayload {
    sub: string;
    email?: string;
    phone?: string;
    role?: string; // Postgres role claim (e.g. "authenticated"), not our app role
    app_metadata?: Record<string, any>;
    user_metadata?: Record<string, any>;
    exp: number;
}

function verifyTokenLocally(token: string): { id: string; email?: string; phone?: string; app_metadata?: Record<string, any>; user_metadata?: Record<string, any> } {
    const decoded = jwt.verify(token, SUPABASE_JWT_SECRET as string, {
        algorithms: ['HS256'],
    }) as SupabaseAccessTokenPayload;

    if (!decoded.sub) {
        throw new Error('Token missing sub claim');
    }

    return {
        id: decoded.sub,
        email: decoded.email,
        phone: decoded.phone,
        app_metadata: decoded.app_metadata,
        user_metadata: decoded.user_metadata,
    };
}

export const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    console.log(`[Auth] Incoming request: ${req.method} ${req.path}`);

    if (!authHeader) {
        console.log('[Auth] Missing authorization header');
        return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // Testing/Admin bypass: Allow service role key directly
    if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.log('[Auth] Authenticated via Service Role Key (Bypass)');
        req.user = {
            id: 'service-role-admin',
            role: 'ADMIN',
            organization_id: '00000000-0000-0000-0000-000000000000' // Provide a dummy UUID for bypass
        };
        (next as any)();
        return;
    }

    try {
        console.log(`[Auth] Verifying token (prefix): ${token?.substring(0, 10)}...`);

        let user: any = null;
        let authError: any = null;

        // Fast path: verify the JWT signature locally instead of round-tripping
        // to Supabase's Auth server. This is the same signature Supabase's own
        // getUser() validates, so it's equally secure but removes the network
        // dependency for the common case (every authenticated request).
        if (SUPABASE_JWT_SECRET) {
            try {
                user = verifyTokenLocally(token);
            } catch (verifyErr: any) {
                console.error('[Auth] Local JWT verification failed:', verifyErr.message);
                const isExpired = verifyErr.name === 'TokenExpiredError';
                return res.status(401).json({
                    error: isExpired ? 'Token expired' : 'Invalid token',
                    details: verifyErr.message,
                });
            }

            console.log(`[Auth] User authenticated locally: ${user.id}`);
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('role, organization_id')
                .eq('id', user.id)
                .single();

            if (profileError || !profile) {
                console.warn(`[Auth] User profile not found for ${user.id}. Tables might be out of sync.`);
            } else {
                user.role = profile.role;
                user.organization_id = profile.organization_id;
            }

            req.user = user;
            (next as any)();
            return;
        }

        // Fallback: no local secret configured, use Supabase's remote getUser().
        let retries = 3;

        while (retries > 0) {
            try {
                const result = await (supabase.auth as any).getUser(token);
                user = result.data.user;
                authError = result.error;

                if (!authError && user) break;

                // Supabase's auth-js throws a distinct AuthRetryableFetchError (name)
                // for anything transient: real network failures (status 0) AND any
                // 502/503/504 from Supabase's own Auth servers. The old check here
                // only matched status 0 / a Node fetch-failure message, so a brief
                // 5xx blip from Supabase Auth was treated as "invalid token" and
                // surfaced as an immediate 401 - which the frontend reacts to by
                // force-signing the user out, even though their session was fine.
                if (authError && authError.name === 'AuthRetryableFetchError') {
                    console.warn(`[Auth] Transient error (status=${authError.status}), retrying... (${retries} left)`);
                    retries--;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                break;
            } catch (fetchErr: any) {
                console.warn(`[Auth] Fetch error, retrying... (${retries} left):`, fetchErr.message);
                retries--;
                if (retries === 0) throw fetchErr;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (authError || !user) {
            console.error('[Auth] Token verification failed:', authError);
            return res.status(401).json({
                error: 'Invalid token',
                details: authError?.message || 'User not found'
            });
        }

        console.log(`[Auth] User authenticated: ${user.id}`);

        // Fetch user profile (role, organization_id)
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role, organization_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.warn(`[Auth] User profile not found for ${user.id}. Tables might be out of sync.`);
            // We don't block auth here, but organization_id will be missing.
            // Downstream controllers should handle missing organization_id if strictly required.
        } else {
            user.role = profile.role;
            user.organization_id = profile.organization_id;
            // console.log(`[Auth] Attached context: Role=${user.role}, Org=${user.organization_id}`);
        }

        req.user = user;
        (next as any)();
    } catch (err: any) {
        console.error('[Auth] Internal error:', err);
        return res.status(500).json({
            error: 'Internal server error during authentication',
            details: err.message
        });
    }
};

/**
 * Attach req.user when the caller presents a valid Supabase session, but never
 * reject the request.
 *
 * For endpoints that accept EITHER a signed-in user OR a machine caller holding
 * a shared secret (the weekly-highlights cron, for example). The handler itself
 * decides what's acceptable — this middleware only makes the user context
 * available when there is one. A bearer token that isn't a valid session (such
 * as the cron secret) simply passes through unauthenticated.
 */
export const optionalAuth = async (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return (next as any)();

    const token = authHeader.split(' ')[1];
    if (!token) return (next as any)();

    if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
        req.user = {
            id: 'service-role-admin',
            role: 'ADMIN',
            organization_id: '00000000-0000-0000-0000-000000000000',
        };
        return (next as any)();
    }

    try {
        let user: any = null;

        if (SUPABASE_JWT_SECRET) {
            user = verifyTokenLocally(token);
        } else {
            const result = await (supabase.auth as any).getUser(token);
            user = result.data?.user;
        }

        if (user?.id) {
            const { data: profile } = await supabase
                .from('users')
                .select('role, organization_id')
                .eq('id', user.id)
                .single();

            if (profile) {
                user.role = profile.role;
                user.organization_id = profile.organization_id;
            }
            req.user = user;
        }
    } catch {
        // Not a user session (or an expired one) — carry on unauthenticated.
    }

    (next as any)();
};

export const requireRole = (allowedRoles: string[]) => {
    return async (req: any, res: any, next: any) => {
        if (!req.user) {
            console.log('[Auth] requireRole: No user on request');
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            // Service role bypass
            if (req.user.id === 'service-role-admin') {
                console.log('[Auth] requireRole: Service role bypass');
                (next as any)();
                return;
            }

            // Use already attached role if available
            let userRole = req.user.role;

            if (!userRole) {
                console.log(`[Auth] requireRole: Checking role for User ${req.user.id} from DB fallback...`);
                // Fetch user role from database
                const { data, error } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', req.user.id)
                    .single();

                if (error || !data) {
                    console.error(`[Auth] requireRole: ❌ Error fetching user role for ${req.user.id}:`, error?.message || 'Not found');
                    return res.status(403).json({ error: 'User profile not found' });
                }
                userRole = data.role;
            }

            console.log(`[Auth] requireRole: ✅ User ${req.user.id} has role ${userRole}. Allowed: ${allowedRoles.join(', ')}`);

            if (!userRole || !allowedRoles.includes(userRole)) {
                console.warn(`[Auth] requireRole: ⛔ Access denied for role: ${userRole}. Required: ${allowedRoles.join(', ')}`);
                return res.status(403).json({ error: 'Permission denied', details: `Required one of: ${allowedRoles.join(', ')}` });
            }

            // Attach role to user object for downstream use
            req.user.role = userRole;
            (next as any)();
        } catch (err: any) {
            console.error('[Auth] requireRole: ❌ Internal error:', err);
            return res.status(500).json({ error: 'Internal server error during role verification' });
        }
    };
};

