import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gift, PiggyBank, Plus, Share2, Users, ArrowUpFromLine } from 'lucide-react';
import { formatKwacha, savingsService } from 'core';
import type { SavingsItem, SavingsKind } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PlanTabs } from '../components/ui/PlanTabs';
import { ProgressBar, TonalButton, PrimaryButton } from '../components/ui/Dialog';
import { AddMoneyDialog, CreateSavingsDialog, InviteDialog, JoinGroupDialog, TransferOutDialog } from '../components/savings/SavingsDialogs';

type Tab = 'WISHLIST' | 'GOAL' | 'GROUP';
const TABS: { id: Tab; label: string; card: string; section: string; empty: string }[] = [
    { id: 'WISHLIST', label: 'Wishlist', card: 'Wishlist', section: 'My wishlist', empty: 'Add things you’re saving up for, with the price, and watch each one fill up.' },
    { id: 'GOAL', label: 'Savings', card: 'Savings', section: 'My savings', empty: 'Start a goal, like an emergency fund, and set money aside for it.' },
    { id: 'GROUP', label: 'Group savings', card: 'Group savings total', section: 'Group savings', empty: 'Save together: create a shared pot, or join one with an invite code.' },
];

/**
 * Savings: Wishlist (things you're saving up for), Savings (open goals) and Group savings (a shared pot others join and contribute to).
 * Each item is its own wallet and savings account, so the money is real and shows in Reporting. The web twin of the Expo Savings screen.
 */
export const Savings: React.FC = () => {
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>('WISHLIST');
    const [createOpen, setCreateOpen] = useState(false);
    const [joinOpen, setJoinOpen] = useState(false);
    const [addFor, setAddFor] = useState<SavingsItem | null>(null);
    const [transferFor, setTransferFor] = useState<SavingsItem | null>(null);
    const [inviteFor, setInviteFor] = useState<SavingsItem | null>(null);

    const { data, isPending, isError, refetch } = useQuery({ queryKey: ['savings'], queryFn: () => savingsService.list() });

    const current = TABS.find((t) => t.id === tab)!;
    const items = tab === 'WISHLIST' ? data?.wishlist ?? [] : tab === 'GOAL' ? data?.goals ?? [] : data?.groups ?? [];
    const total = tab === 'WISHLIST' ? data?.totals.wishlist ?? 0 : tab === 'GOAL' ? data?.totals.goals ?? 0 : data?.totals.groups ?? 0;
    const open = (item: SavingsItem) => navigate(`/savings/${item.id}`);

    return (
        <PagePanel
            title="Plan"
            subtitle="Set money aside for what matters"
            tabs={<PlanTabs active="savings" />}
            actions={
                <>
                    {tab === 'GROUP' && <TonalButton onClick={() => setJoinOpen(true)}>Join with code</TonalButton>}
                    <PrimaryButton onClick={() => setCreateOpen(true)} className="h-10 px-5"><Plus size={16} /> {tab === 'WISHLIST' ? 'Add to wishlist' : tab === 'GOAL' ? 'New goal' : 'New group'}</PrimaryButton>
                </>
            }
        >
            <div className="mb-6 flex w-full max-w-md rounded-full p-[3px] shadow-[inset_0_0_0_1px_#C4C7C5]" role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex-1 rounded-full py-2.5 text-sm transition ${tab === t.id ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#5F6368] hover:bg-[#F1F3F4]'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <section className="mb-8 rounded-[28px] bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-6 text-white md:p-8">
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">{current.card}</p>
                <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums md:text-[44px]">{isPending ? '…' : formatKwacha(total)}</p>
                <p className="mt-2 text-[11px] font-medium text-white/60">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
            </section>

            <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">{current.section}</h2>

            {isError ? (
                <div className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-8 text-center">
                    <p className="text-sm text-[#5F6368]">Couldn’t load your savings.</p>
                    <TonalButton onClick={() => refetch()} className="mt-4">Try again</TonalButton>
                </div>
            ) : isPending ? (
                <p className="py-10 text-center text-sm text-[#80868B]">Loading…</p>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#C4C7C5] px-6 py-14 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]">
                        {tab === 'WISHLIST' ? <Gift size={26} /> : tab === 'GROUP' ? <Users size={26} /> : <PiggyBank size={26} />}
                    </span>
                    <p className="mt-4 max-w-sm text-sm text-[#5F6368]">{current.empty}</p>
                    <div className="mt-5 flex gap-2">
                        <PrimaryButton onClick={() => setCreateOpen(true)} className="h-10 px-5">{tab === 'GROUP' ? 'Create a group' : 'Get started'}</PrimaryButton>
                        {tab === 'GROUP' && <TonalButton onClick={() => setJoinOpen(true)}>Join with code</TonalButton>}
                    </div>
                </div>
            ) : (
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {items.map((item) => (
                        <SavingsCard
                            key={item.id}
                            item={item}
                            onOpen={() => open(item)}
                            onAdd={() => setAddFor(item)}
                            onTransfer={() => setTransferFor(item)}
                            onInvite={() => setInviteFor(item)}
                        />
                    ))}
                </ul>
            )}

            <CreateSavingsDialog open={createOpen} kind={tab as SavingsKind} onClose={() => setCreateOpen(false)} onCreated={(item) => { setCreateOpen(false); if (item.kind === 'GROUP') setInviteFor(item); }} />
            <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={(id) => { setJoinOpen(false); navigate(`/savings/${id}`); }} />
            <AddMoneyDialog open={!!addFor} item={addFor} onClose={() => setAddFor(null)} />
            <TransferOutDialog open={!!transferFor} item={transferFor} onClose={() => setTransferFor(null)} />
            <InviteDialog open={!!inviteFor} item={inviteFor} onClose={() => setInviteFor(null)} />
        </PagePanel>
    );
};

const SavingsCard: React.FC<{ item: SavingsItem; onOpen: () => void; onAdd: () => void; onTransfer: () => void; onInvite: () => void }> = ({ item, onOpen, onAdd, onTransfer, onInvite }) => {
    const owner = item.role === 'OWNER';
    const pct = Math.round((item.progress ?? 0) * 100);
    return (
        <li className="flex flex-col rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
            <button type="button" onClick={onOpen} className="flex items-start gap-3 text-left">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#E8F0FE] text-[#0B57D0]">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : item.kind === 'WISHLIST' ? <Gift size={22} /> : item.kind === 'GROUP' ? <Users size={22} /> : <PiggyBank size={22} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#1F1F1F]">{item.name}</span>
                    <span className="block text-xs text-[#5F6368]">
                        {item.targetAmount ? `Target ${formatKwacha(item.targetAmount)}` : 'No target'}
                        {item.kind === 'GROUP' && ` · ${item.members.length} ${item.members.length === 1 ? 'member' : 'members'}`}
                    </span>
                </span>
                {item.targetAmount ? <span className="text-sm font-bold text-[#0B57D0] tabular-nums">{pct}%</span> : null}
            </button>
            <div className="mt-4"><ProgressBar value={item.progress ?? 0} /></div>
            <p className="mt-2 text-sm font-semibold text-[#1F1F1F] tabular-nums">{formatKwacha(item.balance)} <span className="font-normal text-[#80868B]">saved</span></p>
            <div className="mt-4 flex flex-wrap gap-2">
                <TonalButton onClick={onAdd} className="h-9 px-4"><Plus size={14} /> Add money</TonalButton>
                {item.kind === 'GROUP' && owner && (
                    <>
                        <button type="button" onClick={onTransfer} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><ArrowUpFromLine size={14} /> Transfer</button>
                        <button type="button" onClick={onInvite} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><Share2 size={14} /> Invite</button>
                    </>
                )}
                {item.kind !== 'GROUP' && item.balance > 0 && (
                    <button type="button" onClick={onTransfer} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><ArrowUpFromLine size={14} /> Transfer out</button>
                )}
            </div>
        </li>
    );
};
