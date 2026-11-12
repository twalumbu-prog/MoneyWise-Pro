import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { cashbookService, formatKwacha, parseTapCode, requisitionService, tapService, type TapRequestView } from 'core';
import { useAuth } from '../context/AuthContext';

const isPhone = () => typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Pay a request: the page a request's link opens (https://…/r/<code>). It shows who is asking and how much, and pays through the normal
 * MoneyWise-to-MoneyWise transfer. On a phone it also offers to open the same request in the MoneyWise app.
 */
export const PayRequest: React.FC = () => {
    const { code: raw } = useParams<{ code: string }>();
    const code = parseTapCode(String(raw ?? '')) ?? '';
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { userRole } = useAuth();

    const [view, setView] = useState<TapRequestView | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState('');
    const [stage, setStage] = useState<'confirm' | 'sending' | 'done'>('confirm');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!code) { setLoadError('That isn’t a MoneyWise request code.'); return; }
        tapService.resolve(code).then((v) => { setView(v); if (v.amount) setAmount(String(v.amount)); }).catch((e) => setLoadError(e?.message || 'This request isn’t available.'));
    }, [code]);

    const { data: wallets = [] } = useQuery({
        queryKey: ['wallets-tap-pay'],
        queryFn: async () => ((await cashbookService.getWallets()) as any[]).map((w) => ({ id: String(w.id), name: String(w.name), balance: Number(w.balance) || 0, isMain: !!w.is_main })),
    });
    useEffect(() => { if (!walletId && wallets.length) setWalletId((wallets.find((w) => w.isMain) ?? wallets[0]).id); }, [wallets, walletId]);

    const value = view?.amount ?? (Number(amount) || 0);
    const wallet = wallets.find((w) => w.id === walletId);
    const short = !!wallet && wallet.balance + 0.005 < value;
    const isAdmin = userRole === 'ADMIN';
    const canPay = !!view && value > 0 && !!wallet && !short && isAdmin && stage === 'confirm';

    const pay = async () => {
        if (!view || !canPay) return;
        setError(null); setStage('sending');
        try {
            const claimed = await tapService.claim(code);
            const r = claimed.recipient;
            if (claimed.amount && Math.abs(claimed.amount - value) > 0.005) throw new Error('The amount asked for has changed. Open the request again.');
            const created = await requisitionService.create({
                description: `Tap payment to ${r.name}${view.note ? ` · ${view.note}` : ''}`.slice(0, 200),
                estimated_total: value,
                payment_method: 'MONEYWISE_PAY',
                recipient_account: r.id,
                recipient_bank_code: 'MONEYWISE',
                recipient_name: r.name,
                recipient_organization_id: r.organization_id || undefined,
            } as any);
            await tapService.attach(code, created.id);
            const result: any = await requisitionService.autoDisburse(created.id, {
                payment_method: 'MONEYWISE_PAY', total_prepared: value, recipient_account: r.id, recipient_bank_code: 'moneywise',
                recipient_account_name: r.name, recipient_organization_id: r.organization_id || undefined, wallet_id: walletId || undefined,
            });
            if (result?.lencoStatus === 'pending') {
                for (let attempt = 0; attempt < 8; attempt++) {
                    await new Promise((res) => setTimeout(res, 4000));
                    const poll: any = await requisitionService.verifyDisbursement(created.id);
                    if (poll.status === 'successful') break;
                    if (poll.status === 'failed') throw new Error(poll.error || poll.details?.reasonForFailure || 'The transfer was rejected.');
                }
            }
            void qc.invalidateQueries({ queryKey: ['requisitions'] }); void qc.invalidateQueries({ queryKey: ['cashbook'] });
            setStage('done');
        } catch (e: any) {
            setStage('confirm');
            setError(e?.message || 'The payment didn’t go through.');
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFD] p-4">
            <div className="w-full max-w-md space-y-4">
                <h1 className="text-center text-lg font-bold text-[#1F1F1F]">Pay request</h1>

                {loadError ? (
                    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 text-center">
                        <AlertCircle className="mx-auto text-[#B06000]" size={40} />
                        <p className="font-bold text-[#1F1F1F]">Can’t open this request</p>
                        <p className="text-sm text-[#5F6368]">{loadError}</p>
                        <button type="button" onClick={() => navigate('/')} className="h-11 w-full rounded-full bg-[#0B57D0] text-sm font-bold text-white">Back to MoneyWise</button>
                    </div>
                ) : !view ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#0B57D0]" /></div>
                ) : stage === 'done' ? (
                    <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-6 text-center">
                        <CheckCircle2 className="mx-auto text-[#137333]" size={56} />
                        <p className="text-2xl font-bold text-[#1F1F1F]">{formatKwacha(value)} sent</p>
                        <p className="text-sm text-[#5F6368]">to {view.recipient.name}</p>
                        <button type="button" onClick={() => navigate('/')} className="mt-3 h-11 w-full rounded-full bg-[#0B57D0] text-sm font-bold text-white">Done</button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">You are paying</p>
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF1FF] text-lg font-bold text-[#0B57D0]">{view.recipient.name.trim().charAt(0).toUpperCase()}</div>
                                <div><p className="text-base font-bold text-[#1F1F1F]">{view.recipient.name}</p><p className="text-xs text-[#5F6368]">{view.recipient.organization_name} · {view.recipient.moneywise_id}</p></div>
                            </div>
                            {view.note && <p className="text-sm italic text-[#5F6368]">“{view.note}”</p>}
                            {view.amount ? <p className="text-4xl font-bold tracking-tight text-[#1F1F1F]">{formatKwacha(view.amount)}</p> : (
                                <input className="w-full rounded-xl border border-gray-200 px-3 py-3 text-xl font-bold outline-none focus:border-[#0B57D0]" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="Amount (K)" />
                            )}
                        </div>

                        <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-5">
                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400">Pay from</p>
                            <div className="flex flex-wrap gap-2">
                                {wallets.map((w) => (
                                    <button key={w.id} type="button" onClick={() => setWalletId(w.id)} className={`rounded-full border px-4 py-2 text-xs font-semibold ${walletId === w.id ? 'border-[#0B57D0] bg-[#0B57D0] text-white' : 'border-gray-200 bg-white text-[#1F1F1F]'}`}>{w.name} · {formatKwacha(w.balance)}</button>
                                ))}
                            </div>
                            {short && <p className="text-xs text-[#B31412]">This wallet doesn’t have enough. Pick another or deposit first.</p>}
                        </div>

                        {!isAdmin && <p className="rounded-xl bg-[#FCE8E6] p-3 text-xs text-[#B31412]">Only the account holder can pay by tap. Ask them to open this link.</p>}
                        {error && <p className="rounded-xl bg-[#FCE8E6] p-3 text-xs leading-5 text-[#B31412]">{error}</p>}

                        <button type="button" disabled={!canPay} onClick={pay} className="flex h-12 w-full items-center justify-center rounded-full bg-[#0B57D0] text-sm font-bold text-white disabled:opacity-45">
                            {stage === 'sending' ? <Loader2 className="animate-spin" size={18} /> : value > 0 ? `Pay ${formatKwacha(value)}` : 'Pay'}
                        </button>
                        <p className="flex items-start justify-center gap-2 text-center text-[11px] leading-4 text-[#5F6368]"><ShieldCheck size={14} className="mt-px flex-shrink-0" />Check the name and amount before you pay.</p>
                        {isPhone() && (
                            <a href={`moneywise://r/${code}`} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#EAF1FF] text-sm font-bold text-[#0B57D0]"><Smartphone size={16} /> Open in the MoneyWise app</a>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PayRequest;
