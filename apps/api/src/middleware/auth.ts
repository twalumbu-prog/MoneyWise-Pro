import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';

export interface AuthRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any>
    extends Request<P, ResBody, ReqBody, ReqQuery> {
    user?: any;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
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
        req.user = { id: 'service-role-admin', role: 'ADMIN' };
        (next as any)();
        return;
    }

    try {
        console.log(`[Auth] Verifying token (prefix): ${token?.substring(0, 10)}...`);

        let user: any = null;
        let authError: any = null;
        let retries = 3;

        while (retries > 0) {
            try {
                const result = await (supabase.auth as any).getUser(token);
                user = result.data.user;
                authError = result.error;

                if (!authError && user) break;

                // If it's a transient error, retry
                if (authError && (authError.message.includes('fetch failed') || authError.status === 0)) {
                    console.warn(`[Auth] Transient error, retrying... (${retries} left)`);
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

export const requireRole = (allowedRoles: string[]) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
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

            // Fetch user role from database
            const { data, error } = await supabase
                .from('users')
                .select('role')
                .eq('id', req.user.id)
                .single();

            if (error || !data) {
                console.error(`[Auth] requireRole: Error fetching user role for ${req.user.id}:`, error?.message || 'Not found');
                return res.status(403).json({ error: 'User profile not found' });
            }

            const userRole = data.role;
            console.log(`[Auth] requireRole: User ${req.user.id} has role ${userRole}. Allowed: ${allowedRoles.join(', ')}`);

            if (!allowedRoles.includes(userRole)) {
                console.warn(`[Auth] Access denied for role: ${userRole}. Required: ${allowedRoles.join(', ')}`);
                return res.status(403).json({ error: 'Permission denied', details: `Required one of: ${allowedRoles.join(', ')}` });
            }

            // Attach role to user object for downstream use
            req.user.role = userRole;
            (next as any)();
        } catch (err: any) {
            console.error('[Auth] Role verification error:', err);
            return res.status(500).json({ error: 'Internal server error during role verification' });
        }
    };
};
