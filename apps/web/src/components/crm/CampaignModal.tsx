import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { crmService, CampaignAudience, EmailDesign, LoyaltyOverview, LoyaltySegment, SendCampaignResult } from '../../services/crm.service';
import { SEGMENT_STYLE, SegmentBadge } from './loyaltyUi';
import { X, Loader2, Send, Mail, CheckCircle2, AlertTriangle, Sparkles, Code2, Upload, Trash2, Save } from 'lucide-react';

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

const MAX_HTML_CHARS = 1_500_000;

/** Fills the personalisation tokens with sample values (HTML-escaped) for the in-app preview. */
const sampleHtml = (html: string, business: string) => {
    const e = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return html
        .replace(/\{\{\s*first_name\s*\}\}/gi, 'Alex')
        .replace(/\{\{\s*name\s*\}\}/gi, 'Alex Sample')
        .replace(/\{\{\s*business\s*\}\}/gi, e(business));
};

/** Renders an HTML design in a fully sandboxed frame (no scripts, no same-origin access). */
const HtmlFrame: React.FC<{ html: string; className?: string; title: string }> = ({ html, className, title }) => (
    <iframe title={title} sandbox="" srcDoc={html} className={`w-full bg-white border-0 ${className || ''}`} />
);

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
    // Custom HTML design (an ad designed elsewhere). When set, it replaces the written body.
    const [customHtml, setCustomHtml] = useState<{ name: string; html: string; designId?: string } | null>(null);
    const [htmlOpen, setHtmlOpen] = useState(false);
    const [htmlDraft, setHtmlDraft] = useState('');
    const [htmlName, setHtmlName] = useState('');
    const [htmlDesignId, setHtmlDesignId] = useState<string | undefined>();
    const [htmlBusy, setHtmlBusy] = useState(false);
    const [htmlError, setHtmlError] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const { data: designs, isFetching: designsLoading } = useQuery({
        queryKey: ['crm-email-designs'],
        queryFn: () => crmService.listEmailDesigns(),
        enabled: htmlOpen,
        staleTime: 30_000,
    });

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
    const hasContent = customHtml ? !!customHtml.html.trim() : !!body.trim();
    const canSend = !!subject.trim() && hasContent && recipients > 0 && !preview?.over_limit;

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

    const openHtml = () => {
        setHtmlError('');
        setHtmlDraft(customHtml?.html || '');
        setHtmlName(customHtml?.name || '');
        setHtmlDesignId(customHtml?.designId);
        setHtmlOpen(true);
    };

    const onHtmlFile = async (file?: File | null) => {
        if (!file) return;
        setHtmlError('');
        if (!/\.(html?|txt)$/i.test(file.name) && !/html|text/.test(file.type)) {
            setHtmlError('Choose an .html file.');
            return;
        }
        if (file.size > MAX_HTML_CHARS) {
            setHtmlError('That file is too large (max ~1.5 MB). Host the images online instead of embedding them.');
            return;
        }
        const text = await file.text();
        setHtmlDraft(text);
        setHtmlDesignId(undefined);
        if (!htmlName.trim()) setHtmlName(file.name.replace(/\.(html?|txt)$/i, ''));
        if (fileRef.current) fileRef.current.value = '';
    };

    const pickDesign = (d: EmailDesign) => {
        setHtmlError('');
        setHtmlDraft(d.html);
        setHtmlName(d.name);
        setHtmlDesignId(d.id);
    };

    const removeDesign = async (d: EmailDesign) => {
        if (!window.confirm(`Delete the saved design "${d.name}"?`)) return;
        try {
            await crmService.deleteEmailDesign(d.id);
            if (htmlDesignId === d.id) setHtmlDesignId(undefined);
            queryClient.invalidateQueries({ queryKey: ['crm-email-designs'] });
        } catch (err: any) {
            setHtmlError(err?.message || 'Could not delete the design');
        }
    };

    const applyHtml = async (save: boolean) => {
        const html = htmlDraft.trim();
        if (!html) { setHtmlError('Upload an HTML file or paste the code first.'); return; }
        if (html.length > MAX_HTML_CHARS) { setHtmlError('The HTML is too large (max ~1.5 MB). Host the images online instead of embedding them.'); return; }
        const name = htmlName.trim() || 'Custom design';
        let designId = htmlDesignId;
        if (save) {
            setHtmlBusy(true);
            setHtmlError('');
            try {
                const saved = await crmService.saveEmailDesign({ id: htmlDesignId, name, html });
                designId = saved.id;
                queryClient.invalidateQueries({ queryKey: ['crm-email-designs'] });
            } catch (err: any) {
                setHtmlError(err?.message || 'Could not save the design');
                setHtmlBusy(false);
                return;
            } finally {
                setHtmlBusy(false);
            }
        }
        setCustomHtml({ name, html, designId });
        setHtmlOpen(false);
        setNotice(save ? `Design "${name}" saved — this email will use it.` : `This email will use the "${name}" design.`);
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
                html: customHtml?.html || undefined,
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
                    <div className="h-8 p-1 bg-slate-100 md:bg-[#F8FAFD] rounded-[10px] flex items-center gap-1 self-start w-fit">
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
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { setAiError(''); setAiOpen(true); }}
                                            disabled={!!customHtml}
                                            title={customHtml ? 'Remove the HTML design to write with AI' : undefined}
                                            className="h-7 px-3 rounded-lg bg-violet-50 text-violet-700 border border-violet-100 text-[11px] font-bold flex items-center gap-1.5 hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:hover:bg-violet-50"
                                        >
                                            <Sparkles size={12} /> Draft with AI
                                        </button>
                                        <button
                                            type="button"
                                            onClick={openHtml}
                                            className="h-7 px-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1.5 hover:bg-slate-100 transition-colors"
                                        >
                                            <Code2 size={12} /> Use HTML
                                        </button>
                                    </div>
                                </div>
                            <input className={INPUT} placeholder="Subject, e.g. A little thank-you from {{business}}" value={subject} maxLength={150} onChange={e => setSubject(e.target.value)} />
                            {customHtml ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0"><Code2 size={14} /></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-gray-900 truncate">Custom HTML design: {customHtml.name}</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">The email is sent exactly as designed. {'{{first_name}}'}, {'{{name}}'} and {'{{business}}'} in the HTML are filled in for each customer; the "why you're receiving this" line is added at the bottom.</p>
                                        <div className="flex items-center gap-3 mt-2">
                                            <button type="button" onClick={openHtml} className="text-[11px] font-semibold text-blue-600 hover:underline">Change design</button>
                                            <button type="button" onClick={() => { setCustomHtml(null); setNotice(''); }} className="text-[11px] font-semibold text-red-600 hover:underline">Remove and write instead</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                            <>
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
                            </>
                            )}
                        </section>
                            </div>
                    {/* Right: live preview */}
                    <div className="flex flex-col gap-2">
                        <label className={LABEL}>Preview</label>
                        {customHtml ? (
                        <div className="flex-1 rounded-xl bg-[#EAECEF] p-4 flex flex-col gap-2 min-h-[420px]">
                            <p className="text-[10px] text-gray-500">Subject: <span className="text-gray-800 font-semibold">{sample(subject) || '—'}</span></p>
                            <HtmlFrame title="Email preview" html={sampleHtml(customHtml.html, businessName)} className="flex-1 min-h-[380px] rounded-lg border border-gray-200" />
                            <p className="text-[10px] text-gray-400 text-center">You're receiving this because you're a customer of {businessName}… (added when sent)</p>
                        </div>
                        ) : (
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
                        )}
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
                        <button type="button" onClick={() => run('test')} disabled={!subject.trim() || !hasContent || busy !== null}
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
            {htmlOpen && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center"><Code2 size={15} /></div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">Use your own HTML design</h3>
                                    <p className="text-[11px] text-gray-500">Upload the HTML for an ad or newsletter designed elsewhere, or reuse a saved one.</p>
                                </div>
                            </div>
                            <button onClick={() => setHtmlOpen(false)} disabled={htmlBusy} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X size={16} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-4 min-w-0">
                                <div>
                                    <label className={LABEL}>Saved designs</label>
                                    {designsLoading && !designs ? (
                                        <div className="text-xs text-gray-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading…</div>
                                    ) : !designs?.length ? (
                                        <p className="text-xs text-gray-400">No saved designs yet — designs you save appear here for future emails.</p>
                                    ) : (
                                        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                                            {designs.map(d => (
                                                <div key={d.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${htmlDesignId === d.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                                    <button type="button" onClick={() => pickDesign(d)} className="flex-1 min-w-0 text-left">
                                                        <span className="block text-xs font-semibold text-gray-900 truncate">{d.name}</span>
                                                        <span className="block text-[10px] text-gray-400">Updated {new Date(d.updated_at).toLocaleDateString()}</span>
                                                    </button>
                                                    <button type="button" onClick={() => removeDesign(d)} title="Delete design" className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className={LABEL}>Design name</label>
                                    <input className={INPUT} placeholder="e.g. December promo" value={htmlName} maxLength={120} onChange={e => setHtmlName(e.target.value)} />
                                </div>
                                <div className="flex flex-col flex-1">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className={`${LABEL} !mb-0`}>HTML code</label>
                                        <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={e => onHtmlFile(e.target.files?.[0])} />
                                        <button type="button" onClick={() => fileRef.current?.click()} className="h-7 px-3 rounded-lg border border-gray-200 text-[11px] font-bold text-gray-700 flex items-center gap-1.5 hover:bg-gray-50">
                                            <Upload size={12} /> Upload .html file
                                        </button>
                                    </div>
                                    <textarea
                                        rows={14}
                                        spellCheck={false}
                                        className={`${INPUT} resize-y font-mono text-[11px] leading-relaxed flex-1`}
                                        value={htmlDraft}
                                        onChange={e => { setHtmlDraft(e.target.value); }}
                                        placeholder={'<!DOCTYPE html>\n<html>\n  <body>…your design…</body>\n</html>'}
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1.5">
                                        Use {'{{first_name}}'}, {'{{name}}'} or {'{{business}}'} anywhere in the HTML to personalise it. Link images from the web (https://…) — most email apps block embedded or local images. Scripts are removed.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 min-h-[420px]">
                                <label className={LABEL}>Preview</label>
                                <div className="flex-1 rounded-xl bg-[#EAECEF] p-3 flex">
                                    {htmlDraft.trim() ? (
                                        <HtmlFrame title="Design preview" html={sampleHtml(htmlDraft, businessName)} className="flex-1 min-h-[400px] rounded-lg border border-gray-200" />
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Upload or paste HTML to see it here.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
                            <div className="text-xs min-h-[16px]">{htmlError && <span className="text-red-600 font-medium">{htmlError}</span>}</div>
                            <div className="flex items-center gap-3">
                                <button type="button" onClick={() => setHtmlOpen(false)} disabled={htmlBusy} className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                                <button type="button" onClick={() => applyHtml(false)} disabled={htmlBusy || !htmlDraft.trim()} className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Use without saving</button>
                                <button type="button" onClick={() => applyHtml(true)} disabled={htmlBusy || !htmlDraft.trim()}
                                    className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                                    {htmlBusy ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> {htmlDesignId ? 'Save changes & use' : 'Save & use'}</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
