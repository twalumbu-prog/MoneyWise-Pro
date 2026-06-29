/**
 * Platform super-admin gate for the Financial Reconciliation Engine.
 *
 * MUST run AFTER `requireAuth` (which validates the Supabase JWT and attaches
 * `req.user`, including `req.user.email`). This is a PLATFORM-level check — distinct
 * from the org-scoped `requireRole(['ADMIN'])`, which only makes someone an admin of
 * their own organization. Reconciliation exposes every org's financials, so access is
 * restricted to an explicit allowlist.
 *
 * Configure via the `SUPER_ADMIN_EMAILS` env var (comma-separated, case-insensitive):
 *   SUPER_ADMIN_EMAILS=masterfees101@gmail.com,ops@example.com
 */
export const requireSuperAdmin = (req: any, res: any, next: any) => {
    // The existing service-role-key bypass in requireAuth is already fully trusted.
    if (req.user?.id === 'service-role-admin') return next();

    const email = String(req.user?.email || '').trim().toLowerCase();
    const allow = String(process.env.SUPER_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    if (allow.length === 0) {
        console.error('[SuperAdmin] SUPER_ADMIN_EMAILS is not configured — denying all access.');
        return res.status(403).json({ error: 'Super-admin access is not configured' });
    }

    if (!email || !allow.includes(email)) {
        console.warn(`[SuperAdmin] ⛔ Denied for ${email || '(no email)'}`);
        return res.status(403).json({ error: 'Super-admin access required' });
    }

    next();
};
