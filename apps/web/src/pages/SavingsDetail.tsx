import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Plus, Share2, ArrowUpFromLine } from 'lucide-react';
import { formatKwacha, savingsService } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, ErrorNote, PrimaryButton, TonalButton } from '../components/ui/Dialog';
import { AddMoneyDialog, InviteDialog, TransferOutDialog } from '../components/savings/SavingsDialogs';

const KIND_LABEL = { WISHLIST: 'Wishlist item', GOAL: 'Savings goal', GROUP: 'Group savings' } as const;

/** One savings item: balance and progress, its history, and (for a group) who is in it and what each person has put in. */
export const SavingsDetail: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [addOpen, setAddOpen] = useState(false);
    const [transferOpen, setTransferOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [confirm, setConfirm] = useState<'close' | 'leave' | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data: item, isPending, isError } = useQuery({ queryKey: ['savings', id], queryFn: () => savingsService.get(id), enabled: !!id });

    const owner = item?.role === 'OWNER';
    const pct = Math.round((item?.progress ?? 0) * 100);

    const finish = async (kind: 'close' | 'leave') => {
        if (!item) return;
        setBusy(true); setError(null);
        try {
            if (kind === 'close') await savingsService.archive(item.id); else await savingsService.leave(item.id);
            qc.invalidateQueries({ queryKey: ['savings'] });
            navigate('/savings');
        } catch (e: any) {
            setError(e?.message || 'That didn’t work. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <PagePanel title={item?.name ?? 'Savings'} subtitle={item ? KIND_LABEL[item.kind] : undefined} back="/savings">
            {isPending ? (
                <p className="py-10 text-center text-sm text-[#80868B]">Loading…</p>
            ) : isError || !item ? (
                <p className="py-10 text-center text-sm text-[#5F6368]">We couldn’t find that savings item.</p>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="flex flex-col gap-6 lg:col-span-2">
                        <section className="rounded-[28px] bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-6 text-white md:p-8">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">Saved so far</p>
                            <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums md:text-[44px]">{formatKwacha(item.balance)}</p>
                            {item.targetAmount ? (
                                <>
                                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/25">
                                        <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, pct)}%` }} />
                                    </div>
                                    <p className="mt-2 text-xs text-white/70">{pct}% of {formatKwacha(item.targetAmount)}{item.targetDate ? ` · by ${new Date(item.targetDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
                                </>
                            ) : (
                                <p className="mt-2 text-xs text-white/70">No target set</p>
                            )}
                            <div className="mt-6 flex flex-wrap gap-3">
                                <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0B57D0] hover:bg-white/90"><Plus size={16} /> Add money</button>
                                {owner && (
                                    <button type="button" onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#D3E3FD] px-5 py-3 text-sm font-semibold text-[#041E49] hover:bg-[#C2D7FA]"><ArrowUpFromLine size={16} /> Transfer out</button>
                                )}
                                {item.kind === 'GROUP' && owner && (
                                    <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#D3E3FD] px-5 py-3 text-sm font-semibold text-[#041E49] hover:bg-[#C2D7FA]"><Share2 size={16} /> Invite</button>
                                )}
                            </div>
                        </section>

                        {(item.description || item.frequency || item.productUrl) && (
                            <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                                {item.description && <p className="text-sm text-[#3C4043]">{item.description}</p>}
                                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#5F6368]">
                                    {item.frequency && <span>Saving {item.frequency.toLowerCase()}</span>}
                                    {item.productUrl && (
                                        <a href={item.productUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-[#0B57D0] hover:underline">
                                            View product <ExternalLink size={12} />
                                        </a>
                                    )}
                                </div>
                            </section>
                        )}

                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                            <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">Activity</h2>
                            {item.activity.length === 0 ? (
                                <p className="text-sm text-[#80868B]">No activity yet. Add money to get started.</p>
                            ) : (
                                <ul className="divide-y divide-[rgba(116,119,117,0.14)]">
                                    {item.activity.map((a) => (
                                        <li key={a.id} className="flex items-center gap-3 py-3">
                                            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${a.direction === 'IN' ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#F1F3F4] text-[#5F6368]'}`}>
                                                {a.direction === 'IN' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-[#1F1F1F]">{a.description}</span>
                                                <span className="block text-xs text-[#80868B]">{new Date(a.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            </span>
                                            <span className={`text-sm font-semibold tabular-nums ${a.direction === 'IN' ? 'text-[#137333]' : 'text-[#1F1F1F]'}`}>
                                                {a.direction === 'IN' ? '+' : '−'}{formatKwacha(a.amount)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    <div className="flex flex-col gap-6">
                        {item.kind === 'GROUP' && (
                            <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                                <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">Members ({item.memberSummary.length || item.members.length})</h2>
                                <ul className="flex flex-col gap-3">
                                    {(item.memberSummary.length ? item.memberSummary : item.members.map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl ?? null, role: m.role ?? '', count: 0, total: 0 }))).map((m) => (
                                        <li key={m.userId} className="flex items-center gap-3">
                                            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-xs font-bold text-[#0B57D0]">
                                                {m.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-medium text-[#1F1F1F]">{m.name}</span>
                                                    {m.role === 'OWNER' && <span className="rounded bg-[#E8F0FE] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#1967D2]">Organiser</span>}
                                                </span>
                                                <span className="block text-xs text-[#80868B]">{m.count} {m.count === 1 ? 'contribution' : 'contributions'}</span>
                                            </span>
                                            <span className="text-sm font-semibold tabular-nums text-[#1F1F1F]">{formatKwacha(m.total)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                            <h2 className="mb-1 text-sm font-bold text-[#1F1F1F]">{owner ? 'Close this savings' : 'Leave this group'}</h2>
                            <p className="mb-4 text-xs text-[#5F6368]">
                                {owner
                                    ? item.balance > 0 ? 'Transfer the money out first, then you can close it.' : 'It will be removed from your savings. Its history stays in your books.'
                                    : 'You’ll stop being a member. What you’ve already put in stays in the group.'}
                            </p>
                            <ErrorNote text={error} />
                            <button
                                type="button"
                                disabled={owner && item.balance > 0}
                                onClick={() => setConfirm(owner ? 'close' : 'leave')}
                                className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold text-[#B31412] shadow-[inset_0_0_0_1px_#F6AEA9] hover:bg-[#FCE8E6] disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                                {owner ? 'Close' : 'Leave group'}
                            </button>
                        </section>
                    </div>
                </div>
            )}

            <AddMoneyDialog open={addOpen} item={item ?? null} onClose={() => setAddOpen(false)} />
            <TransferOutDialog open={transferOpen} item={item ?? null} onClose={() => setTransferOpen(false)} />
            <InviteDialog open={inviteOpen} item={item ?? null} onClose={() => setInviteOpen(false)} />
            <Dialog open={!!confirm} title={confirm === 'close' ? 'Close this savings?' : 'Leave this group?'} onClose={() => setConfirm(null)}>
                <p className="mb-5 text-sm text-[#5F6368]">{confirm === 'close' ? 'It will be removed from your savings. Its history stays in your books.' : 'You’ll stop being a member of this group.'}</p>
                <div className="flex gap-3">
                    <TonalButton onClick={() => setConfirm(null)} className="h-12 flex-1">Cancel</TonalButton>
                    <PrimaryButton busy={busy} onClick={() => confirm && finish(confirm)} className="flex-1 !bg-[#D93025] hover:!bg-[#B31412]">{confirm === 'close' ? 'Close' : 'Leave'}</PrimaryButton>
                </div>
            </Dialog>
        </PagePanel>
    );
};
