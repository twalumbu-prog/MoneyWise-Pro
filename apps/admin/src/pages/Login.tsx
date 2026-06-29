import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, AlertCircle, Scale } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function Login() {
    const { signIn, session, isSuperAdmin } = useAdminAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (session && isSuperAdmin) navigate('/', { replace: true });
    }, [session, isSuperAdmin, navigate]);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await signIn(email.trim(), password);
            // ProtectedRoute / the effect above handles the redirect once the
            // session + allowlist check resolve.
        } catch (err: any) {
            setError(err?.message || 'Sign in failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-brand-gray px-4">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex flex-col items-center gap-3 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy text-white">
                        <Scale className="h-6 w-6" />
                    </span>
                    <div>
                        <h1 className="text-xl font-bold text-brand-navy">Reconciliation Engine</h1>
                        <p className="text-sm text-slate-500">MoneyWise financial health · admin access</p>
                    </div>
                </div>

                <form
                    onSubmit={onSubmit}
                    className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                    {error && (
                        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
                        <input
                            type="email"
                            required
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        Sign in
                    </button>
                </form>

                <p className="mt-4 text-center text-xs text-slate-400">
                    Access is limited to platform super-admins.
                </p>
            </div>
        </div>
    );
}
