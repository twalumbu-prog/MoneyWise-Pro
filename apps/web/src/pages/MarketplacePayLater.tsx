import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, ShieldCheck } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { ErrorNote, PrimaryButton } from '../components/ui/Dialog';
import { ProgressBar } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import type { PayLaterInstalment, PayLaterOffer, PayLaterPlan } from '../components/marketplace/orderTypes';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="rounded-2xl bg-[#F8FAFD] p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#5F6368]">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-[#1F1F1F]">{value}</p></div>
);

/** The buyer's Pay in 4: whether they qualify and why, their limit, and every plan with its instalments. */
export const MarketplacePayLater: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { data, isPending } = useQuery({ queryKey: ['marketplace', 'pay-later'], queryFn: () => apiJson<{ offer: PayLaterOffer; plans: PayLaterPlan[] }>('/marketplace/pay-later'), staleTime: 15_000 });

    const pay = async (i: PayLaterInstalment) => {
        setBusy(i.id); setError(null);
        try {
            await apiJson(`/marketplace/pay-later/instalments/${i.id}/pay`, { method: 'POST', body: JSON.stringify({}) });
            await Promise.all([qc.invalidateQueries({ queryKey: ['marketplace', 'pay-later'] }), qc.invalidateQueries({ queryKey: ['wallets'] })]);
        } catch (e: any) { setError(e?.message || 'The payment didn’t go through.'); }
        finally { setBusy(null); }
    };

    const offer = data?.offer;
    const plans = data?.plans ?? [];
    const owed = plans.flatMap((p) => p.instalments).filter((i) => i.status !== 'PAID').reduce((s, i) => s + Number(i.amount) + Number(i.late_fee), 0);

    return (
        <PagePanel title="Marketplace" subtitle="Pay in 4: split orders into four interest-free payments" tabs={<MarketplaceTabs active="pay-later" />}>
            {isPending || !offer ? (
                <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-[#F1F3F4]" /><div className="h-48 animate-pulse rounded-2xl bg-[#F1F3F4]" /></div>
            ) : (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start">
                    <div>
                    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                        <div className="flex items-start gap-3">
                            <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${offer.eligible && offer.enabled ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#F1F3F4] text-[#5F6368]'}`}>{offer.eligible && offer.enabled ? <Check size={22} /> : <CalendarClock size={22} />}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-base font-bold text-[#1F1F1F]">{!offer.enabled ? 'Opening soon' : offer.eligible ? 'You qualify for Pay in 4' : 'Not available yet'}</p>
                                <p className="mt-0.5 text-sm text-[#5F6368]">
                                    {!offer.enabled ? 'We’re getting Pay in 4 ready. Your eligibility below is already worked out from your MoneyWise activity.'
                                        : offer.eligible ? 'Based on your MoneyWise activity: how long you’ve been active, how steadily money comes in, and how you repay.'
                                        : 'We look at how long you’ve been active, how steadily money comes into your wallet, and how you repay.'}
                                </p>
                            </div>
                        </div>
                        {offer.eligible && (
                            <div className="mt-5 grid grid-cols-3 gap-3">
                                <Stat label="Your limit" value={formatKwacha(offer.limit)} />
                                <Stat label="Available" value={formatKwacha(offer.available)} />
                                <Stat label="You owe" value={formatKwacha(owed)} />
                            </div>
                        )}
                        {!offer.eligible && offer.reasons.length > 0 && (
                            <ul className="mt-4 space-y-1.5 text-sm text-[#3C4043]">{offer.reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#B06000]" />{r}</li>)}</ul>
                        )}
                        <div className="mt-5">
                            <div className="mb-1 flex justify-between text-xs text-[#5F6368]"><span>Activity score</span><span className="font-semibold text-[#1F1F1F]">{offer.score} / 100</span></div>
                            <ProgressBar value={offer.score} tone={offer.score >= 40 ? 'green' : 'amber'} />
                        </div>
                        <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F8FAFD] p-3 text-xs text-[#5F6368]"><ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" /> No interest. First payment at checkout, then every two weeks. A one-off late fee applies if a payment is more than a day late ({offer.lateFee}). We take each payment from your wallet on the day when the money is there. Pay on time and your limit grows; miss payments and Pay in 4 closes.</div>
                    </section>
                    </div>
                    <div>
                    <ErrorNote text={error} />
                    <h2 className="mb-3 text-lg font-bold text-[#1F1F1F]">Your plans</h2>
                    {plans.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[#C4C7C5] p-8 text-center">
                            <p className="text-sm text-[#5F6368]">No plans yet. Choose “Pay in 4” at checkout on a Marketplace item.</p>
                            <PrimaryButton onClick={() => navigate('/marketplace')} className="mt-4 h-11 px-6">Browse the Marketplace</PrimaryButton>
                        </div>
                    ) : (
                        <ul className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                            {plans.map((p) => {
                                const paid = p.instalments.filter((i) => i.status === 'PAID').length;
                                return (
                                    <li key={p.id} className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0"><p className="truncate text-base font-bold text-[#1F1F1F]">{p.description}</p><p className="text-xs text-[#5F6368]">{day(p.created_at)} · {formatKwacha(p.principal)}</p></div>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.status === 'COMPLETED' ? 'bg-[#E6F4EA] text-[#137333]' : p.status === 'DEFAULTED' ? 'bg-[#FCE8E6] text-[#B31412]' : 'bg-[#E8F0FE] text-[#1967D2]'}`}>{p.status === 'ACTIVE' ? `${paid} of ${p.instalments.length} paid` : p.status === 'COMPLETED' ? 'Paid off' : 'Overdue, closed'}</span>
                                        </div>
                                        <ul className="mt-4 divide-y divide-[rgba(116,119,117,0.12)]">
                                            {p.instalments.map((i) => (
                                                <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                                                    <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i.status === 'PAID' ? 'bg-[#34A853] text-white' : i.status === 'LATE' ? 'bg-[#EA4335] text-white' : 'bg-[#E9EEF6] text-[#5F6368]'}`}>{i.status === 'PAID' ? <Check size={13} /> : i.seq}</span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="font-semibold tabular-nums text-[#1F1F1F]">{formatKwacha(Number(i.amount) + Number(i.late_fee))}</span>
                                                        <span className="ml-2 text-xs text-[#5F6368]">{i.status === 'PAID' ? `Paid ${i.paid_at ? day(i.paid_at) : ''}` : i.status === 'LATE' ? `Overdue since ${day(i.due_date)}${Number(i.late_fee) ? ` · includes ${formatKwacha(Number(i.late_fee))} late fee` : ''}` : `Due ${day(i.due_date)}`}</span>
                                                    </span>
                                                    {i.status !== 'PAID' && <PrimaryButton busy={busy === i.id} onClick={() => pay(i)} className="h-9 px-4 text-xs">Pay now</PrimaryButton>}
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    </div>
                </div>
            )}
        </PagePanel>
    );
};
