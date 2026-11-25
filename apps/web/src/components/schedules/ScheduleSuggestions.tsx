import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Sparkles } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';

interface Suggestion { key: string; title: string; amount: number; cadence: string; nextDue: string; seen: number; currency: 'ZMW' | 'USD'; foreignAmount: number | null }
const CADENCE: Record<string, string> = { WEEKLY: 'every week', BIWEEKLY: 'every 2 weeks', MONTHLY: 'every month', QUARTERLY: 'every 3 months', YEARLY: 'every year' };
const when = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Payees you pay on a regular rhythm that are not on Schedules yet. Adding one is a tap; "Not now" hides it for good. (Bills that arrive by email are
 * added by themselves and show up in the list with a "From email" mark.)
 */
export const ScheduleSuggestions: React.FC<{ onAdded?: () => void }> = ({ onAdded }) => {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ['schedule-suggestions'], retry: false, staleTime: 120_000, queryFn: async () => (await apiJson<{ suggestions: Suggestion[] }>('/schedules/suggestions')).suggestions });
    const [busy, setBusy] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const act = async (s: Suggestion, kind: 'accept' | 'dismiss') => {
        setBusy(s.key); setErr(null);
        try {
            await apiJson(`/schedules/suggestions/${kind}`, { method: 'POST', body: JSON.stringify({ key: s.key }) });
            await qc.invalidateQueries({ queryKey: ['schedule-suggestions'] });
            if (kind === 'accept') { await qc.invalidateQueries({ queryKey: ['schedules'] }); await qc.invalidateQueries({ queryKey: ['schedule-counts'] }); onAdded?.(); }
        } catch (e: any) { setErr(e?.message || 'Could not do that.'); } finally { setBusy(null); }
    };
    const list = q.data ?? [];
    if (!list.length) return null;
    return (
        <div className="mb-4 rounded-2xl border border-[#D3E3FD] bg-[#F0F6FF] p-4">
            <p className="mb-0.5 flex items-center gap-1.5 text-sm font-bold text-[#041E49]"><Sparkles size={14} className="text-[#0B57D0]" /> We noticed you pay these regularly</p>
            <p className="mb-2 text-[11px] text-[#5F6368]">Add them to Schedules so they’re never a surprise.</p>
            {err && <p className="mb-2 text-xs text-[#B31412]">{err}</p>}
            <ul className="divide-y divide-[#D3E3FD]">
                {list.map((s) => (
                    <li key={s.key} className="flex flex-wrap items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#1F1F1F]">{s.title}</p>
                            <p className="text-[11px] text-[#5F6368]">{s.currency === 'USD' && s.foreignAmount ? `$${s.foreignAmount} (about ${formatKwacha(s.amount)})` : formatKwacha(s.amount)} {CADENCE[s.cadence] ?? s.cadence.toLowerCase()} · paid {s.seen} times · next about {when(s.nextDue)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button" disabled={busy === s.key} onClick={() => act(s, 'dismiss')} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#5F6368] hover:bg-white disabled:opacity-40">Not now</button>
                            <button type="button" disabled={busy === s.key} onClick={() => act(s, 'accept')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B57D0] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0842A0] disabled:opacity-60">{busy === s.key && <Loader2 size={12} className="animate-spin" />} Add</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

/**
 * Reads the emails already in the mailbox (the last six months of bills and receipts) for bills that repeat, and adds them to Schedules. New emails
 * are read as they arrive; this catches up on the ones that came before. It works a few emails at a time and keeps going until none are left.
 */
export const ScanEmailsButton: React.FC = () => {
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const run = async () => {
        setBusy(true); setNote(null);
        let scanned = 0, added = 0, stored = 0;
        try {
            // 1. look further back through the mailbox (a year), a step at a time
            for (let round = 0; round < 40; round++) {
                const r = await apiJson<{ stored: number; classified: number; unread: number; done: boolean; connections: number; oldest: string | null }>('/schedules/backfill-emails', { method: 'POST' });
                stored += r.stored;
                setNote(`Looking back through your mailbox… ${stored} more emails found${r.oldest ? `, back to ${new Date(r.oldest + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}${r.unread ? ` · ${r.unread} to read` : ''}`);
                if (r.done || r.connections === 0) break;
            }
            // 2. read the bills and add the ones that repeat
            for (let round = 0; round < 40; round++) {
                const r = await apiJson<{ scanned: number; added: number; remaining: number }>('/schedules/scan-emails', { method: 'POST' });
                scanned += r.scanned; added += r.added;
                setNote(`Reading your bills… ${scanned} read, ${added} added${r.remaining ? `, ${r.remaining} to go` : ''}`);
                if (r.remaining === 0 || r.scanned === 0) break;
            }
            await Promise.all([qc.invalidateQueries({ queryKey: ['schedules'] }), qc.invalidateQueries({ queryKey: ['schedule-counts'] }), qc.invalidateQueries({ queryKey: ['schedule-suggestions'] })]);
            setNote(`Looked back through your mailbox and read ${scanned} bills. Added ${added} repeating bill${added === 1 ? '' : 's'} to Schedules.`);
        } catch (e: any) { setNote(e?.message || 'Could not read your emails.'); } finally { setBusy(false); }
    };
    return (
        <div className="flex items-center gap-2">
            {note && <span className="text-[11px] text-[#5F6368]">{note}</span>}
            <button type="button" onClick={run} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4] disabled:opacity-60">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Find bills in my emails
            </button>
        </div>
    );
};
