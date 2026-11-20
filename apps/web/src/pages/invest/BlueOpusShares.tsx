import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { BlueOpusCharts } from './BlueOpusCharts';
import { VerifiedIcon } from './InvestHome';
import { AdminInvites, InviteGate, LegalApproval } from './BlueOpusAccess';
import { BENEFITS, GROWTH_2031 } from './blueOpusData';

interface Round { enabled: boolean; postMoney: number; currency: string; minAmount: number; maxAmount: number | null; maxTotal: number | null; agreementVersion: string }
interface Terms { access: boolean; isAdmin?: boolean; legalApproved?: boolean; logoUrl?: string | null; round?: Round; pricePerPercent?: number; remaining?: number | null; clauses?: { title: string; text: string }[] }
interface Offer { id: string; amount: number; post_money: number; ownership_pct: number; status: 'SUBMITTED' | 'COUNTERSIGNED' | 'PAID' | 'DECLINED' | 'WITHDRAWN'; note: string | null; created_at: string; full_name?: string; email?: string | null; phone?: string | null; user_id?: string }

const STATUS: Record<Offer['status'], { label: string; cls: string; help: string }> = {
    SUBMITTED: { label: 'Waiting for Blue Opus', cls: 'bg-[#FEF7E0] text-[#B06000]', help: 'Your signed offer is with Blue Opus. You can withdraw it until it is accepted.' },
    COUNTERSIGNED: { label: 'Accepted: payment due', cls: 'bg-[#E8F0FE] text-[#0B57D0]', help: 'Blue Opus has accepted your offer. Pay as the note says.' },
    PAID: { label: 'Paid', cls: 'bg-[#E6F4EA] text-[#137333]', help: 'Your payment is confirmed. You will be added to the share register.' },
    DECLINED: { label: 'Not accepted', cls: 'bg-[#FCE8E6] text-[#C5221F]', help: 'Blue Opus could not accept this offer.' },
    WITHDRAWN: { label: 'Withdrawn', cls: 'bg-[#F1F3F4] text-[#5F6368]', help: 'You withdrew this offer.' },
};
const pctText = (p: number) => `${p.toLocaleString(undefined, { maximumFractionDigits: p < 1 ? 4 : 2 })}%`;
const QUICK = [1000, 5000, 10000, 50000, 100000];
/** Whole kwacha with thousands separators (no .00), for big round figures. */
const K = (n: number) => `K${Math.round(n).toLocaleString('en-US')}`;

/** Blue Opus's side (super-admins only): every offer, with the steps countersign, mark paid, decline. */
const AdminPanel: React.FC = () => {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ['blue-opus', 'admin'], queryFn: () => apiJson<{ offers: Offer[]; totals: { submitted: number; countersigned: number; paid: number } }>('/investments/blue-opus/admin/offers'), retry: false });
    const [note, setNote] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    if (q.isError || !q.data) return null;
    const act = async (id: string, status: string) => {
        setBusy(id); setError(null);
        try { await apiJson(`/investments/blue-opus/admin/offers/${id}`, { method: 'POST', body: JSON.stringify({ status, note: note[id] }) }); await qc.invalidateQueries({ queryKey: ['blue-opus'] }); }
        catch (e: any) { setError(e?.message || 'Could not update the offer.'); } finally { setBusy(null); }
    };
    return (
        <section className="mt-8 rounded-2xl border border-[#C4C7C5] bg-[#F8FAFD] p-4 md:p-5">
            <h3 className="text-sm font-bold text-[#1F1F1F]">Blue Opus: offers received</h3>
            <p className="mt-1 text-xs text-[#5F6368]">Waiting {K(q.data.totals.submitted)} · accepted, to be paid {K(q.data.totals.countersigned)} · paid {K(q.data.totals.paid)}</p>
            <ErrorNote text={error} />
            <ul className="mt-3 space-y-3">
                {q.data.offers.length === 0 && <li className="text-sm text-[#5F6368]">No offers yet.</li>}
                {q.data.offers.map((o) => (
                    <li key={o.id} className="rounded-xl bg-white p-3 text-sm shadow-[inset_0_0_0_1px_#E3E5E8]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-[#1F1F1F]">{o.full_name} · {K(Number(o.amount))} · {pctText(Number(o.ownership_pct))}</span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#5F6368]">{o.email || 'no email'} · {o.phone || 'no phone'} · {new Date(o.created_at).toLocaleDateString()}</p>
                        {(o.status === 'SUBMITTED' || o.status === 'COUNTERSIGNED') && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input className="h-9 min-w-[12rem] flex-1 rounded-lg border border-[#C4C7C5] px-3 text-xs" placeholder="Note to the person (how to pay…)" value={note[o.id] ?? ''} onChange={(e) => setNote({ ...note, [o.id]: e.target.value })} />
                                {o.status === 'SUBMITTED' && <TonalButton disabled={busy === o.id} onClick={() => act(o.id, 'COUNTERSIGNED')}>Accept</TonalButton>}
                                {o.status === 'COUNTERSIGNED' && <TonalButton disabled={busy === o.id} onClick={() => act(o.id, 'PAID')}>Mark paid</TonalButton>}
                                <button disabled={busy === o.id} onClick={() => act(o.id, 'DECLINED')} className="h-9 rounded-full px-3 text-xs font-semibold text-[#C5221F] hover:bg-[#FCE8E6]">Decline</button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

/** Own a piece of Blue Opus: a private, personal agreement (the company is not listed). The person sees the valuation, what their money buys, the terms and the risks, then signs an offer. */
export const BlueOpusShares: React.FC = () => {
    const qc = useQueryClient();
    const { user } = useAuth();
    const terms = useQuery({ queryKey: ['blue-opus', 'terms'], queryFn: () => apiJson<Terms>('/investments/blue-opus'), retry: false });
    const mine = useQuery({ queryKey: ['blue-opus', 'mine'], queryFn: () => apiJson<{ offers: Offer[] }>('/investments/blue-opus/offers/mine'), retry: false });
    const [amount, setAmount] = useState('');
    const [fullName, setFullName] = useState(((user as any)?.name as string) || '');
    const [email, setEmail] = useState(((user as any)?.email as string) || '');
    const [phone, setPhone] = useState('');
    const [signName, setSignName] = useState('');
    const [agree, setAgree] = useState(false);
    // What the investor confirms about themselves before signing (kept with the offer).
    const [decl, setDecl] = useState({ invited: false, adult: false, canAffordLoss: false, ownDecision: false });
    const allDecl = decl.invited && decl.adult && decl.canAffordLoss && decl.ownDecision;
    const [params] = useSearchParams();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    const r = terms.data?.round;
    const n = Number(amount.replace(/,/g, '')) || 0;
    const pct = useMemo(() => (r && n > 0 ? (n / r.postMoney) * 100 : 0), [r, n]);
    const clauses = useMemo(() => (terms.data?.clauses ?? []).map((c) => (c.title === 'Price and your share' && n >= (r?.minAmount ?? 0) && n > 0 ? { ...c, text: c.text.replace(/\.? This percentage/, `: ${K(n)} buys ${pctText(pct)} of the Company. This percentage`).replace(/: K[\d,.]+ buys [^.]*\.\s*: /, ': ') } : c)), [terms.data, n, pct, r]);
    const tooSmall = !!r && n > 0 && n < r.minAmount;
    const nameOk = fullName.trim().includes(' ') && signName.trim().replace(/\s+/g, ' ').toLowerCase() === fullName.trim().replace(/\s+/g, ' ').toLowerCase();
    const approved = terms.data?.legalApproved === true;
    const canSend = !!r && r.enabled && approved && n >= r.minAmount && agree && allDecl && nameOk;

    const send = async () => {
        setBusy(true); setError(null);
        try {
            await apiJson('/investments/blue-opus/offers', { method: 'POST', body: JSON.stringify({ amount: n, fullName, acceptedName: signName, agree, declarations: decl, email, phone }) });
            setSent(true); setAmount(''); setSignName(''); setAgree(false); setDecl({ invited: false, adult: false, canAffordLoss: false, ownDecision: false });
            await qc.invalidateQueries({ queryKey: ['blue-opus'] });
        } catch (e: any) { setError(e?.message || 'Could not send your offer.'); } finally { setBusy(false); }
    };
    const withdraw = async (id: string) => {
        try { await apiJson(`/investments/blue-opus/offers/${id}/withdraw`, { method: 'POST' }); await qc.invalidateQueries({ queryKey: ['blue-opus'] }); } catch (e: any) { setError(e?.message || 'Could not withdraw.'); }
    };

    const locked = !!terms.data && !terms.data.access;

    return (
        <PagePanel title={locked ? 'Private offer' : 'Own a piece of Blue Opus'} subtitle={locked ? undefined : 'A private, personal agreement. Blue Opus is not publicly listed.'} back="/invest">
            {terms.isPending ? <div className="h-48 animate-pulse rounded-2xl bg-[#F1F3F4]" />
                : locked ? <InviteGate initialCode={params.get('code') ?? ''} onDone={() => { void qc.invalidateQueries({ queryKey: ['blue-opus'] }); }} />
                : terms.isError || !r ? <p className="py-12 text-center text-sm text-[#5F6368]">Share offers can’t be loaded right now. Please try again later.</p>
                : (
                    <div className="mx-auto w-full max-w-[1500px] space-y-5">
                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-100 bg-white p-1 shadow-sm">
                                    <img src="/invest-logos/blue-opus.png" alt="Blue Opus" className="h-full w-full object-contain" />
                                </div>
                                <div className="min-w-0"><p className="flex items-center gap-1.5 text-base font-bold leading-tight text-[#1F1F1F]">Blue Opus Software <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 text-blue-600 [&>svg]:h-full [&>svg]:w-full" title="Verified"><VerifiedIcon /></span></p><p className="text-xs text-[#80868B]">{r.enabled ? 'Private offer · not publicly listed' : 'This round is closed'}</p></div>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 divide-x divide-[#E3E5E8] rounded-xl border border-[#E3E5E8] text-center">
                                <div className="px-2 py-3"><dd className="text-base font-bold tabular-nums text-[#0B57D0] md:text-lg">From {K(r.minAmount)}</dd><dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#80868B]">Anyone can start</dt></div>
                                <div className="px-2 py-3"><dd className="text-base font-bold tabular-nums text-[#1F1F1F] md:text-lg">{terms.data?.remaining != null ? K(terms.data.remaining) : K(r.maxTotal ?? r.postMoney / 5)}</dd><dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#80868B]">{terms.data?.remaining != null ? 'Still open in this round' : 'Round size'}</dt></div>
                            </dl>
                            {(r.maxAmount || terms.data?.remaining != null) && <p className="mt-3 text-center text-xs text-[#5F6368]">{[r.maxAmount ? `Largest amount ${K(r.maxAmount)}` : null, terms.data?.remaining != null ? `${K(terms.data.remaining)} left in this round` : null].filter(Boolean).join(' · ')}</p>}
                        </section>

                        <section aria-labelledby="bo-benefits">
                            <h3 id="bo-benefits" className="mb-3 text-sm font-bold text-[#1F1F1F]">What you get</h3>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {BENEFITS.map((b) => (
                                    <div key={b.title} className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4">
                                        {b.stat && <p className="text-lg font-bold leading-tight text-[#0B57D0]">{b.stat}</p>}
                                        <p className="mt-1 text-sm font-semibold text-[#1F1F1F]">{b.title}</p>
                                        <p className="mt-1.5 text-xs leading-relaxed text-[#5F6368]">{b.text}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <BlueOpusCharts />

                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                            <h3 className="text-sm font-bold text-[#1F1F1F]">Customers the company expects by the end of 2031</h3>
                            <dl className="mt-3 grid grid-cols-3 divide-x divide-[#E3E5E8] rounded-xl border border-[#E3E5E8] text-center">
                                {GROWTH_2031.map((g) => <div key={g.label} className="px-2 py-3"><dd className="text-base font-bold tabular-nums text-[#1F1F1F] md:text-lg">{g.value.toLocaleString('en-US')}</dd><dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#80868B]">{g.label}</dt></div>)}
                            </dl>
                            <p className="mt-2 text-[11px] text-[#80868B]">A projection from the investor deck, not a result.</p>
                        </section>

                        <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
                            <div className="space-y-5">
                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                            <h3 className="text-sm font-bold text-[#1F1F1F]">About Blue Opus Software</h3>
                            <p className="mt-2 text-sm text-[#3C4043]">Software that connects the execution of finance to the records it produces, so businesses and schools stop reconciling by hand. Based in Lusaka, Zambia.</p>
                            <ul className="mt-3 space-y-1.5 text-sm text-[#3C4043]">
                                <li><span className="font-semibold text-[#1F1F1F]">MoneyWise</span>: AI financial management for businesses.</li>
                                <li><span className="font-semibold text-[#1F1F1F]">Master-Fees</span>: school payments with automatic reconciliation.</li>
                                <li><span className="font-semibold text-[#1F1F1F]">Project Genius</span>: AI marking for teachers and schools.</li>
                            </ul>
                            <dl className="mt-4 grid grid-cols-3 divide-x divide-[#E3E5E8] rounded-xl border border-[#E3E5E8] text-center">
                                <div className="px-2 py-2.5"><dd className="text-sm font-bold text-[#1F1F1F]">K2M+</dd><dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#80868B]">Processed in 6 months</dt></div>
                                <div className="px-2 py-2.5"><dd className="text-sm font-bold text-[#1F1F1F]">K70k+</dd><dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#80868B]">Net income</dt></div>
                                <div className="px-2 py-2.5"><dd className="text-sm font-bold text-[#1F1F1F]">K1.5M</dd><dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#80868B]">Round for 20%</dt></div>
                            </dl>
                            <p className="mt-3 text-[11px] text-[#80868B]">As stated by Blue Opus in its investor deck. Figures about the future are projections, not guarantees.</p>
                        </section>

                        {r.enabled && (
                            <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                                <h3 className="text-sm font-bold text-[#1F1F1F]">1. How much would you invest?</h3>
                                <div className="relative mt-3">
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#80868B]">K</span>
                                    <input className={`${fieldClass} pl-9 text-lg font-bold`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" aria-label="Amount to invest in kwacha" />
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">{QUICK.filter((q) => q >= r.minAmount).map((q) => <button key={q} type="button" onClick={() => setAmount(String(q))} className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]">{K(q)}</button>)}</div>
                                {tooSmall && <p className="mt-2 text-xs font-semibold text-[#C5221F]">The smallest amount is {K(r.minAmount)}.</p>}
                                <div className="mt-4 text-center">
                                    <div className="rounded-2xl bg-[#F8FAFD] p-3"><p className="text-xl font-bold tabular-nums text-[#0B57D0]">{n >= r.minAmount ? pctText(pct) : '–'}</p><p className="text-[11px] font-semibold text-[#5F6368]">of Blue Opus</p></div>
                                </div>
                                <p className="mt-2 text-[11px] text-[#5F6368]">Your percentage is fixed when you sign. Later share issues can reduce it.</p>
                            </section>
                        )}

                            </div>
                            <div>
                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
                            <h3 className="text-sm font-bold text-[#1F1F1F]">{r.enabled ? '2. ' : ''}The agreement</h3>
                            <p className="mt-0.5 text-[11px] text-[#80868B]">Version {r.agreementVersion}</p>
                            <ol className="mt-3 space-y-3">
                                {clauses.map((c, i) => <li key={c.title} className="text-sm"><span className="font-bold text-[#1F1F1F]">{i + 1}. {c.title}.</span> <span className="text-[#3C4043]">{c.text}</span></li>)}
                            </ol>
                        </section>

                            </div>
                            <div className="space-y-5 lg:col-span-2 xl:col-span-1">
                        {r.enabled && (
                            <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                                <h3 className="text-sm font-bold text-[#1F1F1F]">3. Sign your offer</h3>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <div className="md:col-span-2"><label className={labelClass}>Full legal name</label><input className={fieldClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First and last name" autoComplete="name" /></div>
                                    <div><label className={labelClass}>Email</label><input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
                                    <div><label className={labelClass}>Phone</label><input className={fieldClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0970000000" autoComplete="tel" /></div>
                                </div>
                                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-[#3C4043]"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" /> I have read the agreement and the risks above, and I accept them.</label>
                                <fieldset className="mt-3 space-y-2 rounded-xl bg-[#F8FAFD] p-3 text-sm text-[#3C4043]">
                                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">I confirm that</legend>
                                    {([['invited', 'Blue Opus invited me personally to make this offer.'], ['adult', 'I am 18 or older.'], ['canAffordLoss', 'I can afford to lose all of this money.'], ['ownDecision', 'I am deciding for myself and have had the chance to take my own advice.']] as const).map(([k, label]) => (
                                        <label key={k} className="flex cursor-pointer items-start gap-2.5"><input type="checkbox" checked={decl[k]} onChange={(e) => setDecl({ ...decl, [k]: e.target.checked })} className="mt-1" /> {label}</label>
                                    ))}
                                </fieldset>
                                <div className="mt-3"><label className={labelClass}>Type your full name to sign</label><input className={fieldClass} value={signName} onChange={(e) => setSignName(e.target.value)} placeholder={fullName || 'Your full name'} />{signName && !nameOk && <p className="mt-1 text-xs text-[#80868B]">It must match your full legal name above.</p>}</div>
                                <ErrorNote text={error} />
                                {!approved && <p className="mt-3 rounded-xl bg-[#F1F3F4] px-4 py-2.5 text-sm text-[#5F6368]">You can read everything here, but signing opens once Blue Opus’s lawyer has approved the agreement.</p>}
                                {sent && <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-[#E6F4EA] px-4 py-2.5 text-sm font-semibold text-[#137333]"><CheckCircle2 size={16} /> Your offer is with Blue Opus. You’ll be told when it’s accepted. No money has been taken.</p>}
                                <PrimaryButton onClick={send} busy={busy} disabled={!canSend} className="mt-4 h-12 w-full text-base">{n >= r.minAmount ? `Sign offer for ${K(n)}` : 'Enter an amount to continue'}</PrimaryButton>
                            </section>
                        )}

                        {(mine.data?.offers.length ?? 0) > 0 && (
                            <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                                <h3 className="text-sm font-bold text-[#1F1F1F]">Your offers</h3>
                                <ul className="mt-3 divide-y divide-[#E3E5E8]">
                                    {mine.data!.offers.map((o) => (
                                        <li key={o.id} className="py-3 text-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold tabular-nums text-[#1F1F1F]">{K(Number(o.amount))} · {pctText(Number(o.ownership_pct))}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span></div>
                                            <p className="mt-1 text-xs text-[#5F6368]">{STATUS[o.status].help} Signed {new Date(o.created_at).toLocaleDateString()} at a {K(Number(o.post_money))} valuation.</p>
                                            {o.note && <p className="mt-1 rounded-lg bg-[#F8FAFD] px-3 py-2 text-xs text-[#1F1F1F]">Note from Blue Opus: {o.note}</p>}
                                            {o.status === 'SUBMITTED' && <button type="button" onClick={() => withdraw(o.id)} className="mt-2 text-xs font-semibold text-[#C5221F] hover:underline">Withdraw this offer</button>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                            </div>
                        </div>
                        {terms.data?.isAdmin && <><LegalApproval approved={approved} version={r.agreementVersion} /><AdminInvites /></>}
                        <AdminPanel />
                        <footer className="mt-2 flex gap-2.5 border-t border-[#E3E5E8] pt-5 text-xs leading-relaxed text-[#80868B]">
                            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                            <p><span className="font-semibold text-[#5F6368]">Please read.</span> You can lose all the money you put in. These shares can’t be sold on any market and may be hard to sell at all. Signing above is an offer, not a purchase: it only counts once Blue Opus accepts it and you have paid as it directs. No money is taken on this page.</p>
                        </footer>
                    </div>
                )}
        </PagePanel>
    );
};
