import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
    FilePlus2, Receipt, SendHorizontal, Landmark, BookOpenCheck, ShoppingCart, BarChart3, CalendarDays, Inbox, ChevronRight,
    ArrowDownLeft, ArrowUpRight, Loader2, Scale,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { cashbookService } from '../services/cashbook.service';
import { scheduleService, ScheduledItem } from '../services/schedule.service';
import { invoiceService } from '../services/invoice.service';
import { investmentService, formatKwacha } from 'core';
import { JournalEntryModal } from '../components/accounting/JournalEntryModal';

const ACCOUNTING_ROLES = ['ACCOUNTANT', 'ADMIN', 'MANAGEMENT'];
const money = (n: number) => formatKwacha(n);
const dayLabel = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const daysUntil = (iso: string) => Math.round((new Date(iso.slice(0, 10) + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);

const Card: React.FC<{ title: string; action?: { label: string; to: string }; children: React.ReactNode; className?: string }> = ({ title, action, children, className = '' }) => (
    <section className={`bg-white rounded-[20px] border border-[#E8EEF8] p-5 ${className}`}>
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
            {action && <Link to={action.to} className="text-xs font-semibold text-[#006AFF] hover:text-[#0059D8] inline-flex items-center gap-0.5">{action.label}<ChevronRight size={14} /></Link>}
        </div>
        {children}
    </section>
);

const Stat: React.FC<{ label: string; value: string; sub?: string; loading?: boolean; to?: string }> = ({ label, value, sub, loading, to }) => {
    const body = (
        <div className="bg-white rounded-[20px] border border-[#E8EEF8] p-5 h-full hover:border-[#006AFF]/40 transition-colors">
            <span className="text-xs font-medium text-gray-500">{label}</span>
            <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{loading ? <span className="inline-block h-7 w-28 rounded bg-gray-100 animate-pulse" /> : value}</p>
            {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
        </div>
    );
    return to ? <Link to={to} className="block">{body}</Link> : body;
};

/** The MoneyWise mark on a soft tile — same as the Accounts card in the personal app (every wallet carries the MoneyWise logo). */
const WalletLogo: React.FC = () => (
    <span className="w-8 h-8 rounded-[10px] bg-[#F0F7FF] flex items-center justify-center flex-shrink-0"><img src="/logo-mark.svg" alt="" className="h-[13px] w-auto" /></span>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-gray-400 py-3">{children}</p>;

export const Dashboard: React.FC = () => {
    const { organizationId, organizationName, userName, userRole, notificationCounts } = useAuth();
    const navigate = useNavigate();
    const [journalOpen, setJournalOpen] = useState(false);
    const isAccounting = ACCOUNTING_ROLES.includes(userRole || '');
    const canPost = userRole === 'ACCOUNTANT' || userRole === 'ADMIN';
    const enabled = !!organizationId;

    const overview = useQuery({ queryKey: ['cashbook-overview', organizationId, 'home-dashboard'], queryFn: () => cashbookService.getOverview(), enabled, staleTime: 30_000 });
    const portfolio = useQuery({ queryKey: ['home-dashboard', 'portfolio', organizationId], queryFn: () => investmentService.getPortfolio(), enabled, retry: false, staleTime: 60_000 });
    const schedules = useQuery({ queryKey: ['home-dashboard', 'schedules', organizationId], queryFn: () => scheduleService.getAll(), enabled, retry: false, staleTime: 60_000 });
    const invoices = useQuery({ queryKey: ['home-dashboard', 'invoices', organizationId], queryFn: () => invoiceService.list('ACTIVE'), enabled, retry: false, staleTime: 60_000 });

    // Accounts: MoneyWise wallets (main first) followed by linked external bank / mobile-money accounts.
    const accounts = useMemo(() => {
        const o: any = overview.data;
        if (!o) return [] as { id: string; name: string; balance: number; kind: 'WALLET' | 'EXTERNAL' }[];
        const wallets = ((o.wallets ?? []) as any[]).map(w => ({ id: String(w.id), name: String(w.name ?? 'Wallet'), balance: Number(w.balance ?? 0), isMain: !!w.is_main, kind: 'WALLET' as const }))
            .sort((a, b) => Number(b.isMain) - Number(a.isMain));
        const ext = ((o.additionalExternalAccounts ?? []) as any[]).map(a => ({ id: String(a.id), name: String(a.name), balance: Number(o.externalBalances?.[a.id] ?? 0), kind: 'EXTERNAL' as const, isMain: false }));
        return [...wallets, ...ext];
    }, [overview.data]);
    const totalCash = accounts.reduce((s, a) => s + a.balance, 0);

    const recent = useMemo(() => {
        const o: any = overview.data;
        const rows = [...(o?.recent?.moneywise ?? []), ...(o?.recent?.external ?? [])] as any[];
        return rows
            .filter(r => r && (Number(r.debit) || Number(r.credit)) && r.status !== 'PENDING')
            .sort((a, b) => String(b.created_at ?? b.date).localeCompare(String(a.created_at ?? a.date)))
            .slice(0, 8);
    }, [overview.data]);

    const upcoming = useMemo(() => ((schedules.data ?? []) as ScheduledItem[]).filter(s => s.status === 'ACTIVE').sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)), [schedules.data]);
    const dueSoon = upcoming.filter(s => daysUntil(s.next_due_date) <= 30);
    const dueSoonTotal = dueSoon.reduce((s, i) => s + Number(i.amount || 0), 0);

    const owed = useMemo(() => (invoices.data ?? []).filter(i => i.status !== 'VOID' && i.status !== 'PAID'), [invoices.data]);
    const owedTotal = owed.reduce((s, i) => s + Number(i.balance || 0), 0);
    const overdue = owed.filter(i => i.is_overdue).length;

    const attention = (notificationCounts?.requisitions ?? 0) + (notificationCounts?.approvals ?? 0) + (notificationCounts?.disbursements ?? 0) + (notificationCounts?.vouchers ?? 0);

    const actions: { label: string; hint: string; icon: React.ElementType; onClick: () => void; show: boolean }[] = [
        { label: 'New invoice', hint: 'Bill a customer on credit', icon: FilePlus2, onClick: () => navigate('/sales/new?mode=credit'), show: true },
        { label: 'New sale', hint: 'Take a payment now', icon: ShoppingCart, onClick: () => navigate('/sales/new'), show: true },
        { label: 'New expense', hint: 'Record money spent', icon: Receipt, onClick: () => navigate('/requisitions/new?type=EXPENSE'), show: true },
        { label: 'New request', hint: 'Ask for funds (requisition)', icon: SendHorizontal, onClick: () => navigate('/requisitions/new'), show: true },
        { label: 'Journal entry', hint: 'Post debits & credits', icon: BookOpenCheck, onClick: () => setJournalOpen(true), show: canPost },
        { label: 'Bank reconciliation', hint: 'Match a bank statement', icon: Landmark, onClick: () => navigate('/cashbook?reconcile=1'), show: isAccounting || userRole === 'CASHIER' },
        { label: 'Financial statements', hint: 'Cash flow, equity, ledger', icon: BarChart3, onClick: () => navigate('/reporting?view=CASHFLOW'), show: isAccounting || userRole === 'AUTHORISER' },
        { label: 'Schedules', hint: 'Bills & recurring payments', icon: CalendarDays, onClick: () => navigate('/schedules'), show: true },
    ];

    const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })();
    const first = (userName || '').split(' ')[0];

    return (
        <Layout noPadding={true} backgroundColor="bg-gray-50" title="Home">
            <div className="px-4 pt-2 md:pt-0 pb-28 md:pb-4 md:h-[calc(100vh-64px)] md:flex md:flex-col font-['DM_Sans']">
            <div className="bg-white rounded-[20px] md:border md:border-gray-200 p-4 md:p-6 md:flex-1 md:min-h-0 md:overflow-y-auto">
                <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{greeting}{first ? `, ${first}` : ''}</h1>
                        <p className="text-sm text-gray-500">{organizationName ? `Here’s where ${organizationName} stands today.` : 'Here’s where your business stands today.'}</p>
                    </div>
                    <Link to="/requisitions" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#E8EEF8] text-sm font-semibold text-gray-700 hover:border-[#006AFF]/50">
                        <Inbox size={16} className="text-[#006AFF]" /> Inbox
                        {attention > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#006AFF] text-white text-[11px] flex items-center justify-center">{attention > 99 ? '99+' : attention}</span>}
                    </Link>
                </div>

                {/* Headline numbers */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <Stat label="Cash & wallets" value={money(totalCash)} sub={`${accounts.length} account${accounts.length === 1 ? '' : 's'}`} loading={overview.isLoading} to="/cashbook" />
                    <Stat label="Investments" value={money(portfolio.data?.totals.currentValue ?? 0)} sub={portfolio.data && portfolio.data.totals.invested > 0 ? `${portfolio.data.totals.gain >= 0 ? '+' : ''}${money(portfolio.data.totals.gain)} since invested` : 'Nothing invested yet'} loading={portfolio.isLoading} to="/invest" />
                    <Stat label="Owed to you" value={money(owedTotal)} sub={invoices.isError ? 'Not available for your role' : `${owed.length} open invoice${owed.length === 1 ? '' : 's'}${overdue ? ` · ${overdue} overdue` : ''}`} loading={invoices.isLoading} to="/requisitions" />
                    <Stat label="Due in 30 days" value={money(dueSoonTotal)} sub={schedules.isError ? 'Not available for your role' : `${dueSoon.length} scheduled item${dueSoon.length === 1 ? '' : 's'}`} loading={schedules.isLoading} to="/schedules" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                    <div className="lg:col-span-2">
                        <Card title="Quick actions" className="h-full">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {actions.filter(a => a.show).map(a => (
                                    <button key={a.label} onClick={a.onClick} className="group text-left p-3.5 rounded-2xl bg-[#F8FAFD] hover:bg-[#E6F0FF] border border-transparent hover:border-[#006AFF]/30 transition-colors">
                                        <span className="w-9 h-9 rounded-xl bg-white text-[#006AFF] flex items-center justify-center shadow-sm group-hover:bg-[#006AFF] group-hover:text-white transition-colors"><a.icon size={18} /></span>
                                        <p className="mt-3 text-sm font-semibold text-gray-900">{a.label}</p>
                                        <p className="text-[11px] text-gray-500 leading-snug">{a.hint}</p>
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>
                    {/* Accounts takes exactly the height of Quick actions (it scrolls inside if it has more rows). */}
                    <div className="lg:relative min-h-[200px]">
                        <Card className="lg:absolute lg:inset-0 flex flex-col" title="Accounts" action={{ label: 'See all', to: '/cashbook' }}>
                            {overview.isLoading ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#006AFF]" /></div>
                                : accounts.length === 0 ? <Empty>No wallets yet.</Empty>
                                    : (
                                        <ul className="space-y-1 lg:flex-1 lg:overflow-y-auto lg:min-h-0">
                                            {accounts.map(a => (
                                                <li key={a.id}>
                                                    <Link to="/cashbook" className="flex items-center gap-3 py-2 rounded-xl hover:bg-[#F8FAFD] px-1 -mx-1">
                                                        <WalletLogo />
                                                        <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{a.name}</span>
                                                        <span className="text-sm font-semibold tabular-nums text-gray-900">{money(a.balance)}</span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                        </Card>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                        <Card title="Recent transactions" action={{ label: 'See all', to: '/cashbook' }}>
                            {overview.isLoading ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#006AFF]" /></div>
                                : recent.length === 0 ? <Empty>No transactions yet.</Empty>
                                    : (
                                        <ul className="divide-y divide-[#E8EEF8]">
                                            {recent.map((r: any) => {
                                                const inflow = Number(r.debit) > 0;
                                                const amt = inflow ? Number(r.debit) : Number(r.credit);
                                                return (
                                                    <li key={r.id} className="flex items-center gap-3 py-3">
                                                        <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${inflow ? 'bg-[#E8FBF2] text-[#03A862]' : 'bg-[#FFF1F1] text-red-500'}`}>{inflow ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-gray-900 truncate">{r.description || (inflow ? 'Money in' : 'Money out')}</p>
                                                            <p className="text-xs text-gray-500">{dayLabel(r.date)}{r.reference_number ? ` · ${r.reference_number}` : ''}</p>
                                                        </div>
                                                        <p className={`text-sm font-semibold tabular-nums ${inflow ? 'text-[#03A862]' : 'text-gray-900'}`}>{inflow ? '+' : '−'}{money(amt)}</p>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                        </Card>
                    </div>
                    <div className="space-y-4">
                        <Card title="Scheduled" action={{ label: 'Manage', to: '/schedules' }}>
                            {schedules.isLoading ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#006AFF]" /></div>
                                : upcoming.length === 0 ? <Empty>Nothing scheduled. Add bills and subscriptions so they are never missed.</Empty>
                                    : (
                                        <ul className="space-y-3">
                                            {upcoming.slice(0, 5).map(s => {
                                                const d = daysUntil(s.next_due_date);
                                                return (
                                                    <li key={s.id} className="flex items-center gap-3">
                                                        <span className={`w-9 text-center rounded-lg py-1 text-[10px] font-bold leading-tight ${d < 0 ? 'bg-red-50 text-red-600' : d <= 3 ? 'bg-amber-50 text-amber-600' : 'bg-[#F0F6FF] text-[#0059D8]'}`}>{dayLabel(s.next_due_date)}</span>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                                                            <p className="text-xs text-gray-500">{d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Due today' : `In ${d} day${d === 1 ? '' : 's'}`}</p>
                                                        </div>
                                                        <span className="text-sm font-semibold tabular-nums">{money(Number(s.amount))}</span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                        </Card>
                        <Card title="Investments" action={{ label: 'Invest', to: '/invest' }}>
                            {portfolio.isLoading ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#006AFF]" /></div>
                                : !portfolio.data || portfolio.data.holdings.length === 0 ? <Empty>No investments yet.</Empty>
                                    : (
                                        <ul className="space-y-3">
                                            {portfolio.data.holdings.slice(0, 4).map(h => (
                                                <li key={h.targetId} className="flex items-center gap-3">
                                                    {h.logoUrl ? <img src={h.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-[#E8EEF8]" /> : <span className="w-8 h-8 rounded-lg bg-[#E8FBF2] text-[#03A862] flex items-center justify-center"><Scale size={15} /></span>}
                                                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{h.name}</span>
                                                    <span className="text-right"><span className="block text-sm font-semibold tabular-nums">{money(h.currentValue)}</span><span className={`block text-[11px] ${h.gain >= 0 ? 'text-[#03A862]' : 'text-red-500'}`}>{h.gain >= 0 ? '+' : ''}{h.gainPct.toFixed(1)}%</span></span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                        </Card>
                    </div>
                </div>
            </div>
            </div>
            <JournalEntryModal isOpen={journalOpen} onClose={() => setJournalOpen(false)} />
        </Layout>
    );
};
