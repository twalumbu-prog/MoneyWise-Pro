import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Check, CheckCircle2, Copy, Globe, Loader2, PowerOff, Share2, Users } from 'lucide-react';
import { formatKwacha, parseTapCode, tapService, type TapMode, type TapRequest, type TapRequestStatus } from 'core';

const OPTIONS: { mode: TapMode; icon: React.ElementType; title: string; text: string }[] = [
    { mode: 'OFF', icon: PowerOff, title: 'Off', text: 'Nobody can ask to pay you by tap, QR code or request link. This is the default.' },
    { mode: 'CONTACTS', icon: Users, title: 'My contacts', text: 'Only people you have sent money to before can open your request and pay you.' },
    { mode: 'EVERYONE', icon: Globe, title: 'Everyone', text: 'Any MoneyWise user who gets your request can pay you.' },
];

const input = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#0B57D0] focus:ring-2 focus:ring-[#0B57D0]/20';

/** Settings → Tap to pay: who can pay you, ask someone for money, and pay a request by code or link. */
export const TapToPay: React.FC = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState<TapMode | null>(null);
    const [saving, setSaving] = useState<TapMode | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [kind, setKind] = useState<'TAP' | 'LINK'>('TAP');
    const [req, setReq] = useState<TapRequest | null>(null);
    const [st, setSt] = useState<TapRequestStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [reqError, setReqError] = useState<string | null>(null);
    const [left, setLeft] = useState(0);
    const [copied, setCopied] = useState(false);
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const reqRef = useRef<TapRequest | null>(null);
    reqRef.current = req;

    useEffect(() => { tapService.getMode().then(setMode).catch((e) => setError(e?.message || 'Could not load this setting.')); }, []);

    useEffect(() => {
        if (!req) return;
        let stop = false;
        const t = window.setInterval(async () => {
            try { const s = await tapService.status(req.id); if (!stop) { setSt(s); if (['PAID', 'EXPIRED', 'CANCELLED'].includes(s.status)) window.clearInterval(t); } } catch { /* keep trying */ }
        }, 2500);
        return () => { stop = true; window.clearInterval(t); };
    }, [req]);
    useEffect(() => {
        if (!req) return;
        const tick = () => setLeft(Math.max(0, Math.round((Date.parse(req.expiresAt) - Date.now()) / 1000)));
        tick(); const t = window.setInterval(tick, 1000);
        return () => window.clearInterval(t);
    }, [req]);
    useEffect(() => () => { const r = reqRef.current; if (r && r.kind === 'TAP') void tapService.cancel(r.id).catch(() => undefined); }, []);

    const choose = async (m: TapMode) => {
        if (m === mode || saving) return;
        setSaving(m); setError(null);
        try { setMode(await tapService.setMode(m)); } catch (e: any) { setError(e?.message || 'Could not save that. Please try again.'); } finally { setSaving(null); }
    };
    const make = async () => {
        setBusy(true); setReqError(null);
        try { const v = Number(amount); setSt(null); setReq(await tapService.createRequest({ amount: v > 0 ? v : undefined, note: note.trim() || undefined, kind })); }
        catch (e: any) { setReqError(e?.message || 'Could not make the request.'); } finally { setBusy(false); }
    };
    const done = st?.status === 'PAID';
    const ended = st?.status === 'EXPIRED' || st?.status === 'CANCELLED' || (!!req && left === 0 && !done);
    const mins = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const copy = async () => { if (!req) return; try { await navigator.clipboard.writeText(req.url); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* clipboard unavailable */ } };
    const share = async () => { if (req && (navigator as any).share) { try { await (navigator as any).share({ title: 'Pay me on MoneyWise', url: req.url }); } catch { /* cancelled */ } } else await copy(); };
    const open = () => { const c = parseTapCode(code); if (!c) { setCodeError('That isn’t a MoneyWise request code or link.'); return; } navigate(`/r/${c}`); };

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <h3 className="text-lg font-bold text-[#1F1F1F]">Tap to pay</h3>
                <p className="text-sm text-gray-500">Send and receive money with other MoneyWise users by code or link. On the phone app you can also tap phones together.</p>
            </div>

            <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
                <h4 className="text-sm font-bold text-gray-900">Who can pay you</h4>
                {mode === null && !error ? <Loader2 className="animate-spin text-[#0B57D0]" size={18} /> : null}
                {error && <p className="rounded-xl bg-[#FCE8E6] px-4 py-3 text-sm text-[#B31412]">{error}</p>}
                {mode !== null && OPTIONS.map((o) => (
                    <button key={o.mode} type="button" onClick={() => choose(o.mode)} className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] p-3.5 text-left transition ${mode === o.mode ? 'border-[#0B57D0] bg-[#F5F9FF]' : 'border-gray-200 hover:border-[#9DB8F0]'}`}>
                        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${mode === o.mode ? 'bg-[#0B57D0] text-white' : 'bg-[#EAF1FF] text-[#0B57D0]'}`}><o.icon size={18} /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#1F1F1F]">{o.title}</span><span className="block text-xs leading-5 text-[#5F6368]">{o.text}</span></span>
                        {saving === o.mode ? <Loader2 size={18} className="animate-spin text-[#0B57D0]" /> : mode === o.mode ? <Check size={18} className="text-[#0B57D0]" /> : null}
                    </button>
                ))}
                <p className="text-[11px] leading-4 text-gray-500">This only covers requests made here. It never changes who can pay your business pay links or quick-pay page. Turning it off cancels any request that is still open.</p>
            </section>

            {mode && mode !== 'OFF' && (
                <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
                    <h4 className="text-sm font-bold text-gray-900">Receive money</h4>
                    {done ? (
                        <div className="space-y-2 py-4 text-center">
                            <CheckCircle2 className="mx-auto text-[#137333]" size={52} />
                            <p className="text-xl font-bold text-[#1F1F1F]">{st?.paidAmount != null ? formatKwacha(st.paidAmount) : 'Paid'} received</p>
                            <p className="text-sm text-[#5F6368]">{st?.payer ? `from ${st.payer}` : 'The payment came through.'}</p>
                            <button type="button" onClick={() => { setReq(null); setSt(null); }} className="text-sm font-bold text-[#0B57D0]">Make another request</button>
                        </div>
                    ) : req ? (
                        <div className="flex flex-col items-center gap-3 py-2 text-center">
                            <p className="font-bold text-[#1F1F1F]">{req.amount ? `Asking for ${formatKwacha(req.amount)}` : 'Any amount'}</p>
                            {req.note && <p className="text-sm text-[#5F6368]">{req.note}</p>}
                            <div className={`rounded-2xl border border-gray-200 bg-white p-4 ${ended ? 'opacity-25' : ''}`}><QRCodeSVG value={req.url} size={200} fgColor="#0B1B3A" /></div>
                            <p className="text-sm text-[#5F6368]">{ended ? 'This request has ended.' : st?.claimed ? 'Someone is paying you now…' : `${req.kind === 'LINK' ? 'Valid for 24 hours' : `Expires in ${mins}`}. Ask them to scan this with MoneyWise.`}</p>
                            {!ended && (
                                <div className="flex gap-2">
                                    <button type="button" onClick={share} className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF1FF] px-4 py-2 text-xs font-bold text-[#0B57D0]"><Share2 size={14} /> Share</button>
                                    <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF1FF] px-4 py-2 text-xs font-bold text-[#0B57D0]">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy link'}</button>
                                </div>
                            )}
                            <button type="button" onClick={async () => { try { await tapService.cancel(req.id); } catch { /* already over */ } setReq(null); setSt(null); }} className="text-sm font-bold text-[#0B57D0]">{ended ? 'Make a new request' : 'Cancel request'}</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="Any amount (they type it)" />
                            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="What for? (optional)" />
                            <div className="flex flex-wrap gap-2">
                                {(['TAP', 'LINK'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-4 py-2 text-xs font-semibold ${kind === k ? 'border-[#0B57D0] bg-[#0B57D0] text-white' : 'border-gray-200 text-[#1F1F1F]'}`}>{k === 'TAP' ? 'In person (2 min)' : 'Send a link (24 h)'}</button>)}
                            </div>
                            {reqError && <p className="rounded-xl bg-[#FCE8E6] px-3 py-2.5 text-xs text-[#B31412]">{reqError}</p>}
                            <button type="button" onClick={make} disabled={busy} className="flex h-11 w-full items-center justify-center rounded-full bg-[#0B57D0] text-sm font-bold text-white disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : 'Make request'}</button>
                        </div>
                    )}
                </section>
            )}

            <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
                <h4 className="text-sm font-bold text-gray-900">Pay a request</h4>
                <input className={input} value={code} onChange={(e) => { setCode(e.target.value); setCodeError(null); }} placeholder="Paste a link or type the 10-letter code" />
                {codeError && <p className="text-xs text-[#B31412]">{codeError}</p>}
                <button type="button" onClick={open} disabled={!code.trim()} className="h-11 w-full rounded-full bg-[#EAF1FF] text-sm font-bold text-[#0B57D0] disabled:opacity-50">Open request</button>
            </section>
        </div>
    );
};
