import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, Check, ExternalLink, Loader2, LogIn, Smartphone, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiJson } from '../lib/api';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const fmt = (n: number) => `K${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

interface Wallet { id: string; name: string; is_main: boolean; balance: number }
export interface StoreLinkBody { walletId: string; items: any[]; orderDetails?: any; riderCharge?: number }

/**
 * The store's "MoneyWise" payment option. The cart becomes a one-time pay link, then:
 *  • signed in to MoneyWise on this browser → pay from one of your wallets right here;
 *  • on a phone → open the link in the MoneyWise app (the "slide to pay" screen);
 *  • on a computer → scan the code with the phone that has the app.
 * Either way this page notices when the link is paid and moves on to the receipt.
 */
export const StoreMoneyWisePay: React.FC<{
    body: StoreLinkBody;
    /** Same value changes ⇒ the cart changed ⇒ a new link is made. */
    cartKey: string;
    onPaid: (r: { reference: string | null; referenceNumber: string | null }) => void;
}> = ({ body, cartKey, onPaid }) => {
    const { session } = useAuth();
    const [link, setLink] = useState<{ token: string; total: number; fee: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [walletId, setWalletId] = useState<string>('');
    const [target, setTarget] = useState<{ own?: boolean; status?: string; reason?: string } | null>(null);
    const [paying, setPaying] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [appTried, setAppTried] = useState(false);
    const done = useRef(false);
    const bodyRef = useRef(body);
    bodyRef.current = body;

    // Turn the cart into a pay link (priced on the server).
    useEffect(() => {
        let cancelled = false;
        setLink(null); setError(null); setTarget(null); setProcessing(false); done.current = false;
        axios.post(`${API_URL}/pay-links/store-link`, bodyRef.current, { timeout: 20000 })
            .then((r) => { if (!cancelled) setLink(r.data); })
            .catch((e) => { if (!cancelled) setError(e?.response?.data?.error || 'We couldn’t prepare this payment. Please try again.'); });
        return () => { cancelled = true; };
    }, [cartKey]);

    // Signed in: show who/what is being paid and the wallets to pay from.
    useEffect(() => {
        if (!session || !link) return;
        let cancelled = false;
        apiJson<any>(`/pay-links/resolve?token=${encodeURIComponent(link.token)}`)
            .then((r) => {
                if (cancelled) return;
                setTarget({ own: r.own, status: r.status, reason: r.reason });
                const list: Wallet[] = r.wallets ?? [];
                setWallets(list);
                setWalletId((cur) => cur || (list.find((w) => w.is_main) ?? list[0])?.id || '');
            })
            .catch(() => { /* the pay button reports problems */ });
        return () => { cancelled = true; };
    }, [session, link]);

    // Watch for the payment (made here or in the app).
    useEffect(() => {
        if (!link) return;
        let stopped = false;
        const tick = async () => {
            if (stopped || done.current) return;
            try {
                const { data } = await axios.get(`${API_URL}/pay-links/store-link/${link.token}`, { timeout: 15000 });
                if (data.paid && !stopped && !done.current) { done.current = true; onPaid({ reference: data.reference, referenceNumber: data.referenceNumber }); return; }
            } catch { /* try again */ }
            if (!stopped) timer = setTimeout(tick, 3000);
        };
        let timer = setTimeout(tick, 2500);
        return () => { stopped = true; clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [link]);

    const wallet = wallets.find((w) => w.id === walletId);
    const short = !!link && !!wallet && wallet.balance + 0.005 < link.total;
    // QR / universal link: the phone that scans it isn't the one showing this page, so there is nowhere to return to.
    const appUrl = useMemo(() => (link ? `${window.location.origin}/pl/${link.token}` : ''), [link]);
    // On this phone the app sends the payer back to this very page afterwards, where `mwp` makes it show the receipt.
    const returnPath = link ? `${window.location.pathname}?mwp=${link.token}` : '';
    const phoneUrl = (scheme: string) => `${scheme}/pl/${link!.token}?src=safari&ret=${encodeURIComponent(returnPath)}`;

    const pay = async () => {
        if (!link) return;
        setPaying(true); setError(null);
        try {
            const r = await apiJson<{ status: 'paid' | 'processing' }>('/pay-links/pay', { method: 'POST', body: JSON.stringify({ token: link.token, walletId }) });
            if (r.status === 'processing') setProcessing(true);
        } catch (e: any) {
            setError(e?.message || 'The payment didn’t go through. Nothing was sent.');
        } finally { setPaying(false); }
    };

    const openApp = () => {
        if (!link) return;
        setAppTried(true);
        window.location.href = phoneUrl('moneywise:/');
    };

    const signIn = () => window.open('/login', '_blank', 'noopener');

    if (error && !link) return <Note tone="error">{error}</Note>;
    if (!link) return <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Preparing your payment…</div>;

    if (processing) {
        return (
            <div className="text-center py-10 px-4 bg-white border border-slate-100 rounded-2xl">
                <Loader2 size={26} className="mx-auto text-[#006AFF] animate-spin" />
                <h4 className="mt-3 text-sm font-bold text-slate-800">Confirming your payment…</h4>
                <p className="text-[11px] text-slate-500 mt-1.5 max-w-[240px] mx-auto leading-relaxed">Your money is on its way. This page updates the moment it’s confirmed.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {session ? (
                <>
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5">
                        <div className="flex items-center gap-2 mb-2.5"><Wallet size={15} className="text-slate-900" /><span className="text-xs font-bold text-zinc-600">Pay from your MoneyWise wallet</span></div>
                        {wallets.length === 0 ? (
                            <p className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading your wallets…</p>
                        ) : (
                            <div className="space-y-2">
                                {wallets.map((w) => (
                                    <button key={w.id} type="button" onClick={() => setWalletId(w.id)}
                                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${walletId === w.id ? 'border-[#006AFF] bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${walletId === w.id ? 'border-[#006AFF]' : 'border-slate-300'}`}>{walletId === w.id && <span className="w-2 h-2 rounded-full bg-[#006AFF]" />}</span>
                                            <span className="text-[13px] font-semibold text-slate-800 truncate">{w.name}</span>
                                        </span>
                                        <span className="text-[13px] font-bold text-slate-900 tabular-nums flex-shrink-0">{fmt(w.balance)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {target?.own && <p className="mt-3 text-[11px] text-rose-600 font-semibold">This is your own business — you can’t pay yourself. Sign in with a different account to pay.</p>}
                        {!target?.own && target?.status && target.status !== 'READY' && <p className="mt-3 text-[11px] text-rose-600 font-semibold">{target.reason || 'This can’t be paid with MoneyWise right now.'}</p>}
                        {short && <p className="mt-3 text-[11px] text-amber-700 font-semibold">{wallet?.name} has {fmt(wallet!.balance)} — this needs {fmt(link.total)}. Choose another wallet or add money first.</p>}
                    </div>
                    {error && <Note tone="error">{error}</Note>}
                    <button type="button" onClick={pay}
                        disabled={paying || !wallet || short || !!target?.own || (!!target?.status && target.status !== 'READY')}
                        className="w-full h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all bg-[#006AFF] hover:bg-[#0052CC] text-white disabled:bg-neutral-100 disabled:text-zinc-400 disabled:cursor-not-allowed">
                        {paying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        {paying ? 'Paying…' : `Pay ${fmt(link.total)}`}
                    </button>
                </>
            ) : (
                <>
                    {isPhone() ? (
                        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-6 text-center">
                            <span className="mx-auto w-12 h-12 rounded-full bg-[#EEF4FF] text-[#006AFF] flex items-center justify-center"><Smartphone size={22} /></span>
                            <h4 className="mt-3 text-sm font-bold text-slate-900">Pay in the MoneyWise app</h4>
                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Opens the app on this phone with {fmt(link.total)} ready to slide and pay.</p>
                            <button type="button" onClick={openApp} className="mt-4 w-full h-12 rounded-xl bg-[#006AFF] hover:bg-[#0052CC] text-white text-sm font-bold flex items-center justify-center gap-2"><ExternalLink size={15} /> Open MoneyWise</button>
                            {appTried && <p className="mt-3 text-[11px] text-zinc-500">Nothing opened? <a href={phoneUrl(window.location.origin)} className="font-semibold text-[#006AFF] underline">Try this link</a>, or pay with Mobile Money instead.</p>}
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-6 text-center">
                            <div className="mx-auto w-fit p-3 rounded-2xl border border-slate-200 bg-white"><QRCodeSVG value={appUrl} size={148} /></div>
                            <h4 className="mt-4 text-sm font-bold text-slate-900">Scan with the phone that has MoneyWise</h4>
                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-[250px] mx-auto">Point your camera at the code. The app opens with {fmt(link.total)} ready to slide and pay, and this page updates when it’s done.</p>
                        </div>
                    )}
                    <button type="button" onClick={signIn} className="w-full h-12 rounded-xl border border-slate-300 bg-white hover:bg-gray-50 text-slate-800 text-[13px] font-bold flex items-center justify-center gap-2"><LogIn size={15} /> Sign in to pay here instead</button>
                    <p className="text-center text-[10px] text-zinc-400">Signing in opens in a new tab — your cart stays here.</p>
                </>
            )}
            <p className="text-center text-[10px] text-zinc-400">Total {fmt(link.total)}{link.fee > 0 ? ` including a ${fmt(link.fee)} MoneyWise fee` : ''}. No mobile money charges.</p>
        </div>
    );
};

const Note: React.FC<{ tone: 'error'; children: React.ReactNode }> = ({ children }) => (
    <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start gap-2">
        <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
        <span className="text-[11px] font-semibold leading-normal">{children}</span>
    </div>
);
