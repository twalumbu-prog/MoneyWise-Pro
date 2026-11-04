import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle, Clock, FileText } from 'lucide-react';
import { INVESTOR_STATUS_LABEL, investmentService } from 'core';
import type { InvestmentTarget, InvestorAccountStatus, MyInvestorAccount } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';

const STATUS_STYLE: Record<InvestorAccountStatus, string> = {
    PENDING_REVIEW: 'bg-[#E8F0FE] text-[#1967D2]',
    INFO_REQUESTED: 'bg-[#FEF7E0] text-[#B06000]',
    ACTIVE: 'bg-[#E6F4EA] text-[#137333]',
    REJECTED: 'bg-[#FCE8E6] text-[#B31412]',
    SUSPENDED: 'bg-[#F1F3F4] text-[#5F6368]',
};

/**
 * Investor accounts: the accounts and applications a person has with investment companies, and a one-step way to apply to another
 * using their saved KYC profile. The web twin of the Expo "Investor applications" screen.
 */
export const InvestAccounts: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [applyFor, setApplyFor] = useState<InvestmentTarget | null>(null);
    const [connectFor, setConnectFor] = useState<InvestmentTarget | null>(null);

    const { data: targets = [], isPending: loadingTargets } = useQuery({ queryKey: ['invest-targets'], queryFn: () => investmentService.getTargets() });
    const { data: accounts = [], isPending: loadingAccounts } = useQuery({ queryKey: ['invest-my-accounts'], queryFn: () => investmentService.getMyAccounts() });
    const { data: kyc } = useQuery({ queryKey: ['kyc-profile'], queryFn: () => investmentService.getKycProfile() });

    const byTarget = new Map<string, MyInvestorAccount>(accounts.map((a) => [a.targetId, a]));
    const companies = targets.filter((t) => t.requiresAccount || byTarget.has(t.id));
    const refresh = () => qc.invalidateQueries({ queryKey: ['invest-my-accounts'] });

    return (
        <PagePanel
            title="Investor accounts"
            subtitle="Your accounts and applications with investment companies"
            back="/invest"
            actions={<TonalButton onClick={() => navigate('/invest/kyc')}><FileText size={15} /> {kyc?.complete ? 'KYC profile' : 'Set up KYC profile'}</TonalButton>}
        >
            {kyc && !kyc.complete && (
                <p className="mb-5 flex items-start gap-2 rounded-xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#B06000]">
                    <Clock size={16} className="mt-0.5 flex-shrink-0" />
                    <span>Save your KYC profile first so you can apply to any company in one step. <button type="button" onClick={() => navigate('/invest/kyc')} className="font-bold underline">Set it up</button></span>
                </p>
            )}

            {loadingTargets || loadingAccounts ? (
                <p className="py-10 text-center text-sm text-[#80868B]">Loading…</p>
            ) : companies.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[#C4C7C5] px-6 py-12 text-center text-sm text-[#5F6368]">No investment companies need an account right now.</p>
            ) : (
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {companies.map((t) => {
                        const acct = byTarget.get(t.id);
                        return (
                            <li key={t.id} className="flex flex-col rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
                                <div className="flex items-center gap-3">
                                    {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Building2 size={20} /></span>}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold text-[#1F1F1F]">{t.displayName}</span>
                                        {t.category && <span className="block truncate text-xs text-[#5F6368]">{t.category}</span>}
                                    </span>
                                    {acct && <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${STATUS_STYLE[acct.status]}`}>{INVESTOR_STATUS_LABEL[acct.status] ?? acct.status}</span>}
                                </div>
                                {acct ? (
                                    <div className="mt-4 text-sm">
                                        {acct.accountNumber && <p className="text-[#1F1F1F]">Account <span className="font-semibold tabular-nums">{acct.accountNumber}</span></p>}
                                        {acct.reviewNote && <p className="mt-1 rounded-lg bg-[#F8FAFD] px-3 py-2 text-xs text-[#5F6368]">{acct.reviewNote}</p>}
                                        {acct.status === 'ACTIVE' && <p className="mt-1 flex items-center gap-1.5 text-xs text-[#137333]"><CheckCircle size={13} /> You can invest with this company.</p>}
                                        {acct.status === 'PENDING_REVIEW' && <p className="mt-1 text-xs text-[#5F6368]">The company is reviewing your details and documents.</p>}
                                    </div>
                                ) : (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <PrimaryButton onClick={() => (kyc?.complete ? setApplyFor(t) : navigate('/invest/kyc'))} className="h-10 px-5">Open an account</PrimaryButton>
                                        <TonalButton onClick={() => setConnectFor(t)}>I already have one</TonalButton>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <ApplyDialog target={applyFor} onClose={() => setApplyFor(null)} onDone={() => { setApplyFor(null); refresh(); }} />
            <ConnectDialog target={connectFor} onClose={() => setConnectFor(null)} onDone={() => { setConnectFor(null); refresh(); }} />
        </PagePanel>
    );
};

const ApplyDialog: React.FC<{ target: InvestmentTarget | null; onClose: () => void; onDone: () => void }> = ({ target, onClose, onDone }) => {
    const [declared, setDeclared] = useState(false);
    const [salesPerson, setSalesPerson] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    React.useEffect(() => { if (target) { setDeclared(false); setSalesPerson(''); setError(null); setSent(false); } }, [target]);

    const submit = async () => {
        if (!target) return;
        if (!declared) { setError('Please confirm the declaration to continue.'); return; }
        setBusy(true); setError(null);
        try {
            await investmentService.applyWithKycProfile({ targetId: target.id, declaration: true, salesPerson: salesPerson || undefined });
            setSent(true);
        } catch (e: any) {
            setError(e?.message || 'Your application could not be sent. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={!!target} title={sent ? 'Application sent' : `Open an account with ${target?.displayName ?? ''}`} onClose={sent ? onDone : onClose} size="md">
            {sent ? (
                <div className="flex flex-col items-center text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#34A853] text-[#34A853]"><CheckCircle size={26} /></span>
                    <p className="mt-3 text-sm text-[#5F6368]">Your application has been sent to {target?.displayName}. We emailed you a confirmation. You’ll get another email when your account is approved and your account number is issued.</p>
                    <PrimaryButton onClick={onDone} className="mt-6 w-full">Done</PrimaryButton>
                </div>
            ) : (
                <>
                    <ErrorNote text={error} />
                    <p className="mb-4 text-sm text-[#5F6368]">We’ll send the details and documents from your saved KYC profile.</p>
                    {!!target?.salesPeople?.length && (
                        <div className="mb-4">
                            <label className={labelClass} htmlFor="ia-sales">Sales person (optional)</label>
                            <select id="ia-sales" className={`${fieldClass} appearance-none`} value={salesPerson} onChange={(e) => setSalesPerson(e.target.value)}>
                                <option value="">No one in particular</option>
                                {target.salesPeople.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    )}
                    <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-[rgba(116,119,117,0.22)] p-4">
                        <input type="checkbox" checked={declared} onChange={(e) => { setDeclared(e.target.checked); setError(null); }} className="mt-0.5 h-5 w-5 rounded border-[#C4C7C5] text-[#0B57D0] focus:ring-[#0B57D0]" />
                        <span className="text-sm text-[#3C4043]">I declare that the information and documents I’ve provided are true and complete, and I agree to {target?.displayName} using them to open my account.</span>
                    </label>
                    <PrimaryButton onClick={submit} busy={busy} className="w-full">Send application</PrimaryButton>
                </>
            )}
        </Dialog>
    );
};

const ConnectDialog: React.FC<{ target: InvestmentTarget | null; onClose: () => void; onDone: () => void }> = ({ target, onClose, onDone }) => {
    const [number, setNumber] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    React.useEffect(() => { if (target) { setNumber(''); setError(null); } }, [target]);

    const connect = async () => {
        if (!target) return;
        if (!number.trim()) { setError('Enter your account number.'); return; }
        setBusy(true); setError(null);
        try {
            await investmentService.connectAccount(target.id, number.trim());
            onDone();
        } catch (e: any) {
            setError(e?.message || 'We couldn’t connect that account. Check the number.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={!!target} title={`Connect your ${target?.displayName ?? ''} account`} onClose={onClose}>
            <ErrorNote text={error} />
            <p className="mb-4 text-sm text-[#5F6368]">Already have an account number with this company? Enter it to link it to MoneyWise.</p>
            <div className="mb-5">
                <label className={labelClass} htmlFor="ic-num">Account number</label>
                <input id="ic-num" className={fieldClass} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Your account number" autoFocus />
            </div>
            <PrimaryButton onClick={connect} busy={busy} className="w-full">Connect account</PrimaryButton>
        </Dialog>
    );
};
