import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Search, UserPlus } from 'lucide-react';
import { cashbookService, formatKwacha, savingsService } from 'core';
import type { SavingsItem, SavingsKind, SavingsFrequency, SavingsPerson } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';

/** The wallets money can come from: the person's own, not the savings pots themselves. */
export function useSpendWallets(excludeId?: string) {
    const { data } = useQuery({ queryKey: ['wallets-payment-flow'], queryFn: () => cashbookService.getWallets() });
    const list: any[] = Array.isArray(data) ? data : (data?.data || []);
    return useMemo(() => list
        .filter((w) => w.id !== excludeId && !/\(Savings( [A-Z0-9]{3})?\)$/.test(String(w.name)))
        .map((w) => ({ id: String(w.id), name: String(w.name), balance: Number(w.balance) || 0 })), [list, excludeId]);
}

const KIND_COPY: Record<SavingsKind, { title: string; namePh: string; targetLabel: string; targetOptional: boolean }> = {
    WISHLIST: { title: 'Add to wishlist', namePh: 'e.g. Sony WH-1000XM5', targetLabel: 'Price', targetOptional: false },
    GOAL: { title: 'New savings goal', namePh: 'e.g. Emergency fund', targetLabel: 'Target amount', targetOptional: true },
    GROUP: { title: 'New group savings', namePh: 'e.g. Livingstone Group Trip', targetLabel: 'Group target', targetOptional: false },
};

const FREQUENCIES: { value: SavingsFrequency; label: string }[] = [
    { value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' },
];

const AmountField: React.FC<{ value: string; onChange: (v: string) => void; label?: string }> = ({ value, onChange, label = 'Amount' }) => (
    <div className="mb-4">
        <label className={labelClass}>{label}</label>
        <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[#80868B]">K</span>
            <input
                className={`${fieldClass} pl-9 text-lg font-bold`}
                inputMode="decimal"
                value={value}
                onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                placeholder="0.00"
            />
        </div>
    </div>
);

const WalletSelect: React.FC<{ label: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }> = ({ label, value, options, onChange }) => (
    <div className="mb-5">
        <label className={labelClass}>{label}</label>
        <select className={`${fieldClass} appearance-none`} value={value} onChange={(e) => onChange(e.target.value)}>
            {options.length === 0 && <option value="">No wallets available</option>}
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
    </div>
);

const refreshSavings = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: ['savings'] });
    qc.invalidateQueries({ queryKey: ['wallets-payment-flow'] });
    qc.invalidateQueries({ queryKey: ['wallets'] });
};

/* ── Create ─────────────────────────────────────────────────────────────────────────────────────── */

export const CreateSavingsDialog: React.FC<{ open: boolean; kind: SavingsKind; onClose: () => void; onCreated: (item: SavingsItem) => void }> = ({ open, kind, onClose, onCreated }) => {
    const qc = useQueryClient();
    const copy = KIND_COPY[kind];
    const [name, setName] = useState('');
    const [target, setTarget] = useState('');
    const [description, setDescription] = useState('');
    const [goalDate, setGoalDate] = useState('');
    const [frequency, setFrequency] = useState<SavingsFrequency | ''>('');
    const [link, setLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) { setName(''); setTarget(''); setDescription(''); setGoalDate(''); setFrequency(''); setLink(''); setError(null); }
    }, [open, kind]);

    const save = async () => {
        if (!name.trim()) { setError('Give it a name.'); return; }
        const t = Number(target);
        if (!copy.targetOptional && !(t > 0)) { setError(`Enter the ${copy.targetLabel.toLowerCase()}.`); return; }
        setBusy(true); setError(null);
        try {
            const created = await savingsService.create({
                kind, name: name.trim(),
                targetAmount: t > 0 ? t : undefined,
                description: description.trim() || undefined,
                targetDate: goalDate || undefined,
                frequency: frequency || undefined,
                productUrl: link.trim() || undefined,
            });
            refreshSavings(qc);
            onCreated(created);
        } catch (e: any) {
            setError(e?.message || 'Could not create it.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} title={copy.title} onClose={onClose}>
            <ErrorNote text={error} />
            <div className="mb-4">
                <label className={labelClass} htmlFor="sv-name">Name</label>
                <input id="sv-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePh} autoFocus />
            </div>
            <AmountField label={`${copy.targetLabel}${copy.targetOptional ? ' (optional)' : ''}`} value={target} onChange={setTarget} />
            {kind !== 'GROUP' && (
                <>
                    <div className="mb-4">
                        <label className={labelClass} htmlFor="sv-desc">Description (optional)</label>
                        <textarea
                            id="sv-desc"
                            rows={3}
                            className="w-full rounded-xl border border-[#C4C7C5] bg-white px-4 py-3 text-sm placeholder:text-[#9AA0A6] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={kind === 'WISHLIST' ? 'Why you want it, colour, model…' : 'What this money is for'}
                        />
                    </div>
                    <div className="mb-4">
                        <label className={labelClass} htmlFor="sv-date">Goal date (optional)</label>
                        <input id="sv-date" type="date" className={fieldClass} value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
                    </div>
                    <div className="mb-4">
                        <p className={labelClass}>How often will you save? (optional)</p>
                        <div className="flex gap-2">
                            {FREQUENCIES.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setFrequency(frequency === f.value ? '' : f.value)}
                                    className={`h-10 flex-1 rounded-full text-sm transition ${frequency === f.value ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#5F6368] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {kind === 'WISHLIST' && (
                        <div className="mb-4">
                            <label className={labelClass} htmlFor="sv-link">Link to the product (optional)</label>
                            <input id="sv-link" className={fieldClass} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
                        </div>
                    )}
                </>
            )}
            {kind === 'GROUP' && <p className="mb-4 text-sm text-[#5F6368]">You’ll get an invite code to share. People who join can contribute from their own wallet.</p>}
            <PrimaryButton onClick={save} busy={busy} className="w-full">Create</PrimaryButton>
        </Dialog>
    );
};

/* ── Add money ──────────────────────────────────────────────────────────────────────────────────── */

export const AddMoneyDialog: React.FC<{ open: boolean; item: SavingsItem | null; onClose: () => void }> = ({ open, item, onClose }) => {
    const qc = useQueryClient();
    const isOwner = item?.role === 'OWNER';
    const wallets = useSpendWallets(item?.walletId);
    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (open) { setAmount(''); setError(null); setDone(false); } }, [open, item?.id]);
    useEffect(() => { if (!walletId && wallets.length) setWalletId(wallets[0].id); }, [wallets, walletId]);

    const value = Number(amount);
    const selected = wallets.find((w) => w.id === walletId);

    const pay = async () => {
        if (!item) return;
        if (!(value > 0)) { setError('Enter an amount.'); return; }
        if (!selected) { setError('Choose a wallet to pay from.'); return; }
        if (selected.balance < value) { setError(`Not enough in ${selected.name}.`); return; }
        setBusy(true); setError(null);
        try {
            if (isOwner) {
                await savingsService.deposit(item.id, value, selected.id);
                setDone(true);
            } else {
                // A group member's wallet belongs to a different organisation from the group's: a real transfer between them.
                const r = await savingsService.memberDeposit(item.id, value, selected.id);
                if (r.status === 'CONFIRMED') setDone(true);
                else if (r.status === 'PENDING') setError('Your transfer is on its way. It can take a minute to confirm; it will show in the group once it lands.');
                else setError('The transfer didn’t go through. Nothing was taken from your wallet.');
            }
            refreshSavings(qc);
        } catch (e: any) {
            setError(e?.message || 'Could not add the money.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} title={item ? `Add money to ${item.name}` : 'Add money'} onClose={onClose}>
            {done ? (
                <div className="flex flex-col items-center py-6 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#34A853] text-[#34A853]"><Check size={28} strokeWidth={3} /></span>
                    <p className="mt-3 text-lg font-bold text-[#1F1F1F]">{formatKwacha(value)} added</p>
                    <p className="text-sm text-[#5F6368]">It’s now in {item?.name}.</p>
                    <PrimaryButton onClick={onClose} className="mt-6 w-full">Done</PrimaryButton>
                </div>
            ) : (
                <>
                    <ErrorNote text={error} />
                    <AmountField value={amount} onChange={(v) => { setAmount(v); setError(null); }} />
                    <WalletSelect label="Pay from" value={walletId} onChange={setWalletId} options={wallets.map((w) => ({ id: w.id, label: `${w.name} · ${formatKwacha(w.balance)}` }))} />
                    <PrimaryButton onClick={pay} busy={busy} className="w-full">Add money</PrimaryButton>
                </>
            )}
        </Dialog>
    );
};

/* ── Transfer out ───────────────────────────────────────────────────────────────────────────────── */

export const TransferOutDialog: React.FC<{ open: boolean; item: SavingsItem | null; onClose: () => void }> = ({ open, item, onClose }) => {
    const qc = useQueryClient();
    const wallets = useSpendWallets(item?.walletId);
    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (open) { setAmount(''); setError(null); } }, [open, item?.id]);
    useEffect(() => { if (!walletId && wallets.length) setWalletId(wallets[0].id); }, [wallets, walletId]);

    const go = async () => {
        if (!item) return;
        const v = Number(amount);
        if (!(v > 0)) { setError('Enter an amount.'); return; }
        if (v > item.balance) { setError(`There’s only ${formatKwacha(item.balance)} in ${item.name}.`); return; }
        if (!walletId) { setError('Choose where to send it.'); return; }
        setBusy(true); setError(null);
        try {
            await savingsService.withdraw(item.id, v, walletId);
            refreshSavings(qc);
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Could not transfer.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} title={item ? `Transfer from ${item.name}` : 'Transfer'} onClose={onClose}>
            <ErrorNote text={error} />
            <p className="mb-4 text-sm text-[#5F6368]">Available: <span className="font-semibold text-[#1F1F1F]">{formatKwacha(item?.balance ?? 0)}</span></p>
            <AmountField value={amount} onChange={(v) => { setAmount(v); setError(null); }} />
            <WalletSelect label="Send to" value={walletId} onChange={setWalletId} options={wallets.map((w) => ({ id: w.id, label: w.name }))} />
            <PrimaryButton onClick={go} busy={busy} className="w-full">Transfer</PrimaryButton>
        </Dialog>
    );
};

/* ── Join with a code ───────────────────────────────────────────────────────────────────────────── */

export const JoinGroupDialog: React.FC<{ open: boolean; onClose: () => void; onJoined: (id: string) => void }> = ({ open, onClose, onJoined }) => {
    const qc = useQueryClient();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (open) { setCode(''); setError(null); } }, [open]);

    const join = async () => {
        if (!code.trim()) { setError('Enter the invite code.'); return; }
        setBusy(true); setError(null);
        try {
            const r = await savingsService.join(code.trim().toUpperCase());
            refreshSavings(qc);
            onJoined(r.id);
        } catch (e: any) {
            setError(e?.message || 'That code didn’t work.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} title="Join a group" onClose={onClose}>
            <ErrorNote text={error} />
            <div className="mb-5">
                <label className={labelClass} htmlFor="sv-code">Invite code</label>
                <input id="sv-code" className={`${fieldClass} uppercase tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 7KQ2MXRA" autoCapitalize="characters" autoFocus />
            </div>
            <PrimaryButton onClick={join} busy={busy} className="w-full">Join group</PrimaryButton>
        </Dialog>
    );
};

/* ── Invite people ──────────────────────────────────────────────────────────────────────────────── */

export const InviteDialog: React.FC<{ open: boolean; item: SavingsItem | null; onClose: () => void }> = ({ open, item, onClose }) => {
    const qc = useQueryClient();
    const [copied, setCopied] = useState(false);
    const [query, setQuery] = useState('');
    const [people, setPeople] = useState<SavingsPerson[]>([]);
    const [searching, setSearching] = useState(false);
    const [added, setAdded] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    const link = item?.inviteCode ? `${window.location.origin}/savings/join/${item.inviteCode}` : '';

    useEffect(() => { if (open) { setCopied(false); setQuery(''); setPeople([]); setAdded({}); setError(null); } }, [open, item?.id]);

    useEffect(() => {
        if (!open || !item || query.trim().length < 2) { setPeople([]); return; }
        let cancelled = false;
        setSearching(true);
        const t = setTimeout(async () => {
            try { const r = await savingsService.searchPeople(item.id, query.trim()); if (!cancelled) setPeople(r); }
            catch { if (!cancelled) setPeople([]); }
            finally { if (!cancelled) setSearching(false); }
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query, open, item]);

    const copy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
        catch { setError('Couldn’t copy. Select the text and copy it yourself.'); }
    };

    const add = async (p: SavingsPerson) => {
        if (!item) return;
        try {
            await savingsService.addMember(item.id, p.userId);
            setAdded((a) => ({ ...a, [p.userId]: true }));
            qc.invalidateQueries({ queryKey: ['savings'] });
        } catch (e: any) {
            setError(e?.message || 'Could not add them.');
        }
    };

    return (
        <Dialog open={open} title={item ? `Invite to ${item.name}` : 'Invite'} onClose={onClose} size="md">
            <ErrorNote text={error} />
            {item?.inviteCode && (
                <div className="mb-6 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_rgba(116,119,117,0.22)]">
                    <p className={labelClass}>Invite code</p>
                    <p className="text-2xl font-bold tracking-[0.25em] text-[#1F1F1F]">{item.inviteCode}</p>
                    <div className="mt-3 flex items-center gap-2">
                        <input readOnly value={link} className="h-10 min-w-0 flex-1 rounded-lg bg-[#F1F3F4] px-3 text-xs text-[#5F6368]" onFocus={(e) => e.currentTarget.select()} />
                        <button type="button" onClick={() => copy(link)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#D3E3FD] px-4 text-sm font-semibold text-[#041E49] hover:bg-[#C2D7FA]">
                            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
                        </button>
                    </div>
                </div>
            )}
            <label className={labelClass} htmlFor="sv-people">Add someone on MoneyWise</label>
            <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#80868B]" />
                <input id="sv-people" className={`${fieldClass} pl-11`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, @username or email" autoComplete="off" />
            </div>
            <ul className="mt-3 flex flex-col">
                {searching && <li className="py-3 text-sm text-[#80868B]">Searching…</li>}
                {!searching && query.trim().length >= 2 && people.length === 0 && <li className="py-3 text-sm text-[#80868B]">No one found.</li>}
                {people.map((p) => (
                    <li key={p.userId} className="flex items-center gap-3 border-t border-[rgba(116,119,117,0.14)] py-3 first:border-t-0">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-sm font-bold text-[#0B57D0]">
                            {p.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[#1F1F1F]">{p.name}</span>
                            <span className="block truncate text-xs text-[#5F6368]">{p.username ? `@${p.username}` : p.email}</span>
                        </span>
                        {p.isMember || added[p.userId] ? (
                            <span className="text-xs font-semibold text-[#137333]">Member</span>
                        ) : (
                            <button type="button" onClick={() => add(p)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#D3E3FD] px-4 text-sm font-semibold text-[#041E49] hover:bg-[#C2D7FA]">
                                <UserPlus size={14} /> Add
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </Dialog>
    );
};
