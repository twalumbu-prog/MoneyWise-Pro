import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, Check, CircleDollarSign, Clock, FileText, Fingerprint, Landmark, ShieldCheck, Users } from 'lucide-react';
import { formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton, TonalButton } from '../components/ui/Dialog';

/**
 * A walk through the Loans experience with sample data, for presenting to lenders. Nothing here is saved or sent: every figure,
 * name and status is made up, and the whole page says so.
 */

type Step = 'SENT' | 'REVIEW' | 'APPROVED' | 'ACCEPTED' | 'PAID_OUT';
const STEPS: { id: Step; label: string }[] = [{ id: 'SENT', label: 'Sent' }, { id: 'REVIEW', label: 'In review' }, { id: 'APPROVED', label: 'Approved' }, { id: 'ACCEPTED', label: 'Accepted' }, { id: 'PAID_OUT', label: 'Paid out' }];

const MONTHLY = [38200, 41500, 47800, 52100, 49600, 58300, 61200, 66400, 59800, 71500, 68900, 74300];
const MONTH_NAMES = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

interface Applicant { id: string; business: string; owner: string; sector: string; amount: number; months: number; purpose: string; score: number; moneyIn90: number; avgMonthly: number; monthsActive: number; ageMonths: number; plans: string; status: 'NEW' | 'APPROVED' | 'DECLINED' | 'INFO' }
const APPLICANTS: Applicant[] = [
    { id: 'a1', business: 'Mwila Fresh Foods', owner: 'Mwila Banda', sector: 'Food retail', amount: 45000, months: 6, purpose: 'Stock for the festive season', score: 82, moneyIn90: 214700, avgMonthly: 71500, monthsActive: 12, ageMonths: 14, plans: '3 completed, 0 late', status: 'NEW' },
    { id: 'a2', business: 'Copperbelt Print Works', owner: 'Chanda Mulenga', sector: 'Printing', amount: 120000, months: 12, purpose: 'A second printing press', score: 74, moneyIn90: 301200, avgMonthly: 100400, monthsActive: 10, ageMonths: 11, plans: '1 completed, 0 late', status: 'NEW' },
    { id: 'a3', business: 'Kabwe Hardware & Tools', owner: 'Peter Zulu', sector: 'Hardware', amount: 30000, months: 4, purpose: 'Restock cement and roofing sheets', score: 68, moneyIn90: 128300, avgMonthly: 42800, monthsActive: 8, ageMonths: 9, plans: 'None yet', status: 'NEW' },
    { id: 'a4', business: 'Sunrise Salon', owner: 'Natasha Phiri', sector: 'Beauty', amount: 15000, months: 3, purpose: 'New chairs and dryers', score: 59, moneyIn90: 54600, avgMonthly: 18200, monthsActive: 5, ageMonths: 6, plans: 'None yet', status: 'NEW' },
    { id: 'a5', business: 'Lusaka Cartage', owner: 'Joseph Tembo', sector: 'Transport', amount: 80000, months: 9, purpose: 'Tyres and servicing for two trucks', score: 71, moneyIn90: 246000, avgMonthly: 82000, monthsActive: 11, ageMonths: 13, plans: '2 completed, 1 late', status: 'NEW' },
];
const FMC = { green: '#0D4A1A', light: '#F0F7F1', indigo: '#2D2D8E' };
const FmcLogo: React.FC<{ size?: number }> = ({ size = 56 }) => (
    <span className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[inset_0_0_0_1px_#E3E5E8]" style={{ width: size, height: size }}>
        <img src="/lenders/fmc-finance.png" alt="FMC Finance logo" className="max-w-none" style={{ width: size * 1.9, height: size * 1.9 }} />
    </span>
);
const tone = (s: number) => (s >= 75 ? 'bg-[#E6F4EA] text-[#137333]' : s >= 65 ? 'bg-[#FEF7E0] text-[#B06000]' : 'bg-[#FCE8E6] text-[#B31412]');

const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <section className={`rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5 ${className}`}>{title && <h3 className="mb-3 text-sm font-bold text-[#1F1F1F]">{title}</h3>}{children}</section>
);
const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <div className="rounded-2xl bg-[#F8FAFD] p-4"><p className="text-xs text-[#5F6368]">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-[#1F1F1F]">{value}</p>{hint && <p className="mt-0.5 text-[11px] text-[#80868B]">{hint}</p>}</div>
);

const InflowChart: React.FC = () => {
    const max = Math.max(...MONTHLY);
    return (
        <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Money in each month for the last 12 months">
            {MONTHLY.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t-md bg-[#0B57D0]/80" style={{ height: `${Math.max(6, Math.round((v / max) * 84))}px` }} title={`${MONTH_NAMES[i]}: ${formatKwacha(v)}`} />
                    <span className="text-[9px] text-[#80868B]">{MONTH_NAMES[i]}</span>
                </div>
            ))}
        </div>
    );
};

/** What the borrower sees: apply, follow it, accept the offer, get paid, repay. */
const BorrowerView: React.FC = () => {
    const [step, setStep] = useState<Step>('SENT');
    const [paid, setPaid] = useState(0);
    const principal = 45000, months = 6, flatRate = 0.04; // a made-up rate, only for the demo
    const total = Math.round(principal * (1 + flatRate * months) * 100) / 100;
    const each = Math.round((total / months) * 100) / 100;
    const at = STEPS.findIndex((s) => s.id === step);
    const next: Record<Step, { label: string; to: Step } | null> = { SENT: { label: 'Show FMC picking it up', to: 'REVIEW' }, REVIEW: { label: 'Show FMC approving', to: 'APPROVED' }, APPROVED: { label: 'Accept the offer', to: 'ACCEPTED' }, ACCEPTED: { label: 'Pay out to the wallet', to: 'PAID_OUT' }, PAID_OUT: null };
    const time = ['Just now', '12 minutes later', '2 hours later', 'Moments later', 'Moments later'][at];

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
                <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3"><FmcLogo size={52} /><div><p className="text-xs font-semibold uppercase tracking-wide text-[#80868B]">Mwila Fresh Foods applies to FMC Finance</p><h2 className="mt-0.5 text-lg font-bold" style={{ color: FMC.green }}>Business loan</h2><p className="text-sm text-[#5F6368]">{formatKwacha(principal)} · prefers {months} months, FMC confirms · For stock for the festive season</p></div></div>
                        <span className="rounded-full bg-[#E8F0FE] px-3 py-1 text-xs font-bold text-[#1967D2]">{time}</span>
                    </div>
                    <ol className="mt-5 flex items-start">
                        {STEPS.map((s, i) => (
                            <li key={s.id} className="flex min-w-0 flex-1 flex-col items-center text-center">
                                <div className="flex w-full items-center"><span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : at >= i ? 'bg-[#34A853]' : 'bg-[#DADCE0]'}`} /><span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${at >= i ? 'bg-[#34A853] text-white' : 'bg-[#DADCE0]'}`}>{at >= i && <Check size={13} strokeWidth={3} />}</span><span className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'opacity-0' : at > i ? 'bg-[#34A853]' : 'bg-[#DADCE0]'}`} /></div>
                                <span className={`mt-1 text-[11px] ${at === i ? 'font-bold text-[#1F1F1F]' : 'text-[#80868B]'}`}>{s.label}</span>
                            </li>
                        ))}
                    </ol>
                    {step === 'APPROVED' && <p className="mt-4 rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]"><b>Approved.</b> Offer: {formatKwacha(principal)} repaid as {months} monthly payments of {formatKwacha(each)} (total {formatKwacha(total)}). Sample figures.</p>}
                    {(step === 'ACCEPTED' || step === 'PAID_OUT') && <p className="mt-4 rounded-xl bg-[#E8F0FE] px-4 py-3 text-sm text-[#1967D2]">{step === 'PAID_OUT' ? `${formatKwacha(principal)} is in the Main wallet. The first payment is due in 30 days.` : 'Offer accepted. FMC is sending the money.'}</p>}
                    {next[step] && <PrimaryButton onClick={() => setStep(next[step]!.to)} className="mt-4 h-11 px-6">{next[step]!.label}</PrimaryButton>}
                </Card>

                {step === 'PAID_OUT' && (
                    <Card title="Repayments, from the wallet and tracked automatically">
                        <ul className="divide-y divide-[#E3E5E8]">
                            {Array.from({ length: months }).map((_, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                    <span className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${i < paid ? 'bg-[#34A853] text-white' : 'bg-[#E3E5E8]'}`}>{i < paid && <Check size={11} strokeWidth={3} />}</span>Payment {i + 1} of {months}</span>
                                    <span className="tabular-nums text-[#5F6368]">{formatKwacha(each)}</span>
                                    <span className="w-20 text-right text-xs text-[#80868B]">{i < paid ? 'Paid' : i === paid ? 'Next' : ''}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-[#5F6368]">Owed: <b className="tabular-nums text-[#1F1F1F]">{formatKwacha(Math.max(0, total - each * paid))}</b></p>{paid < months ? <TonalButton onClick={() => setPaid((p) => p + 1)}>Pay next instalment</TonalButton> : <span className="text-sm font-bold text-[#137333]">Fully repaid</span>}</div>
                    </Card>
                )}

                <Card title="Linked to a requisition, so the money's use is on record">
                    <div className="flex items-start gap-3"><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><FileText size={16} /></span>
                        <div className="min-w-0 text-sm"><p className="font-semibold text-[#1F1F1F]">Requisition: Stock purchase, festive season</p><p className="text-xs text-[#5F6368]">Approved by the owner · {formatKwacha(45000)} · supplier: Zambeef wholesale</p>
                            <p className="mt-2 text-xs text-[#5F6368]">{step === 'PAID_OUT' ? 'Loan money was spent on this requisition. The supplier payment, receipt and ledger entries are attached for both the borrower and FMC.' : 'Once the loan is paid out, the stock purchase is paid from it and the receipt is attached here.'}</p></div></div>
                </Card>
            </div>

            <div className="space-y-4">
                <Card title="What FMC sees, with the owner's consent">
                    <div className="grid grid-cols-2 gap-2"><Stat label="Money in, 90 days" value={formatKwacha(214700)} /><Stat label="Average a month" value={formatKwacha(71500)} /><Stat label="Months with money in" value="12 of 12" /><Stat label="Account age" value="14 months" /></div>
                    <p className="mb-2 mt-4 text-xs font-semibold text-[#5F6368]">Money in, month by month</p>
                    <InflowChart />
                    <p className="mt-3 flex items-start gap-2 text-xs text-[#5F6368]"><ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" /> Shared only after the owner ticks each item. The exact figures shared are saved with the application.</p>
                </Card>
            </div>
        </div>
    );
};

/** What the lender sees: a queue of applications with the data behind each, and a decision. */
const LenderDesk: React.FC = () => {
    const [list, setList] = useState(APPLICANTS);
    const [openId, setOpenId] = useState('a1');
    const open = list.find((a) => a.id === openId)!;
    const decide = (status: Applicant['status']) => setList((l) => l.map((a) => (a.id === openId ? { ...a, status } : a)));
    const stats = useMemo(() => ({ waiting: list.filter((a) => a.status === 'NEW').length, approved: list.filter((a) => a.status === 'APPROVED').reduce((n, a) => n + a.amount, 0) }), [list]);
    const label: Record<Applicant['status'], string> = { NEW: 'New', APPROVED: 'Approved', DECLINED: 'Declined', INFO: 'More info asked' };

    return (
        <div>
            <div className="mb-4 flex items-center gap-3 rounded-2xl p-4" style={{ background: FMC.light, borderTop: `4px solid ${FMC.green}` }}><FmcLogo size={52} /><div><p className="text-base font-bold" style={{ color: FMC.green }}>FMC Finance · loan desk</p><p className="text-xs text-[#5F6368]">Applications arrive with the borrower’s consented MoneyWise ID and trading record. You set the amount, rate and period.</p></div></div>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Waiting for a decision" value={String(stats.waiting)} /><Stat label="Approved this session" value={formatKwacha(stats.approved)} /><Stat label="Time to decide" value="About 2 hours" hint="Illustrative, vs days on paper" /><Stat label="On-time repayment" value="96%" hint="Sample portfolio" />
            </div>
            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                <Card title="Applications"><ul className="space-y-2">{list.map((a) => (
                    <li key={a.id}><button type="button" onClick={() => setOpenId(a.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${openId === a.id ? 'bg-[#E8F0FE]' : 'bg-[#F8FAFD] hover:bg-[#F1F3F4]'}`}>
                        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone(a.score)}`}>{a.score}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#1F1F1F]">{a.business}</span><span className="block text-xs text-[#5F6368]">{formatKwacha(a.amount)} · {a.months} months</span></span>
                        <span className="text-[11px] font-semibold text-[#5F6368]">{label[a.status]}</span>
                    </button></li>))}</ul></Card>
                <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-[#1F1F1F]">{open.business}</h3><p className="text-sm text-[#5F6368]">{open.owner} · {open.sector}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${tone(open.score)}`}>Score {open.score} of 100</span></div>
                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3"><Stat label="Asking for" value={formatKwacha(open.amount)} hint={`${open.months} months`} /><Stat label="Money in, 90 days" value={formatKwacha(open.moneyIn90)} /><Stat label="Average a month" value={formatKwacha(open.avgMonthly)} /><Stat label="Months with money in" value={`${open.monthsActive}`} /><Stat label="Account age" value={`${open.ageMonths} months`} /><Stat label="Pay in 4 record" value={open.plans} /></div>
                    <p className="mt-4 text-sm text-[#3C4043]"><b>Purpose:</b> {open.purpose}</p>
                    <p className="mt-1 flex items-start gap-2 text-xs text-[#5F6368]"><ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" /> Shared with the owner’s consent on the day they applied. The score is a demo calculation from these figures, not a credit bureau result.</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <PrimaryButton onClick={() => decide('APPROVED')} className="h-11 px-6"><Check size={16} /> Approve</PrimaryButton>
                        <TonalButton onClick={() => decide('INFO')} className="h-11">Ask for more</TonalButton>
                        <button type="button" onClick={() => decide('DECLINED')} className="h-11 rounded-full px-5 text-sm font-semibold text-[#B31412] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#FCE8E6]">Decline</button>
                    </div>
                    {open.status !== 'NEW' && <p className="mt-3 text-sm font-semibold text-[#1F1F1F]">Decision recorded: {label[open.status]}. The borrower is told straight away.</p>}
                </Card>
            </div>
        </div>
    );
};

/** Salary advances for an employer's staff, repaid through payroll. */
const StaffView: React.FC = () => {
    const [state, setState] = useState<Record<string, 'REQUESTED' | 'APPROVED'>>({ s1: 'REQUESTED', s2: 'REQUESTED' });
    const staff = [{ id: 's1', name: 'Grace Mumba', role: 'Cashier', pay: 4800, ask: 1500 }, { id: 's2', name: 'Bwalya Kasonde', role: 'Driver', pay: 6200, ask: 2000 }, { id: 's3', name: 'Mercy Lungu', role: 'Shop assistant', pay: 3900, ask: 0 }];
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Mwila Fresh Foods offers salary advances as a staff benefit">
                <ul className="space-y-2">{staff.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl bg-[#F8FAFD] p-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#0B57D0]">{s.name.split(' ').map((w) => w[0]).join('')}</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1F1F1F]">{s.name}</span><span className="block text-xs text-[#5F6368]">{s.role} · pay {formatKwacha(s.pay)} a month</span></span>
                        {s.ask > 0 ? (state[s.id] === 'APPROVED' ? <span className="text-xs font-bold text-[#137333]">Approved {formatKwacha(s.ask)}</span> : <TonalButton onClick={() => setState((x) => ({ ...x, [s.id]: 'APPROVED' }))}>Approve {formatKwacha(s.ask)}</TonalButton>) : <span className="text-xs text-[#80868B]">No request</span>}</li>))}</ul>
            </Card>
            <Card title="How it works">
                <ol className="space-y-3 text-sm text-[#3C4043]">{['The employer switches the benefit on and sets a limit, for example half of monthly pay.', 'An employee asks for an advance from their phone.', 'The employer approves, and the money lands in the employee’s wallet within minutes.', 'The repayment is taken from the next payroll run, so the employee never has to remember.', 'The lender sees every advance and every recovery in one trail.'].map((t, i) => <li key={i} className="flex gap-3"><span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#D3E3FD] text-xs font-bold text-[#041E49]">{i + 1}</span>{t}</li>)}</ol>
            </Card>
        </div>
    );
};

/** One MoneyWise ID, saved once and used everywhere: what FMC asks for, how much is already covered, and who can see what. */
const IdView: React.FC = () => {
    const [shares, setShares] = useState([
        { id: 'fmc', who: 'FMC Finance', what: 'Business loan application', when: 'Today', scope: 'ID details, bank account, 12 months of money in and out', live: true },
        { id: 'inv', who: 'Zambia Investment Fund', what: 'Investment account', when: '12 Oct', scope: 'ID details, ID photo, selfie, proof of residence', live: true },
        { id: 'p4', who: 'MoneyWise Pay in 4', what: 'Buy now, pay in four', when: '2 Sep', scope: 'Money-in record only', live: true },
    ]);
    const idItems = [['Name, date of birth, gender, ID number', true], ['Phone and email', true], ['Home address', true], ['Next of kin', true], ['Bank account for payouts', true], ['Photo of your ID', true], ['A clear photo of you', true], ['Proof of residence', true]] as const;
    const fmcAsks: [string, 'ID' | 'MW' | 'FMC'][] = [['National ID card', 'ID'], ['Proof of residence', 'ID'], ['Clear photo', 'ID'], ['Next of kin', 'ID'], ['Bank account', 'ID'], ['Contact details', 'ID'], ['Director ID and KYC', 'ID'], ['Bank statement', 'MW'], ['Proof of income', 'MW'], ['Business registration certificate', 'FMC'], ['Audited financial statements', 'FMC']];
    const covered = fmcAsks.filter(([, k]) => k !== 'FMC').length;
    return (
        <div>
            <div className="mb-4 rounded-2xl bg-[#E8F0FE] p-4 md:p-5">
                <p className="flex items-center gap-2 text-sm font-bold text-[#041E49]"><Fingerprint size={16} /> Register once. Apply anywhere.</p>
                <p className="mt-1 max-w-3xl text-sm text-[#3C4043]">A person’s ID, address, next of kin, bank account and documents are saved on their MoneyWise ID the first time, and filled in for every loan, investment or business they apply to. The money records already live in MoneyWise (wallets, payroll, sales), so lenders get a summary instead of paper statements. The owner picks what each business sees and can cancel access at any time.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Mwila Banda’s MoneyWise ID">
                    <ul className="space-y-2">{idItems.map(([label]) => <li key={label} className="flex items-center gap-2 text-sm text-[#3C4043]"><Check size={15} className="flex-shrink-0 text-[#137333]" />{label}</li>)}</ul>
                    <p className="mt-3 rounded-xl bg-[#E6F4EA] px-3 py-2 text-xs text-[#137333]">8 of 8 complete. Entered once, checked once.</p>
                </Card>
                <Card title="What FMC Finance asks for">
                    <div className="mb-3 flex items-center gap-2"><FmcLogo size={36} /><p className="text-xs text-[#5F6368]">From FMC’s own business loan requirements</p></div>
                    <ul className="space-y-1.5">{fmcAsks.map(([label, k]) => (
                        <li key={label} className="flex items-center gap-2 text-sm"><span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${k === 'FMC' ? 'bg-[#E3E5E8]' : 'bg-[#34A853] text-white'}`}>{k !== 'FMC' && <Check size={10} strokeWidth={3} />}</span><span className="flex-1 text-[#3C4043]">{label}</span><span className="text-[11px] text-[#80868B]">{k === 'ID' ? 'On your ID' : k === 'MW' ? 'From MoneyWise' : 'Give to FMC'}</span></li>))}</ul>
                    <p className="mt-3 text-xs font-semibold text-[#1F1F1F]">{covered} of {fmcAsks.length} covered. Applying takes one tap.</p>
                </Card>
                <Card title="Who can see your ID">
                    <ul className="space-y-3">{shares.map((x) => (
                        <li key={x.id} className="rounded-xl bg-[#F8FAFD] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold text-[#1F1F1F]">{x.who}</p><p className="text-xs text-[#5F6368]">{x.what} · {x.when}</p></div>
                            {x.live ? <button type="button" onClick={() => setShares((l) => l.map((y) => (y.id === x.id ? { ...y, live: false } : y)))} className="flex-shrink-0 text-xs font-semibold text-[#B31412] underline">Stop sharing</button> : <span className="flex-shrink-0 text-xs font-semibold text-[#80868B]">Access removed</span>}</div>
                            <p className="mt-1 text-[11px] text-[#80868B]">Shared: {x.scope}</p></li>))}</ul>
                    <p className="mt-3 text-[11px] text-[#80868B]">Stopping access ends what they can see from now on. Copies already received follow that business’s own record-keeping rules.</p>
                </Card>
            </div>
            <Card className="mt-4" title="One ID, many doors">
                <ul className="flex flex-wrap gap-2">{['Loans', 'Investments', 'Marketplace', 'Payroll and employers', 'Insurance', 'Other businesses, through MoneyWise’s API'].map((x) => <li key={x} className="rounded-full bg-[#F1F3F4] px-4 py-2 text-sm font-medium text-[#3C4043]">{x}</li>)}</ul>
            </Card>
        </div>
    );
};

const TABS = [{ id: 'borrower', label: 'Borrower', icon: Banknote }, { id: 'id', label: 'One MoneyWise ID', icon: Fingerprint }, { id: 'lender', label: 'FMC Finance desk', icon: Landmark }, { id: 'staff', label: 'Staff advances', icon: Users }] as const;

export const LoansDemo: React.FC = () => {
    const navigate = useNavigate();
    const [tab, setTab] = useState<(typeof TABS)[number]['id']>('borrower');
    return (
        <PagePanel title="Loans demo" subtitle="A walk through lending on MoneyWise" back="/loans" actions={<TonalButton onClick={() => navigate('/loans')}>Exit demo</TonalButton>}>
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-[#FEF7E0] px-4 py-2.5 text-xs font-semibold text-[#B06000]"><CircleDollarSign size={15} /> DEMO · every name, figure and rate on these screens is made up. Nothing is saved or sent.</p>
            <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1" role="tablist">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold transition ${tab === id ? 'bg-[#D3E3FD] text-[#041E49]' : 'text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}><Icon size={16} /> {label}</button>
                ))}
            </div>
            {tab === 'borrower' ? <BorrowerView /> : tab === 'id' ? <IdView /> : tab === 'lender' ? <LenderDesk /> : <StaffView />}
            <p className="mt-6 flex items-center gap-2 text-xs text-[#80868B]"><Clock size={13} /> Press the buttons to move the story along.</p>
        </PagePanel>
    );
};
