import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock, Copy, CreditCard, EyeOff, Gauge, Globe, Lock, MoreHorizontal, Receipt, ShieldCheck, Snowflake, X } from 'lucide-react';
import { formatKwacha } from 'core';
import { useAuth } from '../../context/AuthContext';

type CardTheme = 'red' | 'blue' | 'black';
const THEMES: Record<CardTheme, { label: string; gradient: string; swatch: string }> = {
    red: { label: 'Red', gradient: 'linear-gradient(135deg,#D32F2F 0%,#7F1D1D 100%)', swatch: '#C62828' },
    blue: { label: 'Blue', gradient: 'linear-gradient(135deg,#1A6BE0 0%,#0842A0 100%)', swatch: '#0B57D0' },
    black: { label: 'Black', gradient: 'linear-gradient(135deg,#2B2F36 0%,#0B0D10 100%)', swatch: '#1F2937' },
};

/** The virtual card as it will look: a Visa card with the number hidden until the card is activated. */
export const VirtualCardPreview: React.FC<{ theme?: CardTheme; name?: string; currency?: string; locked?: boolean }> = ({ theme = 'red', name, currency = 'ZMW', locked = true }) => (
    <div className="relative w-full max-w-[420px] aspect-[1.586/1] rounded-[20px] p-5 text-white overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.18)] flex flex-col justify-between select-none" style={{ background: THEMES[theme].gradient }}>
        <div className="absolute -right-24 -top-28 w-64 h-64 rounded-full bg-white/[0.07]" />
        <div className="absolute -left-20 -bottom-32 w-56 h-56 rounded-full bg-white/[0.05]" />
        <div className="relative flex items-center justify-between">
            <span className="text-xl font-extrabold italic tracking-wide">VISA</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10.5px] font-bold">{locked && <Lock size={11} />}{locked ? 'Not activated' : 'Virtual'}</span>
        </div>
        <div className="relative w-10 h-[30px] rounded-md bg-white/25" />
        <div className="relative flex items-end gap-4">
            <div className="flex-1 min-w-0">
                <p className="text-[8.5px] tracking-widest text-white/70">CARD NUMBER</p>
                <p className="mt-1 text-[15px] font-bold tracking-[0.12em]">•••• •••• •••• ••••</p>
                {name ? <p className="mt-1.5 truncate text-[10.5px] font-medium tracking-wider text-white/85">{name.toUpperCase()}</p> : null}
            </div>
            <div><p className="text-[8.5px] tracking-widest text-white/70">EXP.</p><p className="mt-1 text-xs font-bold">--/--</p></div>
            <div><p className="text-[8.5px] tracking-widest text-white/70">CVV</p><p className="mt-1 text-xs font-bold">•••</p></div>
            <div><p className="text-[8.5px] tracking-widest text-white/70">{currency}</p></div>
        </div>
    </div>
);

const PERKS = [
    { icon: Globe, title: 'Pay anywhere online', text: 'Subscriptions, ads, flights and international shops that take Visa.' },
    { icon: Gauge, title: 'You set the limit', text: 'Choose what the card can spend each month and stop it overspending.' },
    { icon: Snowflake, title: 'Freeze in a click', text: 'Lost track of a charge? Freeze the card instantly and unfreeze when you are ready.' },
    { icon: ShieldCheck, title: 'Keeps your wallet safe', text: 'Shops never see your wallet or your real card details.' },
];

const AppleLogo: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = '#fff' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill={color} d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" /></svg>
);
const GoogleG: React.FC<{ size?: number }> = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
);
const MastercardLogo: React.FC<{ width?: number }> = ({ width = 42 }) => (
    <svg width={width} height={width * (24 / 38)} viewBox="0 0 38 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#EB001B" /><circle cx="26" cy="12" r="12" fill="#F79E1B" /><path fill="#FF5F00" d="M19 3.4a12 12 0 0 1 0 17.2 12 12 0 0 1 0-17.2z" /></svg>
);

/**
 * The wallet: Visa, Apple Pay, Google Pay and Mastercard spread left to right, each one's logo showing, with a see-through
 * glass pocket in front. Colours stay inside the app's palette: blue, black and white.
 */
const WalletVisual: React.FC = () => {
    const cards: { key: string; style: React.CSSProperties; cls: string; logo: React.ReactNode; rot: number; top: number }[] = [
        { key: 'visa', cls: '', style: { background: 'linear-gradient(135deg,#1A6BE0,#0842A0)' }, rot: -8, top: 8, logo: <span className="text-xl font-extrabold italic tracking-wide text-white">VISA</span> },
        { key: 'apple', cls: '', style: { background: 'linear-gradient(135deg,#1B1C1F,#000)' }, rot: -3, top: 36, logo: <span className="flex items-center gap-1.5 text-[17px] font-bold text-white"><AppleLogo size={20} />Pay</span> },
        { key: 'google', cls: 'border border-[#DCE3EE]', style: { background: 'linear-gradient(135deg,#fff,#F4F6FA)' }, rot: 3, top: 64, logo: <span className="flex items-center gap-1.5 text-[17px] font-bold text-[#3C4043]"><GoogleG size={20} />Pay</span> },
        { key: 'mc', cls: 'border border-[#DCE3EE]', style: { background: 'linear-gradient(135deg,#E3ECFF,#A9C0F8)' }, rot: 8, top: 92, logo: <MastercardLogo width={42} /> },
    ];
    return (
        <div className="relative h-[232px] w-full select-none">
            {cards.map((c, i) => (
                <div key={c.key} className={`absolute h-[118px] w-[78%] rounded-2xl p-3.5 shadow-[0_6px_16px_rgba(0,0,0,0.12)] ${c.cls}`} style={{ ...c.style, left: `${[0, 7, 13, 20][i]}%`, top: c.top, zIndex: i, transform: `rotate(${c.rot}deg)` }}>{c.logo}</div>
            ))}
            <div className="absolute inset-x-0 bottom-0 z-20 flex h-[102px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[26px] border border-white/55 text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]" style={{ background: 'linear-gradient(135deg,rgba(28,32,42,0.46),rgba(28,32,42,0.26))', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }}>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-white/60" />
                <div className="pointer-events-none absolute inset-[9px_11px] rounded-[18px] border-[1.5px] border-dashed border-white/40" />
                <p className="text-xs text-white/90">Virtual card balance</p>
                <p className="text-[32px] font-bold leading-none tracking-tight">K0<span className="text-white/65">.00</span></p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10.5px] font-bold"><Lock size={11} /> Not activated</span>
            </div>
        </div>
    );
};

export interface CardWallet { id: string; name: string; balance: number; is_main?: boolean }

/**
 * Card details: the card spins, rises onto the screen and turns to show its number, expiry and security code. It turns back by
 * itself after 30 seconds. The details are a preview with sample digits, ready to be replaced by the card issuer's.
 */
const SAMPLE = { number: '0000 0000 0000 0000', expiry: '00/00', cvv: '000' };
const CardDetailsReveal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { userName } = useAuth();
    const [shown, setShown] = useState(false);
    const [secs, setSecs] = useState(30);
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(id); }, []);
    const hide = React.useCallback(() => { setShown(false); window.setTimeout(onClose, 850); }, [onClose]);
    useEffect(() => { const t = window.setInterval(() => setSecs((n) => n - 1), 1000); return () => window.clearInterval(t); }, []);
    useEffect(() => { if (secs <= 0) hide(); }, [secs, hide]);
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [hide]);

    const copy = async (key: string, value: string) => {
        try { await navigator.clipboard.writeText(value.replace(/\s/g, '')); setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400); } catch { /* clipboard unavailable */ }
    };
    const Row = ({ k, label, value }: { k: string; label: string; value: string }) => (
        <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><p className="text-[8.5px] tracking-widest text-white/60">{label}</p><p className="mt-0.5 text-[17px] font-bold tracking-[0.1em] text-white">{value}</p></div>
            <button type="button" onClick={() => copy(k, value)} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label={`Copy ${label}`}>{copied === k ? <Check size={14} /> : <Copy size={14} />}</button>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center p-5" role="dialog" aria-modal="true" aria-label="Card details">
            <div className="absolute inset-0 bg-[#080A0E]/70 transition-opacity duration-500" style={{ opacity: shown ? 1 : 0 }} onClick={hide} />
            <div className="relative aspect-[1.586/1] w-[min(92vw,380px)]" style={{ perspective: '1400px', opacity: shown ? 1 : 0, transform: shown ? 'translateY(0) scale(1)' : 'translateY(140px) scale(0.82)', transition: 'transform 600ms cubic-bezier(.22,.61,.36,1), opacity 500ms ease' }}>
                <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: shown ? 'rotateY(540deg)' : 'rotateY(0deg)', transition: shown ? 'transform 1250ms cubic-bezier(.22,.61,.36,1) 120ms' : 'transform 700ms cubic-bezier(.65,0,.35,1)' }}>
                    <div className="absolute inset-0 overflow-hidden rounded-[20px] p-[18px] text-white shadow-[0_18px_40px_rgba(0,0,0,0.4)]" style={{ backfaceVisibility: 'hidden', background: 'linear-gradient(135deg,#1A6BE0,#0842A0)' }}>
                        <div className="absolute -right-24 -top-28 h-64 w-64 rounded-full bg-white/[0.07]" />
                        <span className="relative text-2xl font-extrabold italic tracking-wide">VISA</span>
                        <span className="absolute right-[18px] top-[18px] h-7 w-[38px] rounded-md bg-white/30" />
                        <span className="absolute bottom-4 left-[18px] text-xs font-medium text-white/80">Virtual card</span>
                    </div>
                    <div className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[20px] p-[18px] text-white shadow-[0_18px_40px_rgba(0,0,0,0.4)]" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'linear-gradient(135deg,#12151B,#05070A)' }}>
                        <div className="flex items-center justify-between"><span className="text-base font-extrabold italic">VISA</span><span className="rounded-full bg-white/15 px-2.5 py-1 text-[9.5px] font-bold">Preview · sample details</span></div>
                        <Row k="number" label="CARD NUMBER" value={SAMPLE.number} />
                        <div className="grid grid-cols-2 gap-4"><Row k="exp" label="EXPIRY" value={SAMPLE.expiry} /><Row k="cvv" label="SECURITY CODE" value={SAMPLE.cvv} /></div>
                        <p className="truncate text-[11px] font-medium tracking-wider text-white/85">{(userName || 'CARD HOLDER').toUpperCase()}</p>
                    </div>
                </div>
            </div>
            <div className="relative mt-7 flex max-w-[360px] flex-col items-center gap-3 text-center transition-opacity duration-500" style={{ opacity: shown ? 1 : 0 }}>
                <p className="text-xs font-medium text-white/75">Hides in {Math.max(secs, 0)}s</p>
                <button type="button" onClick={hide} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#1F1F1F]"><EyeOff size={16} /> Hide details</button>
                <p className="text-[11px] leading-4 text-white/60">Sample digits for now. Your real number, expiry and code appear here once cards open.</p>
            </div>
        </div>
    );
};

/** Flip to true once cards can be issued: the payment history then appears under the wallet. */
const CARD_ACTIVATED = false;

/** The Virtual Card tab on Wallets: the card in its wallet, a way in to the setup, and what you get. */
export const VirtualCardTab: React.FC<{ wallets: CardWallet[] }> = ({ wallets }) => {
    const [open, setOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-5 md:py-8">
            <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8">
                <div className="space-y-4">
                    <WalletVisual />
                    <p className="rounded-xl bg-[#EAF1FF] px-4 py-3 text-xs font-medium leading-5 text-[#0B57D0]">Virtual cards are coming soon. Set yours up now and you will be first in line.</p>
                    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0B57D0] text-sm font-bold text-white hover:bg-[#0842A0]"><CreditCard size={18} /> Get your virtual card</button>
                    <div className="grid grid-cols-2 gap-2.5">
                        <button type="button" onClick={() => setDetailsOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50" aria-label="Show card details"><CreditCard size={18} className="text-[#1F1F1F]" /><span className="text-sm font-bold text-[#1F1F1F]">Card details</span></button>
                        <button type="button" onClick={() => setMoreOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50" aria-label="More card options"><MoreHorizontal size={18} className="text-[#1F1F1F]" /><span className="text-sm font-bold text-[#1F1F1F]">More</span></button>
                    </div>
                </div>
                <div className="space-y-4">
                    {CARD_ACTIVATED && (
                        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
                            <h4 className="text-base font-bold text-[#1F1F1F]">Payment history</h4>
                            <div className="flex flex-col items-center gap-1.5 py-4 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1F3F4] text-[#9AA0A6]"><Receipt size={20} /></span><p className="text-sm font-bold text-[#1F1F1F]">No payments yet</p><p className="max-w-[260px] text-xs leading-5 text-[#5F6368]">Every payment you make with the card will show here, with the shop and the date.</p></div>
                        </div>
                    )}
                    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
                        <h4 className="text-base font-bold text-[#1F1F1F]">What you get</h4>
                        {PERKS.map((p) => (
                            <div key={p.title} className="flex items-start gap-3">
                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#EAF1FF] text-[#0B57D0]"><p.icon size={17} /></div>
                                <div><p className="text-sm font-bold text-[#1F1F1F]">{p.title}</p><p className="text-xs leading-5 text-[#5F6368]">{p.text}</p></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {detailsOpen && <CardDetailsReveal onClose={() => setDetailsOpen(false)} />}
            {moreOpen && (
                <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={() => setMoreOpen(false)}>
                    <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-bold text-[#1F1F1F]">More</h3><button type="button" onClick={() => setMoreOpen(false)} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={18} /></button></div>
                        <button type="button" onClick={() => { setMoreOpen(false); setOpen(true); }} className="flex w-full items-center gap-3 rounded-xl py-3 text-left hover:bg-gray-50">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF1FF] text-[#0B57D0]"><Gauge size={18} /></span>
                            <span className="flex-1"><span className="block text-sm font-bold text-[#1F1F1F]">Card limits</span><span className="block text-xs text-[#5F6368]">Choose what the card can spend each month.</span></span>
                            <ArrowRight size={18} className="text-gray-400" />
                        </button>
                        <div className="flex w-full items-center gap-3 py-3 opacity-55">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF1FF] text-[#0B57D0]"><Snowflake size={18} /></span>
                            <span className="flex-1"><span className="block text-sm font-bold text-[#1F1F1F]">Freeze card</span><span className="block text-xs text-[#5F6368]">Available once your card is active.</span></span>
                        </div>
                    </div>
                </div>
            )}
            {open && <VirtualCardSetup wallets={wallets} onClose={() => setOpen(false)} />}
        </div>
    );
};

const STEPS = ['Welcome', 'Your card', 'Funding', 'Your details', 'Review'];
const LIMITS = [1000, 5000, 10000, 25000];

const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#0B57D0] focus:ring-2 focus:ring-[#0B57D0]/20';
const chip = (on: boolean) => `rounded-full border px-4 py-2 text-xs font-semibold transition ${on ? 'border-[#0B57D0] bg-[#0B57D0] text-white' : 'border-gray-200 bg-white text-[#1F1F1F] hover:border-[#0B57D0]'}`;

/** Virtual card setup, from the welcome through to the last page. Nothing is saved yet: the final button says Coming soon. */
export const VirtualCardSetup: React.FC<{ wallets: CardWallet[]; onClose: () => void }> = ({ wallets, onClose }) => {
    const { userName } = useAuth();
    const [step, setStep] = useState(0);
    const [theme, setTheme] = useState<CardTheme>('red');
    const [currency, setCurrency] = useState<'ZMW' | 'USD'>('ZMW');
    const [nickname, setNickname] = useState('');
    const [walletId, setWalletId] = useState('');
    const [limit, setLimit] = useState(5000);
    const [customLimit, setCustomLimit] = useState('');
    const [holder, setHolder] = useState('');
    const [phone, setPhone] = useState('');
    const [town, setTown] = useState('');
    const [agree, setAgree] = useState(false);

    useEffect(() => { if (!walletId && wallets.length) setWalletId((wallets.find((w) => w.is_main) ?? wallets[0]).id); }, [wallets, walletId]);
    useEffect(() => { if (!holder && userName) setHolder(userName); }, [userName]); // eslint-disable-line react-hooks/exhaustive-deps

    const effectiveLimit = customLimit ? Number(customLimit) || 0 : limit;
    const wallet = wallets.find((w) => w.id === walletId);
    const phoneOk = phone.replace(/\D/g, '').length >= 9;
    const canContinue = useMemo(() => (step === 2 ? !!walletId && effectiveLimit > 0 : step === 3 ? holder.trim().length > 1 && phoneOk : true), [step, walletId, effectiveLimit, holder, phoneOk]);
    const last = step === STEPS.length - 1;

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
            <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[#F8FAFD] shadow-2xl sm:rounded-3xl">
                <div className="flex items-center justify-between px-5 pt-5">
                    <h3 className="text-base font-bold text-[#1F1F1F]">Virtual card</h3>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
                </div>
                <div className="px-5 pb-2 pt-3">
                    <div className="flex gap-1.5">{STEPS.map((s, i) => <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[#0B57D0]' : 'bg-[#DDE3EC]'}`} />)}</div>
                    <p className="mt-2 text-xs font-medium text-[#5F6368]">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-2">
                    <VirtualCardPreview theme={theme} name={step >= 3 ? holder : nickname || undefined} currency={currency} locked />

                    {step === 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xl font-bold text-[#1F1F1F]">Your own virtual Visa card</h4>
                            <p className="text-sm leading-6 text-[#5F6368]">A card number that lives in the app. Use it to pay online, keep your wallet out of sight, and stay in control of every charge.</p>
                            {[['Set up', 'Choose how it looks and what it can spend.'], ['Fund', 'Top it up from any of your MoneyWise wallets.'], ['Spend', 'Pay on any website that takes Visa. Freeze it any time.']].map(([t, d], i) => (
                                <div key={t} className="flex items-start gap-3">
                                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#EAF1FF] text-xs font-bold text-[#0B57D0]">{i + 1}</div>
                                    <div><p className="text-sm font-bold text-[#1F1F1F]">{t}</p><p className="text-xs leading-5 text-[#5F6368]">{d}</p></div>
                                </div>
                            ))}
                            <p className="flex items-start gap-2.5 rounded-xl bg-[#EAF1FF] p-3 text-xs leading-5 text-[#0B57D0]"><Clock size={15} className="mt-0.5 flex-shrink-0" />It takes about two minutes. You can go through every step now; activation opens soon.</p>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-4">
                            <h4 className="text-xl font-bold text-[#1F1F1F]">Choose your card</h4>
                            <div><p className="mb-2 text-xs font-bold text-[#1F1F1F]">Colour</p>
                                <div className="flex gap-3">{(Object.keys(THEMES) as CardTheme[]).map((k) => (
                                    <button key={k} type="button" onClick={() => setTheme(k)} className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-1.5 ${theme === k ? 'border-[#0B57D0]' : 'border-transparent'}`} aria-label={`${THEMES[k].label} card`}>
                                        <span className="flex h-9 w-14 items-center justify-center rounded-lg text-white" style={{ background: THEMES[k].swatch }}>{theme === k && <Check size={16} />}</span>
                                        <span className="text-[11px] font-medium">{THEMES[k].label}</span>
                                    </button>))}</div></div>
                            <div><p className="mb-2 text-xs font-bold text-[#1F1F1F]">Currency</p>
                                <div className="flex gap-2">{(['ZMW', 'USD'] as const).map((c) => <button key={c} type="button" onClick={() => setCurrency(c)} className={chip(currency === c)}>{c === 'ZMW' ? 'Kwacha (ZMW)' : 'US dollar (USD)'}</button>)}</div>
                                <p className="mt-2 text-[11px] leading-4 text-[#5F6368]">{currency === 'USD' ? 'Best for international websites. Your wallet is converted at the day’s rate when you fund the card.' : 'Best for shops and services that charge in kwacha.'}</p></div>
                            <div><label className="mb-1.5 block text-xs font-bold text-[#1F1F1F]">Card name (optional)</label><input className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Online shopping" maxLength={24} /></div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h4 className="text-xl font-bold text-[#1F1F1F]">Funding and limit</h4>
                            <div><p className="mb-2 text-xs font-bold text-[#1F1F1F]">Fund the card from</p>
                                <div className="flex flex-wrap gap-2">{wallets.map((w) => <button key={w.id} type="button" onClick={() => setWalletId(w.id)} className={chip(walletId === w.id)}>{w.name} · {formatKwacha(w.balance)}</button>)}</div></div>
                            <div><p className="mb-2 text-xs font-bold text-[#1F1F1F]">Monthly spending limit</p>
                                <div className="flex flex-wrap gap-2">{LIMITS.map((l) => <button key={l} type="button" onClick={() => { setLimit(l); setCustomLimit(''); }} className={chip(!customLimit && limit === l)}>{formatKwacha(l)}</button>)}</div>
                                <input className={`${inputCls} mt-3`} inputMode="numeric" value={customLimit} onChange={(e) => setCustomLimit(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Or type your own limit (K)" />
                                <p className="mt-2 text-[11px] leading-4 text-[#5F6368]">The card can never spend more than this in a month, however much is in your wallet.</p></div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <h4 className="text-xl font-bold text-[#1F1F1F]">Your details</h4>
                            <div><label className="mb-1.5 block text-xs font-bold text-[#1F1F1F]">Name on the card</label><input className={inputCls} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="As on your ID" /></div>
                            <div><label className="mb-1.5 block text-xs font-bold text-[#1F1F1F]">Phone number</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="09…" />{phone && !phoneOk && <p className="mt-1 text-[11px] text-[#B31412]">Enter a full phone number.</p>}</div>
                            <div><label className="mb-1.5 block text-xs font-bold text-[#1F1F1F]">Town (billing address)</label><input className={inputCls} value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g. Lusaka" /></div>
                            <p className="flex items-start gap-2.5 rounded-xl bg-[#EAF1FF] p-3 text-xs leading-5 text-[#0B57D0]"><ShieldCheck size={15} className="mt-0.5 flex-shrink-0" />We use your verified MoneyWise profile for the identity check, so there is nothing to upload.</p>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-3">
                            <h4 className="text-xl font-bold text-[#1F1F1F]">Review your card</h4>
                            <dl className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white px-4">
                                {[['Name on card', holder || '—'], ['Card name', nickname || 'Not set'], ['Colour', THEMES[theme].label], ['Currency', currency], ['Funded from', wallet ? wallet.name : '—'], ['Monthly limit', formatKwacha(effectiveLimit)], ['Phone', phone || '—'], ['Town', town || '—']].map(([k, v]) => (
                                    <div key={k} className="flex justify-between gap-4 py-3 text-xs"><dt className="text-[#5F6368]">{k}</dt><dd className="truncate text-right font-bold text-[#1F1F1F]">{v}</dd></div>))}
                            </dl>
                            <label className="flex items-start gap-2.5 text-xs leading-5 text-[#5F6368]"><input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I agree to the virtual card terms and understand the card is funded from my wallet.</label>
                        </div>
                    )}
                </div>

                <div className="space-y-2.5 border-t border-gray-200 bg-white px-5 py-4">
                    {last ? (
                        <>
                            <div className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-full bg-[#D5DAE2] text-sm font-bold text-[#6B7280]" aria-disabled="true">Activate card <span className="rounded-full bg-white px-2.5 py-0.5 text-[10.5px] font-bold text-[#0B57D0]">Coming soon</span></div>
                            <p className="text-center text-[11.5px] leading-4 text-[#5F6368]">We will tell you the moment virtual cards open, and your choices are ready to go.</p>
                            <button type="button" onClick={() => setStep((s) => s - 1)} className="block w-full text-center text-xs font-bold text-[#0B57D0]">Back</button>
                        </>
                    ) : (
                        <div className="flex gap-2.5">
                            {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} className="h-12 rounded-full bg-[#EAF1FF] px-6 text-sm font-bold text-[#0B57D0]">Back</button>}
                            <button type="button" disabled={!canContinue} onClick={() => setStep((s) => s + 1)} className="h-12 flex-1 rounded-full bg-[#0B57D0] text-sm font-bold text-white hover:bg-[#0842A0] disabled:opacity-45">{step === 0 ? 'Get started' : 'Continue'}</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
