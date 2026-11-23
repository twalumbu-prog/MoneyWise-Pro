import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Facebook, Instagram, Loader2, Mail, MessageCircle, Paperclip, Plug, RefreshCw, Search, ShoppingBag, Wallet, X } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PrimaryButton } from '../components/ui/Dialog';
import { GmailMark } from '../components/settings/integrations/GmailIntegration';

type View = 'orders' | 'money' | 'other' | 'all';
interface Item { id: string; source: 'email' | 'message'; channel: string; who: string; title: string; preview: string; at: string; intent: string; intentLabel: string; kind: 'orders' | 'money' | 'other'; amount: number | null; currency: string | null; direction: string | null; hasAttachments: boolean; match: string | null; unread?: boolean }
interface Conn { id: string; channel: string; name: string; status: string; lastSyncedAt: string | null; lastError: string | null }
interface Inbox { view: View; counts: Record<View, number>; unread?: Record<View, number>; items: Item[]; connections: Conn[]; filteredOut: number }
interface Detail { from: string | null; to: string | null; subject: string | null; body: string; at: string; attachments: { name: string }[]; summary: string | null; intentLabel?: string }

const CHANNEL: Record<string, { label: string; icon: React.ReactNode; tint: string }> = {
    GMAIL: { label: 'Gmail', icon: <GmailMark size={17} />, tint: 'bg-white shadow-[inset_0_0_0_1px_#E3E5E8]' },
    FACEBOOK: { label: 'Facebook', icon: <Facebook size={14} />, tint: 'bg-[#E8F0FE] text-[#1A73E8]' },
    INSTAGRAM: { label: 'Instagram', icon: <Instagram size={14} />, tint: 'bg-[#FCE4EC] text-[#C2185B]' },
    WHATSAPP: { label: 'WhatsApp', icon: <MessageCircle size={14} />, tint: 'bg-[#E6F4EA] text-[#137333]' },
};
const KIND_ICON: Record<Item['kind'], React.ReactNode> = {
    orders: <ShoppingBag size={11} className="text-[#137333]" />,
    money: <Wallet size={11} className="text-[#0B57D0]" />,
    other: <Clock size={11} className="text-[#80868B]" />,
};

const ago = (iso: string | null): string => {
    if (!iso) return 'never';
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString('en-GB');
};

const TABS: { id: View; label: string }[] = [{ id: 'orders', label: 'Orders' }, { id: 'money', label: 'Payments & invoices' }, { id: 'other', label: 'Other' }, { id: 'all', label: 'Everything' }];
const ctl = 'p-2 rounded-lg border border-[rgba(116,119,117,0.22)] text-gray-400 hover:text-[#0842A0] hover:bg-[#F8FAFD] transition-all';

/** What is connected (Gmail, Facebook, Instagram) and how fresh it is, on the right of the inbox tab row; shares the inbox query, so it costs nothing extra. */
export const ChannelConnections: React.FC = () => {
    const navigate = useNavigate();
    const { data, isPending } = useQuery({ queryKey: ['channel-inbox', 'orders', ''], queryFn: () => apiJson<Inbox>('/integrations/inbox?view=orders'), refetchInterval: 30_000, staleTime: 10_000, retry: false });
    const on = new Set((data?.connections ?? []).map((c) => c.channel));
    const socialOff = !on.has('FACEBOOK') && !on.has('INSTAGRAM');
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {(data?.connections ?? []).map((c) => (
                <span key={c.id} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5]" title={c.lastError ?? undefined}>
                    <span className={(CHANNEL[c.channel]?.tint ?? '').split(' ').find((x) => x.startsWith('text-')) ?? 'text-[#5F6368]'}>{CHANNEL[c.channel]?.icon}</span> {c.name || CHANNEL[c.channel]?.label}
                    <span className={`font-normal ${c.status === 'ACTIVE' ? 'text-[#5F6368]' : 'text-[#C5221F]'}`}>· {c.status === 'ACTIVE' ? `synced ${ago(c.lastSyncedAt)}` : c.status.toLowerCase()}</span>
                </span>
            ))}
            {!isPending && socialOff && (
                <button type="button" onClick={() => navigate('/settings?tab=integrations')} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><Plug size={13} /> Connect Facebook or Instagram to get customer orders</button>
            )}
        </div>
    );
};

/**
 * The inbox for the channels a business connects (Gmail, Facebook Pages, Instagram), in the same card, tabs and rows as the requisitions inbox:
 * customer messages and emails with what the AI read from each, so a sales order, a "I have paid" or an invoice is found without opening every
 * email. Orders come first because that is what it is for. Opening it clears the new-orders badge on its tab. Shown inside the inbox card as the
 * Orders & messages tab, beside Outflows and Inflows.
 */
export const ChannelInboxBody: React.FC = () => {
    const qc = useQueryClient();
    const [view, setView] = useState<View>('orders');
    const [q, setQ] = useState('');
    const [openItem, setOpenItem] = useState<Item | null>(null);
    const { data, isPending, isError, refetch } = useQuery({
        queryKey: ['channel-inbox', view, q],
        queryFn: () => apiJson<Inbox>(`/integrations/inbox?view=${view}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
        refetchInterval: 30_000, staleTime: 10_000, retry: false,
    });
    const detail = useQuery({ queryKey: ['channel-inbox', 'item', openItem?.source, openItem?.id], queryFn: () => apiJson<Detail>(`/integrations/inbox/${openItem!.source}/${openItem!.id}`), enabled: !!openItem, retry: false });

    // Looking at the inbox counts as seeing what is in it: the badge on the inbox button clears (the new dots stay for this visit).
    const marked = useRef(false);
    useEffect(() => {
        if (!data || marked.current) return;
        marked.current = true;
        apiJson('/integrations/inbox/seen', { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['channel-inbox', 'unread'] })).catch(() => { marked.current = false; });
    }, [data, qc]);

    const channelsOn = new Set((data?.connections ?? []).map((c) => c.channel));
    const socialOff = !channelsOn.has('FACEBOOK') && !channelsOn.has('INSTAGRAM');

    return (
        <>
            <div className="flex flex-col gap-3">
                {/* tabs + search / refresh, the same as the requisitions inbox */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div role="tablist" className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-[10px] bg-[#F8FAFD] p-1">
                        {TABS.map((t) => {
                            const active = view === t.id;
                            const n = data?.counts?.[t.id] ?? 0;
                            const fresh = data?.unread?.[t.id] ?? 0;
                            return (
                                <button key={t.id} role="tab" aria-selected={active} type="button" onClick={() => setView(t.id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[11px] transition-all ${active ? 'bg-white font-bold text-[#1F1F1F] shadow-sm' : 'font-normal text-gray-500 hover:text-gray-700'}`}>
                                    {t.label}
                                    {n > 0 && <span className={`rounded px-1 text-[9px] ${fresh > 0 && t.id === 'orders' ? 'bg-[#C3010A] text-white' : active ? 'bg-[#E9EEF6] text-[#0B57D0]' : 'bg-gray-200 text-gray-500'}`}>{n}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                            <input type="text" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search messages" className="w-48 rounded-lg border border-[rgba(116,119,117,0.22)] bg-[#F8FAFD] py-2 pl-8 pr-3 text-xs font-medium text-[#1F1F1F] transition-all placeholder:text-gray-300 focus:bg-white focus:ring-2 focus:ring-[#0B57D0]/10" />
                        </div>
                        <button type="button" onClick={() => refetch()} className={ctl} title="Refresh"><RefreshCw size={14} /></button>
                    </div>
                </div>

                {isPending ? <div className="space-y-px">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-[#F8FAFD]" />)}</div>
                    : isError ? <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">Couldn’t load your messages.</p><PrimaryButton onClick={() => refetch()} className="mt-3 h-10 px-5">Try again</PrimaryButton></div>
                    : data!.items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[rgba(116,119,117,0.22)] bg-gray-50 text-gray-300"><Mail size={32} /></div>
                            <h3 className="text-xl font-bold text-[#1F1F1F]">{q ? 'Nothing matches that' : view === 'orders' ? 'No customer orders yet' : 'Nothing here yet'}</h3>
                            <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-gray-400">
                                {q ? 'Try another word.' : view === 'orders'
                                    ? `When a customer messages your Facebook Page or Instagram wanting to buy, or an order arrives by email, it appears here with the amount and who sent it.${socialOff ? ' Connect Facebook or Instagram above to start receiving them.' : ''}`
                                    : 'New messages show up here by themselves.'}
                            </p>
                            {view === 'orders' && (data!.counts.money + data!.counts.other) > 0 && <button type="button" onClick={() => setView('money')} className="mt-4 h-9 rounded-lg px-4 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]">See payments and invoices ({data!.counts.money})</button>}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {data!.items.map((i) => {
                                const ch = CHANNEL[i.channel] ?? CHANNEL.GMAIL;
                                return (
                                    <div key={`${i.source}-${i.id}`} role="button" tabIndex={0} onClick={() => setOpenItem(i)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenItem(i); }} className="group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50/70">
                                        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${ch.tint}`} title={ch.label}>{ch.icon}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-4">
                                                <span className={`truncate text-sm text-gray-700 ${i.unread ? 'font-bold' : 'font-medium'}`}>{i.title}</span>
                                                {i.amount != null && <span className="whitespace-nowrap text-sm font-semibold text-[#1F1F1F]">{i.currency && i.currency !== 'ZMW' ? `${i.currency} ${i.amount.toLocaleString()}` : formatKwacha(i.amount)}</span>}
                                            </div>
                                            <div className="mt-px flex items-center justify-between">
                                                <span className="truncate text-[10px] font-normal text-[#5F6368]">{i.who} · {ch.label}</span>
                                                <span className="text-[10px] font-normal text-neutral-500">{ago(i.at)}</span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-1.5">
                                                {KIND_ICON[i.kind]}
                                                <span className="text-[10px] font-normal capitalize text-[#5F6368]">{i.intentLabel}{i.direction === 'IN' && i.kind === 'money' ? ' · in' : i.direction === 'OUT' && i.kind === 'money' ? ' · out' : ''}</span>
                                                {i.match === 'SUGGESTED' && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B06000]"><CheckCircle2 size={10} /> Matches a payment received</span>}
                                                {i.hasAttachments && <Paperclip size={11} className="text-[#80868B]" />}
                                            </div>
                                        </div>
                                        <div className="flex w-4 flex-shrink-0 items-center justify-center">{i.unread && <span className="h-1.5 w-1.5 rounded-full bg-[#0B57D0] shadow-sm shadow-blue-200" />}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                {!isPending && !isError && (data?.filteredOut ?? 0) > 0 && <p className="mt-1 text-center text-[11px] text-[#80868B]">{data!.filteredOut} promotional and automated emails were left out.</p>}
            </div>

            {openItem && (
                /* The message opens in the same chat window as a requisition: header, a tinted conversation area, and bubbles. */
                <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-10">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-md" onClick={() => setOpenItem(null)} />
                    <div className="relative flex h-full w-full flex-col bg-white shadow-2xl md:h-full md:max-h-[850px] md:max-w-4xl md:rounded-3xl" role="dialog" aria-label={detail.data?.subject || openItem.title}>
                        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6 py-4 md:items-start md:px-8 md:py-3">
                            <div className="flex min-w-0 items-center">
                                <button type="button" onClick={() => setOpenItem(null)} className="mr-4 rounded-full p-1 transition-colors hover:bg-gray-100 md:hidden" aria-label="Close"><X size={22} className="text-gray-900" /></button>
                                <div className="min-w-0">
                                    <h2 className="mb-0.5 truncate text-base font-normal leading-tight tracking-tight text-gray-900 md:mb-1 md:text-lg md:font-bold md:leading-none">{detail.data?.subject || openItem.title}</h2>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{(CHANNEL[openItem.channel] ?? CHANNEL.GMAIL).label}</span>
                                        <span className="hidden h-1 w-1 rounded-full bg-gray-300 md:inline" />
                                        <span className="hidden truncate text-[10px] font-medium text-gray-500 md:inline">From {detail.data?.from ?? openItem.who}</span>
                                    </div>
                                </div>
                            </div>
                            <button type="button" onClick={() => setOpenItem(null)} className="hidden rounded-full p-1.5 transition-colors hover:bg-gray-100 md:block" aria-label="Close"><X size={20} className="text-gray-400 hover:text-black" /></button>
                        </div>

                        <div className="relative flex-1 overflow-y-auto bg-[#E6F2FE] px-4 py-6 md:px-8">
                            {detail.isPending ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#0B57D0]" /></div>
                                : detail.isError ? <p className="text-center text-sm text-[#C5221F]">Couldn’t open this message.</p> : (
                                    <div className="mx-auto max-w-4xl space-y-4">
                                        {/* the message itself, from the sender */}
                                        <div className="group mb-4 flex w-full justify-start animate-in fade-in slide-in-from-bottom-2 duration-400">
                                            <div className="flex max-w-[85%] flex-col items-start md:max-w-[75%]">
                                                <div className="rounded-[16px] rounded-tl-none border border-gray-100 bg-white px-4 py-2.5 text-[13px] font-medium leading-relaxed text-gray-800 shadow-sm">
                                                    <p className="mb-1.5 text-[11px] font-bold text-gray-500">{detail.data?.from ?? openItem.who}{detail.data?.to ? <span className="font-medium"> to {detail.data.to}</span> : null}</p>
                                                    <p className="whitespace-pre-wrap break-words">{detail.data?.body}</p>
                                                    {!!detail.data?.attachments?.length && (
                                                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                            {detail.data.attachments.map((x) => x.name).filter(Boolean).map((n) => <span key={n} className="inline-flex items-center gap-1 rounded-lg bg-[#F8FAFD] px-2 py-1 text-[11px] font-semibold text-[#5F6368]"><Paperclip size={11} /> {n}</span>)}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="mx-2 mt-1.5 text-[9px] font-medium uppercase tracking-widest text-gray-900 opacity-60">{new Date(detail.data?.at ?? openItem.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>

                                        {/* what MoneyWise read from it */}
                                        {(detail.data?.summary || openItem.amount != null) && (
                                            <div className="group mb-4 flex w-full justify-start animate-in fade-in slide-in-from-bottom-2 duration-400">
                                                <div className="flex max-w-[85%] flex-col items-start md:max-w-[75%]">
                                                    <div className="overflow-hidden rounded-[16px] rounded-tl-none border border-gray-100 bg-white shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)]">
                                                        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
                                                            {KIND_ICON[openItem.kind]}
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">What MoneyWise read · {openItem.intentLabel}</span>
                                                        </div>
                                                        <div className="px-4 py-2.5 text-[13px] font-medium leading-relaxed text-gray-800">
                                                            {detail.data?.summary && <p>{detail.data.summary}</p>}
                                                            {openItem.amount != null && <p className="mt-1 font-semibold text-[#1F1F1F]">{openItem.currency && openItem.currency !== 'ZMW' ? `${openItem.currency} ${openItem.amount.toLocaleString()}` : formatKwacha(openItem.amount)}</p>}
                                                            {openItem.match === 'SUGGESTED' && <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#B06000]"><CheckCircle2 size={12} /> Matches a payment you received</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
