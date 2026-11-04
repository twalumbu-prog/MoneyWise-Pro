import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate as useNav } from 'react-router-dom';
import { AlertCircle, Briefcase, Check, ChevronDown, Clock, FileText, Landmark, Phone, ShieldCheck, ShoppingCart, Sparkles, Users, Wrench } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';

interface Product {
    id: string; lender_id: string; name: string; kind: string; audience: 'BUSINESS' | 'STAFF' | 'INDIVIDUAL'; description: string | null; features?: string[]; tenors?: number[] | null;
    min_amount: number | null; max_amount: number | null; min_months: number | null; max_months: number | null; indicative_rate: number | null; requirements: string[]; terms_confirmed: boolean;
}
interface Brand { primary?: string; primaryDark?: string; primaryLight?: string; secondary?: string; website?: string; email?: string; phones?: Record<string, string> }
interface Lender { id: string; slug: string; name: string; description: string | null; logo_url: string | null; brand?: Brand; products: Product[] }
interface Readiness { items: { key: string; label: string; status: 'READY' | 'MONEYWISE' | 'MISSING' | 'LENDER'; note?: string }[]; hasId: boolean; covered: number; total: number; missing: number }
interface LendersResponse { needsMigration: boolean; lenders: Lender[]; consentScope: { key: string; label: string }[] }
interface Application {
    id: string; lender_name: string; product_name: string; amount: number; term_months: number | null; purpose: string | null; status: string; created_at: string; decision_note: string | null;
    events: { at: string; status: string; note?: string }[];
}

const KIND_ICON: Record<string, React.ComponentType<any>> = { WORKING_CAPITAL: Briefcase, BUSINESS: Briefcase, ASSET_FINANCE: Wrench, SALARY_ADVANCE: Users, PERSONAL: Users, INVOICE_DISCOUNTING: FileText, ORDER_FINANCING: ShoppingCart };
const STATUS: Record<string, { label: string; tone: string }> = {
    SUBMITTED: { label: 'Sent', tone: 'bg-[#E8F0FE] text-[#1967D2]' }, IN_REVIEW: { label: 'In review', tone: 'bg-[#FEF7E0] text-[#B06000]' }, APPROVED: { label: 'Approved', tone: 'bg-[#E6F4EA] text-[#137333]' },
    DECLINED: { label: 'Declined', tone: 'bg-[#FCE8E6] text-[#B31412]' }, DISBURSED: { label: 'Paid out', tone: 'bg-[#E6F4EA] text-[#137333]' }, REPAID: { label: 'Repaid', tone: 'bg-[#E6F4EA] text-[#137333]' }, WITHDRAWN: { label: 'Withdrawn', tone: 'bg-[#F1F3F4] text-[#5F6368]' },
};
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const PHONE_KEY = 'mw:bid-phone';
const readPhone = () => { try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; } };

/** The lender's logo, cropped to the mark (their file has wide white margins). */
const LenderLogo: React.FC<{ lender: Lender; size?: number }> = ({ lender, size = 56 }) => (
    lender.logo_url
        ? <span className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[inset_0_0_0_1px_#E3E5E8]" style={{ width: size, height: size }}><img src={lender.logo_url} alt={`${lender.name} logo`} className="max-w-none" style={{ width: size * 1.9, height: size * 1.9 }} /></span>
        : <span className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-base font-bold text-[#0B57D0]" style={{ width: size, height: size }}>{lender.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>
);

const range = (p: Product) => {
    const amount = p.min_amount != null || p.max_amount != null ? `${p.min_amount != null ? formatKwacha(p.min_amount) : ''}${p.min_amount != null && p.max_amount != null ? ' to ' : p.max_amount != null ? 'up to ' : 'from '}${p.max_amount != null ? formatKwacha(p.max_amount) : ''}` : null;
    const months = p.min_months != null || p.max_months != null ? `${p.min_months ?? 1} to ${p.max_months ?? '…'} months` : null;
    return [amount, months].filter(Boolean).join(' · ');
};

/** Apply for one loan: what, how much, for how long, and what you agree to share with the lender. */
const ApplyDialog: React.FC<{ lender: Lender; product: Product; scope: { key: string; label: string }[]; onClose: () => void; onSent: () => void }> = ({ lender, product, scope, onClose, onSent }) => {
    const key = useRef(newKey());
    const nav = useNav();
    const [amount, setAmount] = useState('');
    const [months, setMonths] = useState('');
    const ready = useQuery({ queryKey: ['loans', 'readiness', product.id], queryFn: () => apiJson<Readiness>(`/loans/readiness?productId=${product.id}`), staleTime: 30_000 });
    // The phone number comes from the saved MoneyWise ID, so it never has to be typed again.
    const idProfile = useQuery({ queryKey: ['kyc-profile'], queryFn: () => apiJson<{ applicant: Record<string, string> | null }>('/investments/kyc-profile'), staleTime: 60_000, retry: false });
    useEffect(() => { const ph = idProfile.data?.applicant?.phone; if (ph) setPhone((cur) => cur || ph); }, [idProfile.data]);
    const [purpose, setPurpose] = useState('');
    const [phone, setPhone] = useState(readPhone);
    const [agreed, setAgreed] = useState<string[]>(scope.map((s) => s.key));
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { key.current = newKey(); }, [product.id]);

    const send = async () => {
        if (!(Number(amount) > 0)) { setError('Enter how much you need.'); return; }
        if (!phone.trim()) { setError('Add a phone number so the lender can reach you.'); return; }
        if (!consent || agreed.length === 0) { setError('Choose what to share and tick the box to agree.'); return; }
        setBusy(true); setError(null);
        try {
            await apiJson('/loans/applications', { method: 'POST', body: JSON.stringify({ productId: product.id, amount: Number(amount), termMonths: months ? Number(months) : undefined, purpose, phone, consent: true, scope: agreed, idempotencyKey: key.current }) });
            try { localStorage.setItem(PHONE_KEY, phone); } catch { /* storage unavailable */ }
            onSent();
        } catch (e: any) { setError(e?.message || 'We couldn’t send the application.'); key.current = newKey(); }
        finally { setBusy(false); }
    };

    return (
        <Dialog open title={`Apply to ${lender.name}`} onClose={onClose} size="md">
            <div className="mb-3 flex items-center gap-3"><LenderLogo lender={lender} size={44} /><p className="text-sm text-[#5F6368]">{product.name}{range(product) ? ` · ${range(product)}` : ''}</p></div>
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass} htmlFor="ln-amount">Amount (K)</label><input id="ln-amount" className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); setError(null); }} placeholder="e.g. 20000" /></div>
                    <div><label className={labelClass} htmlFor="ln-months">Preferred months <span className="font-normal normal-case text-[#9AA0A6]">(optional)</span></label><input id="ln-months" className={fieldClass} inputMode="numeric" value={months} onChange={(e) => { setMonths(e.target.value.replace(/\D/g, '')); setError(null); }} placeholder={product.tenors?.length ? `e.g. ${product.tenors[1] ?? product.tenors[0]}` : 'e.g. 6'} /></div>
                </div>
                <div><label className={labelClass} htmlFor="ln-purpose">What is it for?</label><input id="ln-purpose" className={fieldClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Stock for the festive season, a new freezer…" maxLength={300} /></div>
                <div><label className={labelClass} htmlFor="ln-phone">Phone number</label><input id="ln-phone" className={fieldClass} inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} placeholder="0971234567" /></div>

                <p className="-mt-1 text-xs text-[#80868B]">{lender.name} decides the final amount and repayment period after they review your application.</p>

                {/* One MoneyWise ID, reused: what this loan asks for, and how much of it is already on file. */}
                <div className="rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_#DADCE0]">
                    <p className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><Sparkles size={16} className="text-[#0B57D0]" /> Your MoneyWise ID</p>
                    {ready.isPending ? <div className="mt-3 h-16 animate-pulse rounded-xl bg-[#F1F3F4]" /> : ready.data ? (
                        <>
                            <p className="mt-1 text-xs text-[#5F6368]">{ready.data.covered} of {ready.data.total} things {lender.name} asks for are already covered, so you don’t fill them in again.</p>
                            <ul className="mt-3 space-y-1.5">
                                {ready.data.items.map((it) => (
                                    <li key={it.key} className="flex items-center gap-2 text-sm">
                                        {it.status === 'READY' || it.status === 'MONEYWISE' ? <Check size={15} className="flex-shrink-0 text-[#137333]" /> : it.status === 'MISSING' ? <AlertCircle size={15} className="flex-shrink-0 text-[#B06000]" /> : <Clock size={15} className="flex-shrink-0 text-[#9AA0A6]" />}
                                        <span className="flex-1 text-[#3C4043]">{it.label}{it.note && <span className="block text-[11px] text-[#B06000]">{it.note}</span>}</span>
                                        <span className="text-[11px] text-[#80868B]">{it.status === 'READY' ? 'On your ID' : it.status === 'MONEYWISE' ? 'From MoneyWise' : it.status === 'MISSING' ? 'Add to your ID' : `Give to ${lender.name}`}</span>
                                    </li>
                                ))}
                            </ul>
                            {ready.data.missing > 0 && <button type="button" onClick={() => nav('/invest/kyc')} className="mt-3 text-xs font-semibold text-[#0B57D0] underline">{ready.data.hasId ? 'Finish your MoneyWise ID' : 'Set up your MoneyWise ID'} (once, then it works everywhere)</button>}
                        </>
                    ) : null}
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_#DADCE0]">
                    <p className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><ShieldCheck size={16} className="text-[#0B57D0]" /> What {lender.name} will see</p>
                    <p className="mt-1 text-xs text-[#5F6368]">Only what you tick. It helps them decide faster than paper. They don’t get access to your account, and you can withdraw the application before they decide.</p>
                    <ul className="mt-3 space-y-2">
                        {scope.map((s) => (
                            <li key={s.key}><label className="flex cursor-pointer items-start gap-2.5 text-sm text-[#3C4043]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0B57D0]" checked={agreed.includes(s.key)} onChange={(e) => setAgreed((a) => (e.target.checked ? [...a, s.key] : a.filter((k) => k !== s.key)))} /> {s.label}</label></li>
                        ))}
                    </ul>
                    <label className="mt-4 flex cursor-pointer items-start gap-2.5 border-t border-[#E3E5E8] pt-3 text-sm font-semibold text-[#1F1F1F]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0B57D0]" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(null); }} /> I agree to share the items ticked above with {lender.name} for this application.</label>
                </div>
                {!product.terms_confirmed && <p className="rounded-xl bg-[#FEF7E0] px-3 py-2 text-xs text-[#B06000]">Amounts, terms and rates for this loan are still being confirmed with {lender.name}. They’ll confirm the exact offer if they approve you.</p>}
            </div>
            <ErrorNote text={error} />
            <PrimaryButton onClick={send} busy={busy} className="mt-4 h-12 w-full text-base">Send application</PrimaryButton>
        </Dialog>
    );
};

/** Loans from microfinance lenders, inside MoneyWise: see what's offered, apply with your consent, follow the application. */
export const Loans: React.FC = () => {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const [tab, setTab] = useState<'offers' | 'mine'>('offers');
    const [applying, setApplying] = useState<{ lender: Lender; product: Product } | null>(null);
    const [sent, setSent] = useState(false);
    // Lenders are a list of dropdowns, so any number of them fit on one screen; one is open at a time.
    const [openLender, setOpenLender] = useState<string | null>(null);
    const lenders = useQuery({ queryKey: ['loans', 'lenders'], queryFn: () => apiJson<LendersResponse>('/loans'), staleTime: 60_000 });
    const mine = useQuery({ queryKey: ['loans', 'applications'], queryFn: () => apiJson<{ applications: Application[] }>('/loans/applications'), staleTime: 15_000 });
    const apps = mine.data?.applications ?? [];

    const withdraw = async (id: string) => { try { await apiJson(`/loans/applications/${id}/withdraw`, { method: 'POST' }); qc.invalidateQueries({ queryKey: ['loans', 'applications'] }); } catch { /* the list refreshes on next open */ } };

    return (
        <PagePanel title="Loans" subtitle="Finance from lenders on MoneyWise, applied for in minutes" actions={<TonalButton onClick={() => navigate('/loans/demo')}>See the demo</TonalButton>}>
            <div className="mb-5 inline-flex rounded-full bg-[#F1F3F4] p-1" role="tablist">
                {([['offers', 'Offers'], ['mine', `My applications${apps.length ? ` (${apps.length})` : ''}`]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setSent(false); }} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === id ? 'bg-white text-[#1F1F1F] shadow-sm' : 'text-[#5F6368]'}`}>{label}</button>
                ))}
            </div>

            {sent && <p className="mb-4 flex items-center gap-2 rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]"><Check size={16} /> Application sent. You can follow it under My applications.</p>}

            {tab === 'offers' ? (
                lenders.isPending ? <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-[#F1F3F4]" />)}</div>
                : lenders.isError ? <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">Couldn’t load the lenders.</p><TonalButton onClick={() => lenders.refetch()} className="mt-3">Try again</TonalButton></div>
                : lenders.data!.lenders.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-center"><Landmark size={30} className="text-[#9AA0A6]" /><p className="mt-3 text-base font-bold text-[#1F1F1F]">{lenders.data!.needsMigration ? 'Loans are opening soon' : 'No lenders yet'}</p><p className="mt-1 max-w-sm text-sm text-[#5F6368]">We’re adding microfinance lenders so you can apply for finance without leaving MoneyWise.</p></div>
                ) : (
                    <div className="space-y-3">
                        {lenders.data!.lenders.map((l) => {
                            const open = openLender === l.id;
                            return (
                                <section key={l.id} className="overflow-hidden rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white">
                                    <button type="button" onClick={() => setOpenLender(open ? null : l.id)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-[#F8FAFD] md:gap-4 md:p-4" style={open ? { background: l.brand?.primaryLight ?? undefined } : undefined}>
                                        <LenderLogo lender={l} size={48} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-base font-bold" style={{ color: l.brand?.primary ?? '#1F1F1F' }}>{l.name}</span>
                                            <span className="block truncate text-xs text-[#5F6368]">{l.products.length} {l.products.length === 1 ? 'loan' : 'loans'}: {[...new Set(l.products.map((p) => p.name))].slice(0, 3).join(', ')}{l.products.length > 3 ? '…' : ''}</span>
                                        </span>
                                        <span className="hidden rounded-full bg-[#F1F3F4] px-3 py-1 text-xs font-semibold text-[#3C4043] sm:inline">{open ? 'Hide' : 'View loans'}</span>
                                        <ChevronDown size={20} className={`flex-shrink-0 text-[#5F6368] transition ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    {open && (
                                        <div className="border-t border-[rgba(116,119,117,0.16)] p-4 md:p-5" style={{ borderTop: `3px solid ${l.brand?.primary ?? '#0B57D0'}` }}>
                                            {l.description && <p className="text-sm text-[#3C4043]">{l.description}</p>}
                                            {l.brand?.phones && <p className="mb-4 mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5F6368]"><Phone size={12} />{Object.entries(l.brand.phones).map(([place, no]) => <span key={place}>{place}: <b className="font-semibold text-[#3C4043]">{no}</b></span>)}</p>}
                                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {l.products.map((p) => {
                                        const Icon = KIND_ICON[p.kind] ?? Landmark;
                                        return (
                                            <li key={p.id} className="flex flex-col rounded-2xl bg-[#F8FAFD] p-4">
                                                <span className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0B57D0]"><Icon size={16} /></span>{p.name}</span>
                                                {p.description && <p className="mt-2 text-xs leading-5 text-[#5F6368]">{p.description}</p>}
                                                {(p.features ?? []).length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{p.features!.map((f) => <li key={f} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-[#3C4043] shadow-[inset_0_0_0_1px_#DADCE0]">{f}</li>)}</ul>}
                                                <p className="mt-2 text-xs font-semibold text-[#3C4043]">{range(p) || `Amount, rate and period are set by ${l.name}`}{p.indicative_rate != null ? ` · about ${p.indicative_rate}% a month` : ''}</p>
                                                {p.audience === 'STAFF' && <p className="mt-1 text-[11px] text-[#80868B]">For employees, offered through their employer</p>}
                                                {p.requirements.length > 0 && <div className="mt-2"><p className="text-[11px] font-semibold text-[#3C4043]">{l.name} asks for</p><ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-[#5F6368]">{p.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>}
                                                <div className="mt-auto pt-4">{p.audience === 'STAFF'
                                                    ? <TonalButton disabled className="w-full">Through your employer</TonalButton>
                                                    : <PrimaryButton onClick={() => { setApplying({ lender: l, product: p }); setSent(false); }} className="h-11 w-full">Apply</PrimaryButton>}</div>
                                            </li>
                                        );
                                    })}
                                </ul>
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                        <button type="button" onClick={() => navigate('/loans/demo')} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-[#C4C7C5] p-3 text-left transition hover:bg-[#F8FAFD] md:p-4">
                            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#E8F0FE] text-[#0B57D0]"><Landmark size={20} /></span>
                            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#1F1F1F]">Are you a microfinance institution or bank?</span><span className="block text-xs text-[#5F6368]">List your loans on MoneyWise and receive applications with the borrower’s consented ID and trading record.</span></span>
                            <span className="text-xs font-semibold text-[#0B57D0]">See how it works</span>
                        </button>
                    </div>
                )
            ) : mine.isPending ? <div className="h-32 animate-pulse rounded-2xl bg-[#F1F3F4]" />
            : apps.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center"><Clock size={30} className="text-[#9AA0A6]" /><p className="mt-3 text-base font-bold text-[#1F1F1F]">No applications yet</p><p className="mt-1 max-w-sm text-sm text-[#5F6368]">When you apply for a loan you’ll follow it here.</p><PrimaryButton onClick={() => setTab('offers')} className="mt-4 h-11 px-6">See offers</PrimaryButton></div>
            ) : (
                <ul className="grid gap-4 xl:grid-cols-2">
                    {apps.map((a) => {
                        const st = STATUS[a.status] ?? { label: a.status, tone: 'bg-[#F1F3F4] text-[#5F6368]' };
                        return (
                            <li key={a.id} className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0"><p className="text-sm font-bold text-[#1F1F1F]">{a.product_name}</p><p className="text-xs text-[#5F6368]">{a.lender_name} · {formatKwacha(a.amount)}{a.term_months ? ` over ${a.term_months} ${a.term_months === 1 ? 'month' : 'months'} (your preference)` : ''}</p>{a.purpose && <p className="mt-1 text-xs text-[#5F6368]">For: {a.purpose}</p>}</div>
                                    <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                                </div>
                                {a.decision_note && <p className="mt-2 rounded-xl bg-[#F8FAFD] px-3 py-2 text-xs text-[#3C4043]">{a.decision_note}</p>}
                                <ul className="mt-3 space-y-1 border-l-2 border-[#E3E5E8] pl-3">{[...a.events].reverse().map((e, i) => <li key={i} className="text-xs"><span className="text-[#80868B]">{new Date(e.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> <span className="text-[#1F1F1F]">{e.note || e.status}</span></li>)}</ul>
                                {['SUBMITTED', 'IN_REVIEW'].includes(a.status) && <button type="button" onClick={() => withdraw(a.id)} className="mt-3 text-xs font-semibold text-[#B31412] underline">Withdraw application</button>}
                            </li>
                        );
                    })}
                </ul>
            )}

            {applying && <ApplyDialog lender={applying.lender} product={applying.product} scope={lenders.data?.consentScope ?? []} onClose={() => setApplying(null)} onSent={() => { setApplying(null); setSent(true); setTab('mine'); qc.invalidateQueries({ queryKey: ['loans', 'applications'] }); }} />}
        </PagePanel>
    );
};
