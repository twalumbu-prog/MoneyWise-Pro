import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Scale, LogOut } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

export function Layout({ children }: { children: ReactNode }) {
    const { user, signOut } = useAdminAuth();

    return (
        <div className="min-h-screen bg-brand-gray">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
                    <Link to="/" className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy text-white">
                            <Scale className="h-4 w-4" />
                        </span>
                        <span className="flex flex-col leading-tight">
                            <span className="text-sm font-semibold text-brand-navy">MoneyWise Reconciliation</span>
                            <span className="text-[11px] text-slate-400">Financial health · Lenco vs ledger</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-4">
                        {user?.email && <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>}
                        <button
                            onClick={() => signOut()}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            Sign out
                        </button>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
        </div>
    );
}
