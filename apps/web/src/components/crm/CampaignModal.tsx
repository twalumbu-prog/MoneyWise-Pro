import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { crmService, CampaignAudience, LoyaltyOverview, LoyaltySegment, SendCampaignResult } from '../../services/crm.service';
import { SEGMENT_STYLE, SegmentBadge } from './loyaltyUi';
import { X, Loader2, Send, Mail, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';

interface Props {
    overview?: LoyaltyOverview;
    organizationName?: string | null;
    initialAudience?: Partial<CampaignAudience>;
    onClose: () => void;
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5';
const TOKENS = [
    { token: '{{first_name}}', label: 'First name' },
    { token: '{{name}}', label: 'Full name' },
    { token: '{{business}}', label: 'Business name' },
];

type Tab = 'compose' | 'audience' | 'list';

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

export const CampaignModal: React.FC<Props> = ({ overview, organizationName, initialAudience, onClose }) => {
    const [audience, setAudience] = useState<CampaignAudience>({
        payment: initialAudience?.payment || 'ALL',
        segments: initialAudience?.segments || [],
        product_keys: initialAudience?.product_keys || [],
    });
    const [tab, setTab] = useState<Tab>('compose');
    const [aiOpen, setAiOpen] = useState(false);
    const [aiInstructions, setAiInstructions] = useState('');
    const [aiRevise, setAiRevise] = useState(true);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('Hi {{first_name}},\n\n');
    const [ctaLabel, setCtaLabel] = useState('');
    const [ctaUrl, setCtaUrl] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState<'test' | 'send' | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [result, setResult] = useState<SendCampaignResult | null>(null);

    // Re-count the audience (debounced) whenever the targeting changes.
    const audienceKey = JSON.stringify(audience);
    const [debouncedKey, setDebouncedKey] = useState(audienceKey);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedKey(audienceKey), 250);
        return () => clearTimeout(t);
    }, [audienceKey]);
    const { data: preview, isFetching: previewing } = useQuery({
        queryKey: ['crm-campaign-preview', debouncedKey],
        queryFn: () => crmService.previewCampaign(JSON.parse(debouncedKey)),
        staleTime: 15_000,
    });

    const products = useMemo(() => overview?.products.slice(0, 16) || [], [overview]);
    const recipients = preview?.recipients ?? 0;
    const businessName = organizationName || 'Your business';
    const canSend = !!subject.trim() && !!body.trim() && recipients > 0 && !preview?.over_limit;

    const sample = (text: string) =>
        text.replace(/\{\{\s*first_name\s*\}\}/gi, 'Alex').replace(/\{\{\s*name\s*\}\}/gi, 'Alex Sample').replace(/\{\{\s*business\s*\}\}/gi, businessName);

    const audienceDescription = () => {
        const parts: string[] = [];
        if (audience.payment === 'OWING') parts.push('customers who currently owe the business money');
        if (audience.payment === 'CLEAR') parts.push('customers with nothing owing');
        const segs = (overview?.segments || []).filter(s => audience.segments.includes(s.value)).map(s => `${s.label} (${s.hint})`);
        if (segs.length) parts.push(`loyalty groups: ${segs.join('; ')}`);
        const prods = (overview?.products || []).filter(p => audience.product_keys.includes(p.key)).map(p => p.name);
        if (prods.length) parts.push(`people who bought: ${prods.join(', ')}`);
        return parts.length ? parts.join(' — ') : 'all customers';
    };

    // A real draft exists once the user has typed beyond the starter greeting.
    const hasDraft = !!subject.trim() || body.trim().replace(/^Hi \{\{first_name\}\},?/, '').trim().length > 0;

    const runAi = async () => {
        setAiBusy(true);
        setAiError('');
        try {
            const out = await crmService.draftCampaignEmail({
                instructions: aiInstructions.trim(),
                audience_description: audienceDescription(),
                ...(hasDraft && aiRevise ? { current_subject: subject.trim(), current_body: body.trim() } : {}),
            });
            setSubject(out.subject);
            setBody(out.body);
            setAiOpen(false);
            setNotice('AI draft added — read it through and edit anything before sending.');
        } catch (err: any) {
            setAiError(err?.message || 'The AI could not draft the email');
        } finally {
            setAiBusy(false);
        }
    };

    const insertToken = (token: string) => setBody(b => `${b}${b && !b.endsWith(' ') && !b.endsWith('\n') ? ' ' : ''}${token}`);

    const run = async (kind: 'test' | 'send') => {
        setBusy(kind);
        setError('');
        setNotice('');
        try {
            const res = await crmService.sendCampaign({
                audience,
                subject: subject.trim(),
                body: body.trim(),
                cta_label: ctaLabel.trim() || undefined,
                cta_url: ctaUrl.trim() || undefined,
                test_only: kind === 'test',
            });
            if (kind === 'test') setNotice(`Test email sent to ${res.to}.`);
            else setResult(res);
        } catch (err: any) {
            setError(err?.message || 'Something went wrong while sending');
        } finally {
            setBusy(null);
            setConfirming(false);
        }
    };

    const chip = (active: boolean) =>
        `px-2.5 h-7 rounded-full border text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
            active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
        }`;

    if (result) {
        return (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 flex flex-col items-center text-center gap-3">
                    <CheckCircle2 size={36} className="text-emerald-500" />
                    <h2 className="text-base font-bold text-gray-900">Campaign sent</h2>
                    <p className="text-sm text-gray-600">
                        <strong>{result.sent}</strong> email{result.sent === 1 ? '' : 's'} delivered to the mail provider
                        {result.failed ? <>, <strong className="text-red-600">{result.failed}</strong> failed</> : null}.
                    </p>
                    {!!result.without_email && <p className="text-xs text-gray-400">{result.without_email} matching customer{result.without_email === 1 ? ' has' : 's have'} no email on file.</p>}
                    <button onClick={onClose} className="mt-2 h-9 px-6 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">Done</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center"><Mail size={16} /></div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Email customers</h2>
                            <p className="text-xs text-gray-500 mt-0.5">Write one message and send it to a group of customers.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X size={16} /></button>
                </div>

                {/* Section tabs */}
                <div className="px-6 pt-3 flex-shrink-0">
                    <div className="h-8 p-1 bg-slate-100 rounded-[10px] flex items-center gap-1 self-start w-fit">
                        {([['compose', 'Draft email'], ['audience', 'Audience'], ['list', `Mailing list${preview ? ` (${recipients})` : ''}`]] as [Tab, string][]).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={`px-4 h-full rounded-lg text-[11px] font-['DM_Sans'] transition-all ${
                                    tab === id ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900' : 'font-normal text-gray-900 hover:bg-white/50'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {tab === 'compose' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-5">
                        <section className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                    <label className={`${LABEL} !mb-0`}>Write your email</label>
                                    <button
                                        type="button"
                                        onClick={() => { setAiError(''); setAiOpen(true); }}
                                        className="h-7 px-3 rounded-lg bg-violet-50 text-violet-700 border border-violet-100 text-[11px] font-bold flex items-center gap-1.5 hover:bg-violet-100 transition-colors"
                                    >
                                        <Sparkles size={12} /> Draft with AI
                                    </button>
                                </div>
                            <input className={INPUT} placeholder="Subject, e.g. A little thank-you from {{business}}" value={subject} maxLength={150} onChange={e => setSubject(e.target.value)} />
                            <textarea rows={8} className={`${INPUT} resize-y`} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message…" />
                            <div className="flex items-center gap-2 flex-wrap -mt-1">
                                <span className="text-[10px] text-gray-400">Insert:</span>
                                {TOKENS.map(t => (
                                    <button key={t.token} type="button" onClick={() => insertToken(t.token)} className="px-2 h-6 rounded-md bg-gray-100 text-[10px] font-semibold text-gray-600 hover:bg-gray-200">{t.label}</button>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={LABEL}>Button text <span className="normal-case text-gray-300">(optional)</span></label>
                                    <input className={INPUT} placeholder="Shop now" value={ctaLabel} maxLength={60} onChange={e => setCtaLabel(e.target.value)} />
                                </div>
                                <div>
                                    <label className={LABEL}>Button link</label>
                                    <input className={INPUT} placeholder="https://…" value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
                                </div>
                            </div>
                        </section>
                            </div>
                    {/* Right: live preview */}
                    <div className="flex flex-col gap-2">
                        <label className={LABEL}>Preview</label>
                        <div className="flex-1 rounded-xl bg-[#EAECEF] p-4 overflow-y-auto">
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-md mx-auto">
                                <div className="text-center pt-6 pb-2 px-6"><div className="text-lg font-extrabold tracking-tight text-gray-900">{businessName}</div></div>
                                <div className="px-6 pb-1">
                                    <p className="text-[10px] text-gray-400 mb-3">Subject: <span className="text-gray-700 font-semibold">{sample(subject) || '—'}</span></p>
                                    {sample(body).split(/\n{2,}/).map((para, i) => (
                                        <p key={i} className="text-[13px] leading-relaxed text-gray-900 mb-3 whitespace-pre-line">{para}</p>
                                    ))}
                                </div>
                                {ctaUrl.trim() && (
                                    <div className="text-center pb-4"><span className="inline-block bg-blue-600 text-white text-[13px] font-bold px-7 py-2.5 rounded-xl">{ctaLabel.trim() || 'Learn more'}</span></div>
                                )}
                                <div className="border-t border-gray-100 px-6 py-4 text-center text-[10px] text-gray-400">
                                    You're receiving this because you're a customer of {businessName}. Reply to this email to be removed.
                                </div>
                            </div>
                        </div>
                    </div>
                        </div>
                    )}

                    {tab === 'audience' && (
                        <div className="max-w-2xl flex flex-col gap-5">
                        <section>
                            <label className={LABEL}>Who should receive it?</label>
                            <p className="text-[11px] text-gray-400 mb-1.5">Payment status</p>
                            <div className="flex gap-2 flex-wrap mb-3">
                                {([['ALL', 'Everyone'], ['CLEAR', 'Clear (nothing owed)'], ['OWING', 'Owing']] as const).map(([v, l]) => (
                                    <button key={v} type="button" className={chip(audience.payment === v)} onClick={() => setAudience(a => ({ ...a, payment: v }))}>{l}</button>
                                ))}
                            </div>
                            <p className="text-[11px] text-gray-400 mb-1.5">Loyalty group <span className="text-gray-300">(none selected = all groups)</span></p>
                            <div className="flex gap-2 flex-wrap mb-3">
                                {(overview?.segments || []).map(s => (
                                    <button key={s.value} type="button" title={s.hint} className={chip(audience.segments.includes(s.value))}
                                        onClick={() => setAudience(a => ({ ...a, segments: toggle<LoyaltySegment>(a.segments, s.value) }))}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${audience.segments.includes(s.value) ? 'bg-white' : SEGMENT_STYLE[s.value].dot}`} />
                                        {s.label} <span className="opacity-70">{s.count}</span>
                                    </button>
                                ))}
                            </div>
                            {products.length > 0 && (
                                <>
                                    <p className="text-[11px] text-gray-400 mb-1.5">Bought a product <span className="text-gray-300">(optional)</span></p>
                                    <div className="flex gap-2 flex-wrap">
                                        {products.map(p => (
                                            <button key={p.key} type="button" className={chip(audience.product_keys.includes(p.key))}
                                                onClick={() => setAudience(a => ({ ...a, product_keys: toggle(a.product_keys, p.key) }))}>
                                                {p.name} <span className="opacity-70">{p.buyers}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            <div className={`mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${preview?.over_limit ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`}>
                                {previewing && !preview ? <Loader2 size={13} className="animate-spin mt-0.5" /> : preview?.over_limit ? <AlertTriangle size={13} className="mt-0.5" /> : <Mail size={13} className="mt-0.5" />}
                                <div>
                                    <strong>{recipients} customer{recipients === 1 ? '' : 's'}</strong> will receive this
                                    {preview && preview.without_email > 0 && <span className="opacity-80"> · {preview.without_email} more match but have no email</span>}
                                    {preview?.over_limit && <div>That is over the {preview.max_recipients}-per-send limit — narrow the groups.</div>}
                                    {!!preview?.sample.length && <div className="opacity-70 mt-0.5">e.g. {preview.sample.map(s => s.name).join(', ')}</div>}
                                </div>
                            </div>
                        </section>

                        </div>
                    )}

                    {tab === 'list' && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500">
                                    {previewing && !preview ? 'Loading…' : <><strong className="text-gray-900">{recipients}</strong> customer{recipients === 1 ? '' : 's'} will receive this email.</>}
                                    {!!preview?.without_email && <span className="text-gray-400"> {preview.without_email} more match but have no email.</span>}
                                </p>
                                <button type="button" onClick={() => setTab('audience')} className="text-xs font-semibold text-blue-600 hover:underline">Change audience</button>
                            </div>
                            {preview?.over_limit && (
                                <div className="rounded-lg px-3 py-2 text-xs bg-red-50 text-red-700 flex items-center gap-2"><AlertTriangle size={13} /> Over the {preview.max_recipients}-per-send limit — narrow the audience.</div>
                            )}
                            {!preview?.list.length ? (
                                <div className="flex items-center justify-center h-32 text-sm text-gray-400">No customers with an email address match this audience.</div>
                            ) : (
                                <div className="rounded-xl border border-gray-100 overflow-hidden">
                                    <div className="grid grid-cols-[1.2fr_1.6fr_auto_auto] gap-3 px-4 py-2 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                        <span>Customer</span><span>Email</span><span>Group</span><span className="text-right">Purchases</span>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        {preview.list.map(r => (
                                            <div key={r.customer_id} className="grid grid-cols-[1.2fr_1.6fr_auto_auto] gap-3 px-4 py-2.5 items-center">
                                                <span className="text-xs font-semibold text-gray-900 truncate">{r.name}</span>
                                                <span className="text-xs text-gray-500 truncate">{r.email}</span>
                                                <SegmentBadge segment={r.segment} />
                                                <span className="text-xs font-bold text-gray-800 text-right">{r.order_count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <div className="text-xs min-h-[16px]">
                        {error && <span className="text-red-600 font-medium">{error}</span>}
                        {notice && !error && <span className="text-emerald-600 font-medium">{notice}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => run('test')} disabled={!subject.trim() || !body.trim() || busy !== null}
                            className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">
                            {busy === 'test' ? <Loader2 size={12} className="animate-spin" /> : null} Send test to me
                        </button>
                        {confirming ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-600">Send to {recipients} customer{recipients === 1 ? '' : 's'}?</span>
                                <button type="button" onClick={() => setConfirming(false)} className="h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">No</button>
                                <button type="button" onClick={() => run('send')} disabled={busy !== null}
                                    className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                                    {busy === 'send' ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : 'Yes, send'}
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setConfirming(true)} disabled={!canSend || busy !== null}
                                className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-sm">
                                <Send size={12} /> Send to {recipients} customer{recipients === 1 ? '' : 's'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {aiOpen && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center"><Sparkles size={15} /></div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">Draft with AI</h3>
                                    <p className="text-[11px] text-gray-500">Tell the AI what this email should do.</p>
                                </div>
                            </div>
                            <button onClick={() => setAiOpen(false)} disabled={aiBusy} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X size={16} /></button>
                        </div>
                        <div className="p-6 flex flex-col gap-3">
                            <textarea
                                autoFocus
                                rows={6}
                                className={`${INPUT} resize-none`}
                                value={aiInstructions}
                                onChange={e => setAiInstructions(e.target.value)}
                                placeholder="e.g. Thank them for shopping with us this year and tell them our new stock arrives on Friday. Friendly, short, and invite them to visit the shop."
                                maxLength={2000}
                            />
                            <p className="text-[10px] text-gray-400 -mt-1">Sending to: {audienceDescription()}. Include any real prices, dates or offers — the AI won't make them up.</p>
                            {hasDraft && (
                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                    <input type="checkbox" checked={aiRevise} onChange={e => setAiRevise(e.target.checked)} />
                                    Improve my current draft instead of starting fresh
                                </label>
                            )}
                            {aiError && <p className="text-xs text-red-600 font-medium">{aiError}</p>}
                            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                                <button type="button" onClick={() => setAiOpen(false)} disabled={aiBusy} className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                                <button
                                    type="button"
                                    onClick={runAi}
                                    disabled={aiBusy || aiInstructions.trim().length < 5}
                                    className="h-9 px-5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {aiBusy ? <><Loader2 size={12} className="animate-spin" /> Drafting…</> : <><Sparkles size={12} /> Draft email</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
