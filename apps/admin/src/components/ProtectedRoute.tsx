import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldX, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { session, isSuperAdmin, loading, signOut, user } = useAdminAuth();

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
            </div>
        );
    }

    if (!session) return <Navigate to="/login" replace />;

    // Signed in but still confirming allowlist membership.
    if (isSuperAdmin === null) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
            </div>
        );
    }

    if (isSuperAdmin === false) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
                <ShieldX className="h-12 w-12 text-rose-500" />
                <div>
                    <h1 className="text-lg font-semibold text-brand-navy">Access denied</h1>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                        {user?.email ? <span className="font-medium">{user.email}</span> : 'This account'} is not
                        authorised for the Reconciliation Engine. Contact a platform administrator to be added to the
                        super-admin allowlist.
                    </p>
                </div>
                <button
                    onClick={() => signOut()}
                    className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                    Sign out
                </button>
            </div>
        );
    }

    return <>{children}</>;
}
