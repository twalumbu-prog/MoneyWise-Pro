import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Scale, LogOut, Wallet, Smartphone } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

const NAV_ITEMS = [
    { to: '/', label: 'Reconciliation' },
    { to: '/wallet-pool', label: 'Wallet Pool' },
    { to: '/test-collections', label: 'Test Collections' },
];

export function Layout({ children }: { children: ReactNode }) {
    const { user, signOut } = useAdminAuth();
    const location = useLocation();

    return (
        <div className="min-h-screen bg-brand-gray">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
                    <Link to="/" className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy text-white">
                            <Scale className="h-4 w-4" />
                        </span>
                        <span className="flex flex-col leading-tight">
                            <span className="text-sm font-semibold text-brand-navy">MoneyWise Admin</span>
                            <span className="text-[11px] text-slate-400">Financial health · Lenco vs ledger</span>
                        </span>
                    </Link>
                    <nav className="hidden items-center gap-1 sm:flex">
                        {NAV_ITEMS.map(item => {
                            const active = location.pathname === item.to;
                            return (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                        active ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                >
                                    {item.to === '/wallet-pool' && <Wallet className="h-3.5 w-3.5" />}
                                    {item.to === '/test-collections' && <Smartphone className="h-3.5 w-3.5" />}
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
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
