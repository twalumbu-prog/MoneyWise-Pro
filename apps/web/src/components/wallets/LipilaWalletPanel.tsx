import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CreditCard, RefreshCw } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';

export interface LipilaWalletSummary {
    connected: boolean; env: string | null; balance: number | null; booked: number | null; currency: string; recordedSales: number; fetchedAt: string; error: string | null;
}
interface CardPayment { reference: string; status: string; net: number; charged: number; fee: number; customer: string | null; phone: string | null; source: string | null; reason: string | null; problem: string | null; startedAt: string; finishedAt: string | null }

export const LIPILA_WALLET_KEY = (orgId: string | null | undefined) => ['lipila', 'wallet', orgId];

const SOURCE: Record<string, string> = { payment_link: 'Payment link', quick_link: 'Quick pay', store: 'Store' };
const chip = (p: CardPayment) => {
    if (p.status === 'SUCCESSFUL') return { label: 'Paid', cls: 'bg-[#E6F4EA] text-[#137333]' };
    if (p.status === 'FAILED') return { label: 'Declined', cls: 'bg-[#FCE8E6] text-[#B31412]' };
    if (p.problem) return { label: 'Paid, being recorded', cls: 'bg-[#FEF7E0] text-[#B06000]' };
    return { label: 'Waiting', cls: 'bg-[#F1F3F4] text-[#5F6368]' };
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Shown under the Lipila wallet card: Lipila's own balance, what MoneyWise has recorded, and every card payment started on the business's pages. */
export const LipilaWalletPanel: React.FC<{ organizationId: string | null | undefined }> = ({ organizationId }) => {
    const wallet = useQuery({ queryKey: LIPILA_WALLET_KEY(organizationId), queryFn: () => apiJson<LipilaWalletSummary>('/lipila/wallet'), enabled: !!organizationId, staleTime: 30_000, retry: false });
    const pays = useQuery({ queryKey: ['lipila', 'card-payments', organizationId], queryFn: () => apiJson<{ payments: CardPayment[] }>('/lipila/card-payments?limit=50'), enabled: !!organizationId, staleTime: 15_000, retry: false, refetchInterval: 30_000 });
    const w = wallet.data;
    const rows = pays.data?.payments ?? [];
    const refresh = () => { void wallet.refetch(); void pays.refetch(); };

    return (
        <section className="mb-4 rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><CreditCard size={20} /></div>
                    <div>
                        <p className="text-sm font-bold text-[#1F1F1F]">Lipila wallet</p>
                        <p className="text-xs text-[#5F6368]">Where your customers’ card payments go{w?.env ? ` · ${w.env === 'production' ? 'live' : 'testing'}` : ''}</p>
                    </div>
                </div>
                <button type="button" onClick={refresh} disabled={wallet.isFetching || pays.isFetching} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F8FAFD] disabled:opacity-60"><RefreshCw size={13} className={wallet.isFetching || pays.isFetching ? 'animate-spin' : ''} /> Refresh</button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-[#F8FAFD] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5F6368]">Balance in Lipila</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[#1F1F1F]">{wallet.isLoading ? '…' : w?.balance != null ? formatKwacha(w.balance) : '—'}</p>
                    <p className="text-[11px] text-[#80868B]">{w?.balance != null ? `Asked Lipila at ${new Date(w.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Not available right now'}</p>
                </div>
                <div className="rounded-xl bg-[#F8FAFD] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5F6368]">Booked in Lipila</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[#1F1F1F]">{w?.booked != null ? formatKwacha(w.booked) : '—'}</p>
                    <p className="text-[11px] text-[#80868B]">Includes money not yet available</p>
                </div>
                <div className="rounded-xl bg-[#F8FAFD] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5F6368]">Card sales recorded here</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[#1F1F1F]">{w ? formatKwacha(w.recordedSales) : '…'}</p>
                    <p className="text-[11px] text-[#80868B]">What you earned, before any withdrawals</p>
                </div>
            </div>
            {w?.error && <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#FEF7E0] px-3 py-2.5 text-xs text-[#7A4B00]"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {w.error}</p>}
            {wallet.isError && <p className="mt-3 rounded-xl bg-[#FCE8E6] px-3 py-2.5 text-xs text-[#B31412]">Couldn’t load the Lipila wallet. {(wallet.error as any)?.message ?? ''}</p>}

            <h4 className="mb-2 mt-5 text-sm font-bold text-[#1F1F1F]">Card payments</h4>
            {pays.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-[#F1F3F4]" /> : rows.length === 0 ? (
                <p className="rounded-xl bg-[#F8FAFD] px-4 py-5 text-center text-xs text-[#5F6368]">No card payments yet. They show here as soon as a customer starts one, whether or not it is completed.</p>
            ) : (
                <ul className="divide-y divide-[#F1F3F4] rounded-xl border border-[#F1F3F4]">
                    {rows.map((p) => {
                        const c = chip(p);
                        return (
                            <li key={p.reference} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-[#1F1F1F]">{p.customer || p.phone || 'Customer'} <span className="text-xs font-normal text-[#80868B]">· {SOURCE[p.source ?? ''] ?? 'Card payment'}</span></p>
                                    <p className="text-[11px] text-[#80868B]">{when(p.startedAt)}{p.reason && p.status === 'FAILED' ? ` · ${p.reason}` : ''}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${c.cls}`}>{c.label}</span>
                                    <div className="text-right"><p className="font-semibold tabular-nums">{formatKwacha(p.net)}</p><p className="text-[10px] text-[#80868B]">card paid {formatKwacha(p.charged)}, fee {formatKwacha(p.fee)}</p></div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-3 text-[11px] leading-4 text-[#80868B]">Lipila doesn’t give us a statement, so the card payments list is built from payments started on your pages. Withdrawals and settlements you make inside Lipila show only in the balance above.</p>
        </section>
    );
};
