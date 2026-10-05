import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { investmentService, ZAMBIA_BANK_NAMES } from 'core';
import { Landmark, ShieldCheck, Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * Where an investment company's investor deposits are sent. Saving verifies the bank
 * account, then keeps one Automation in step with it (deposit lands → transfer to this
 * account → proof-of-payment email). Mirrors Settings → Investor Payouts on the app.
 */
export const InvestorPayouts: React.FC = () => {
    const qc = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['investor-payout-settings'],
        queryFn: () => investmentService.getPayoutSettings(),
    });

    const [bank, setBank] = useState('');
    const [branch, setBranch] = useState('');
    const [number, setNumber] = useState('');
    const [name, setName] = useState('');
    const [forward, setForward] = useState(false);
    const [saved, setSaved] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);

    useEffect(() => {
        if (!data) return;
        setBank(data.bankName ?? '');
        setBranch(data.branch ?? '');
        setNumber(data.accountNumber ?? '');
        setName(data.accountName ?? '');
        setForward(data.forwardDeposits);
    }, [data]);

    const save = useMutation({
        mutationFn: () => investmentService.savePayoutSettings({
            bankName: bank, branch: branch || undefined, accountNumber: number, accountName: name || undefined, forwardDeposits: forward,
        }),
        onSuccess: (res) => {
            qc.setQueryData(['investor-payout-settings'], res);
            setFieldError(null);
            setSaved(res.forwardDeposits
                ? `Saved. Investor deposits will be forwarded to ${res.accountName} (${res.bankName}).`
                : 'Saved. Forwarding is off.');
        },
        onError: (e: any) => { setSaved(null); setFieldError(e?.message || 'Could not save. Please try again.'); },
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setSaved(null);
        if (!bank) return setFieldError('Select a bank.');
        if (!/^[0-9A-Za-z-]{4,34}$/.test(number.trim())) return setFieldError('Enter a valid account number.');
        setFieldError(null);
        save.mutate();
    };

    if (isLoading) return <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
    if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
    if (data && !data.isInvestmentCompany) {
        return <p className="text-sm text-gray-500 max-w-md">This organization isn't listed as an investment company, so there are no investor deposits to forward.</p>;
    }

    const input = 'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
    const label = 'block text-xs font-semibold text-gray-700 mb-1';

    return (
        <form onSubmit={submit} className="max-w-xl space-y-5">
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Landmark size={18} /></div>
                <div>
                    <h2 className="text-sm font-bold text-gray-900">Investor payouts</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Money investors deposit into your MoneyWise wallet can be sent on to your bank account automatically.</p>
                </div>
            </div>

            <div className="space-y-4 p-4 rounded-xl border border-gray-100 bg-white">
                <div>
                    <label className={label}>Bank</label>
                    <select value={bank} onChange={e => setBank(e.target.value)} className={input}>
                        <option value="">Select a bank…</option>
                        {ZAMBIA_BANK_NAMES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>
                <div>
                    <label className={label}>Branch <span className="font-normal text-gray-400">(optional)</span></label>
                    <input value={branch} onChange={e => setBranch(e.target.value)} className={input} />
                </div>
                <div>
                    <label className={label}>Account number</label>
                    <input value={number} onChange={e => setNumber(e.target.value)} inputMode="numeric" className={input} />
                </div>
                <div>
                    <label className={label}>Account name <span className="font-normal text-gray-400">(optional)</span></label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Filled in from the bank when you save" className={input} />
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-gray-500"><ShieldCheck size={13} className="text-emerald-600" /> We verify the account with the bank before saving.</p>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 bg-white space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Forward investor deposits</p>
                        <p className="text-xs text-gray-500 mt-0.5">Every deposit into your wallet is transferred to this account automatically.</p>
                    </div>
                    <button
                        type="button" role="switch" aria-checked={forward} onClick={() => setForward(f => !f)}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${forward ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${forward ? 'translate-x-5' : ''}`} />
                    </button>
                </div>
                {data?.proofOfPaymentEmail && (
                    <p className="flex items-center gap-1.5 text-[11px] text-gray-500"><Mail size={13} className="text-blue-600" /> A proof of payment is emailed to {data.proofOfPaymentEmail} after each transfer.</p>
                )}
                <p className="text-[11px] text-gray-400">Only deposits made after you switch this on are forwarded. Transfer fees are paid from the wallet when it can cover them, otherwise deducted from the transfer.</p>
            </div>

            {fieldError && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={14} /> {fieldError}</p>}
            {saved && <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 size={14} /> {saved}</p>}

            <button type="submit" disabled={save.isPending} className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
        </form>
    );
};
