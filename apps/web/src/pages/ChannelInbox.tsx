import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Facebook, Instagram, Mail, MessageCircle, Paperclip, Plug, Search } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, PrimaryButton } from '../components/ui/Dialog';

type View = 'orders' | 'money' | 'other' | 'all';
interface Item { id: string; source: 'email' | 'message'; channel: string; who: string; title: string; preview: string; at: string; intent: string; intentLabel: string; kind: 'orders' | 'money' | 'other'; amount: number | null; currency: string | null; direction: string | null; hasAttachments: boolean; match: string | null }
interface Conn { id: string; channel: string; name: string; status: string; lastSyncedAt: string | null; lastError: string | null }
interface Inbox { view: View; counts: Record<View, number>; items: Item[]; connections: Conn[]; filteredOut: number }
interface Detail { from: string | null; to: string | null; subject: string | null; body: string; at: string; attachments: { name: string }[]; summary: string | null; intentLabel?: string }

const CHANNEL: Record<string, { label: string; icon: React.ReactNode; tint: string }> = {
    GMAIL: { label: 'Gmail', icon: <Mail size={15} />, tint: 'bg-[#FCE8E6] text-[#C5221F]' },
    FACEBOOK: { label: 'Facebook', icon: <Facebook size={15} />, tint: 'bg-[#E8F0FE] text-[#1A73E8]' },
    INSTAGRAM: { label: 'Instagram', icon: <Instagram size={15} />, tint: 'bg-[#FCE4EC] text-[#C2185B]' },
    WHATSAPP: { label: 'WhatsApp', icon: <MessageCircle size={15} />, tint: 'bg-[#E6F4EA] text-[#137333]' },
};
const INTENT_TINT: Record<Item['kind'], string> = { orders: 'bg-[#E6F4EA] text-[#137333]', money: 'bg-[#E8F0FE] text-[#0B57D0]', other: 'bg-[#F1F3F4] text-[#5F6368]' };

const ago = (iso: string | null): string => {
    if (!iso) return 'never';
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const TABS: { id: View; label: string }[] = [{ id: 'orders', label: 'Orders' }, { id: 'money', label: 'Payments & invoices' }, { id: 'other', label: 'Other' }, { id: 'all', label: 'Everything' }];

/**
 * The inbox for the channels a business connects (Gmail, Facebook Pages, Instagram): customer messages and emails, with what the AI read from each,
 * so a sales order, a "I have paid" or an invoice is found without opening every email. Orders come first because that is what it is for.
 */
export const ChannelInbox: React.FC = () => {
    const navigate = useNavigate();
    const [view, setView] = useState<View>('orders');
    const [q, setQ] = useState('');
    const [openItem, setOpenItem] = useState<Item | null>(null);
    const { data, isPending, isError, refetch } = useQuery({
        queryKey: ['channel-inbox', view, q],
        queryFn: () => apiJson<Inbox>(`/integrations/inbox?view=${view}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
        refetchInterval: 30_000, staleTime: 10_000, retry: false,
    });
    const detail = useQuery({ queryKey: ['channel-inbox', 'item', openItem?.source, openItem?.id], queryFn: () => apiJson<Detail>(`/integrations/inbox/${openItem!.source}/${openItem!.id}`), enabled: !!openItem, retry: false });

    const channelsOn = new Set((data?.connections ?? []).map((c) => c.channel));
    const socialOff = !channelsOn.has('FACEBOOK') && !channelsOn.has('INSTAGRAM');

    return (
        <PagePanel title="Orders & messages" subtitle="Customer messages and emails from the channels you connected, sorted by what they are" back="/requisitions">
            <div className="mx-auto max-w-4xl">
                {/* what is connected, and how fresh it is */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    {(data?.connections ?? []).map((c) => (
                        <span key={c.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${CHANNEL[c.channel]?.tint ?? 'bg-[#F1F3F4] text-[#5F6368]'}`} title={c.lastError ?? undefined}>
                            {CHANNEL[c.channel]?.icon} {c.name || CHANNEL[c.channel]?.label}
                            <span className="font-normal opacity-80">· {c.status === 'ACTIVE' ? `synced ${ago(c.lastSyncedAt)}` : c.status.toLowerCase()}</span>
                        </span>
                    ))}
                    {!isPending && socialOff && (
                        <button type="button" onClick={() => navigate('/settings?tab=integrations')} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><Plug size={13} /> Connect Facebook or Instagram to get customer orders</button>
                    )}
                    <button type="button" onClick={() => navigate('/settings?tab=integrations')} className="ml-auto text-xs font-semibold text-[#5F6368] hover:underline">Manage connections</button>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div role="tablist" className="flex flex-wrap gap-1.5">
                        {TABS.map((t) => (
                            <button key={t.id} role="tab" aria-selected={view === t.id} type="button" onClick={() => setView(t.id)} className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${view === t.id ? 'bg-[#D3E3FD] text-[#041E49]' : 'text-[#5F6368] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>
                                {t.label}<span className="rounded-full bg-white/80 px-1.5 text-[11px] tabular-nums">{data?.counts?.[t.id] ?? '·'}</span>
                            </button>
                        ))}
                    </div>
                    <div className="relative ml-auto w-full sm:w-64">
                        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#80868B]" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search messages" className="h-9 w-full rounded-full bg-[#F1F3F4] pl-9 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
                    </div>
                </div>

                {isPending ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-[#F1F3F4]" />)}</div>
                    : isError ? <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">Couldn’t load your messages.</p><PrimaryButton onClick={() => refetch()} className="mt-3 h-10 px-5">Try again</PrimaryButton></div>
                    : data!.items.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Mail size={24} /></span>
                            <p className="mt-3 text-base font-bold text-[#1F1F1F]">{q ? 'Nothing matches that' : view === 'orders' ? 'No customer orders yet' : 'Nothing here yet'}</p>
                            <p className="mt-1 max-w-md text-sm text-[#5F6368]">
                                {q ? 'Try another word.' : view === 'orders'
                                    ? `When a customer messages your Facebook Page or Instagram wanting to buy, or an order arrives by email, it appears here with the amount and who sent it.${socialOff ? ' Connect Facebook or Instagram above to start receiving them.' : ''}${(data!.counts.money + data!.counts.other) > 0 ? ' Your payments and other emails are in the other tabs.' : ''}`
                                    : 'New messages show up here by themselves.'}
                            </p>
                            {view === 'orders' && (data!.counts.money + data!.counts.other) > 0 && <button type="button" onClick={() => setView('money')} className="mt-4 h-10 rounded-full px-5 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]">See payments and invoices ({data!.counts.money})</button>}
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {data!.items.map((i) => {
                                const ch = CHANNEL[i.channel] ?? CHANNEL.GMAIL;
                                return (
                                    <li key={`${i.source}-${i.id}`}>
                                        <button type="button" onClick={() => setOpenItem(i)} className="flex w-full items-start gap-3 rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-3.5 text-left transition hover:border-[#0B57D0]/40 hover:shadow-sm">
                                            <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${ch.tint}`}>{ch.icon}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-baseline justify-between gap-3"><span className="truncate text-sm font-bold text-[#1F1F1F]">{i.who}</span><span className="flex-shrink-0 text-[11px] text-[#80868B]">{ago(i.at)}</span></span>
                                                <span className="block truncate text-sm text-[#3C4043]">{i.title}</span>
                                                {i.preview && i.preview !== i.title && <span className="block truncate text-xs text-[#80868B]">{i.preview}</span>}
                                                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${INTENT_TINT[i.kind]}`}>{i.intentLabel}{i.direction === 'IN' && i.kind === 'money' ? ' · in' : i.direction === 'OUT' && i.kind === 'money' ? ' · out' : ''}</span>
                                                    {i.amount != null && <span className="rounded-full bg-[#F8FAFD] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#1F1F1F] shadow-[inset_0_0_0_1px_#E3E5E8]">{i.currency && i.currency !== 'ZMW' ? `${i.currency} ${i.amount.toLocaleString()}` : formatKwacha(i.amount)}</span>}
                                                    {i.match === 'SUGGESTED' && <span className="rounded-full bg-[#FEF7E0] px-2 py-0.5 text-[10px] font-bold text-[#B06000]">Matches a payment received</span>}
                                                    {i.hasAttachments && <Paperclip size={12} className="text-[#80868B]" />}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                {!isPending && !isError && (data?.filteredOut ?? 0) > 0 && <p className="mt-4 text-center text-[11px] text-[#80868B]">{data!.filteredOut} promotional and automated emails were left out.</p>}
            </div>

            <Dialog open={!!openItem} title={detail.data?.subject || openItem?.title || 'Message'} onClose={() => setOpenItem(null)}>
                {detail.isPending ? <div className="h-32 animate-pulse rounded-xl bg-[#F1F3F4]" /> : detail.isError ? <p className="text-sm text-[#C5221F]">Couldn’t open this message.</p> : (
                    <div className="max-h-[60vh] overflow-y-auto">
                        <p className="text-xs text-[#5F6368]">From <span className="font-semibold text-[#1F1F1F]">{detail.data?.from ?? openItem?.who}</span>{detail.data?.to ? <> to {detail.data.to}</> : null} · {new Date(detail.data?.at ?? openItem!.at).toLocaleString()}</p>
                        {detail.data?.summary && <p className="mt-3 rounded-xl bg-[#F8FAFD] px-3 py-2 text-sm text-[#3C4043]"><span className="font-semibold">What this is:</span> {detail.data.summary}</p>}
                        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[#1F1F1F]">{detail.data?.body}</pre>
                        {!!detail.data?.attachments?.length && <p className="mt-3 text-xs text-[#5F6368]">Attachments: {detail.data.attachments.map((a) => a.name).filter(Boolean).join(', ')}</p>}
                    </div>
                )}
            </Dialog>
        </PagePanel>
    );
};
