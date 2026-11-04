import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
import { rewardsService } from 'core';
import type { RewardItem, RewardItemInput, RewardType } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';

const TYPE_LABEL: Record<RewardType, string> = { AMOUNT_OFF: 'Amount off', PERCENT_OFF: 'Percent off', FREE_ITEM: 'Free item' };

const num = (v: string) => (v === '' ? 0 : Number(v));

/**
 * Customer rewards for a business: how many points a kwacha earns, what customers can redeem points for, and a place to mark a customer's
 * voucher code as used. The web twin of the Expo "Customer rewards" settings screen.
 */
export const RewardsManage: React.FC = () => {
    const qc = useQueryClient();
    const { data: program, isPending } = useQuery({ queryKey: ['rewards', 'program'], queryFn: () => rewardsService.getProgram() });
    const { data: items = [] } = useQuery({ queryKey: ['rewards', 'items'], queryFn: () => rewardsService.listItems() });

    const [form, setForm] = useState({ enabled: false, points_per_kwacha: '1', reward_threshold: '100', reward_title: '', reward_value: '0', referral_points: '0' });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editing, setEditing] = useState<RewardItem | 'new' | null>(null);
    const [voucherCode, setVoucherCode] = useState('');
    const [voucherMsg, setVoucherMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [voucherBusy, setVoucherBusy] = useState(false);

    useEffect(() => {
        if (!program) return;
        setForm({
            enabled: program.enabled,
            points_per_kwacha: String(program.points_per_kwacha),
            reward_threshold: String(program.reward_threshold),
            reward_title: program.reward_title ?? '',
            reward_value: String(program.reward_value),
            referral_points: String(program.referral_points),
        });
    }, [program]);

    const save = async () => {
        setSaving(true); setError(null); setSaved(false);
        try {
            await rewardsService.updateProgram({
                enabled: form.enabled,
                points_per_kwacha: num(form.points_per_kwacha),
                reward_threshold: num(form.reward_threshold),
                reward_title: form.reward_title.trim(),
                reward_value: num(form.reward_value),
                referral_points: num(form.referral_points),
            });
            qc.invalidateQueries({ queryKey: ['rewards'] });
            setSaved(true);
        } catch (e: any) {
            setError(e?.message || 'Could not save your rewards settings.');
        } finally {
            setSaving(false);
        }
    };

    const useVoucher = async () => {
        if (!voucherCode.trim()) return;
        setVoucherBusy(true); setVoucherMsg(null);
        try {
            const r = await rewardsService.useVoucher(voucherCode.trim().toUpperCase());
            setVoucherMsg({ ok: true, text: `${r.title} marked as used for ${r.customer}.` });
            setVoucherCode('');
            qc.invalidateQueries({ queryKey: ['rewards'] });
        } catch (e: any) {
            setVoucherMsg({ ok: false, text: e?.message || 'That code didn’t work.' });
        } finally {
            setVoucherBusy(false);
        }
    };

    const remove = async (item: RewardItem) => {
        try { await rewardsService.deleteItem(item.id); qc.invalidateQueries({ queryKey: ['rewards', 'items'] }); }
        catch (e: any) { setError(e?.message || 'Could not delete that reward.'); }
    };

    const toggle = async (item: RewardItem) => {
        try { await rewardsService.updateItem(item.id, { active: !item.active }); qc.invalidateQueries({ queryKey: ['rewards', 'items'] }); }
        catch (e: any) { setError(e?.message || 'Could not update that reward.'); }
    };

    return (
        <PagePanel title="Customer rewards" subtitle="Reward the people who buy from you" back="/rewards" maxWidth="max-w-[1400px]">
            <ErrorNote text={error} />
            {isPending ? <p className="py-10 text-center text-sm text-[#80868B]">Loading…</p> : (
                <div className="flex flex-col gap-6">
                    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-[#1F1F1F]">Your programme</h2>
                                <p className="text-xs text-[#5F6368]">Customers earn points when they pay you.</p>
                            </div>
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#1F1F1F]">
                                <input type="checkbox" checked={form.enabled} onChange={(e) => { setSaved(false); setForm({ ...form, enabled: e.target.checked }); }} className="h-5 w-5 rounded border-[#C4C7C5] text-[#0B57D0] focus:ring-[#0B57D0]" />
                                {form.enabled ? 'On' : 'Off'}
                            </label>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field label="Points per K1 spent" value={form.points_per_kwacha} onChange={(v) => { setSaved(false); setForm({ ...form, points_per_kwacha: v }); }} />
                            <Field label="Points for a referral" value={form.referral_points} onChange={(v) => { setSaved(false); setForm({ ...form, referral_points: v }); }} />
                            <Field label="Points needed for the main reward" value={form.reward_threshold} onChange={(v) => { setSaved(false); setForm({ ...form, reward_threshold: v }); }} />
                            <Field label="Main reward value (K)" value={form.reward_value} onChange={(v) => { setSaved(false); setForm({ ...form, reward_value: v }); }} />
                            <div className="sm:col-span-2">
                                <label className={labelClass} htmlFor="rw-title">Main reward name</label>
                                <input id="rw-title" className={fieldClass} value={form.reward_title} onChange={(e) => { setSaved(false); setForm({ ...form, reward_title: e.target.value }); }} placeholder="e.g. K50 off your next order" />
                            </div>
                        </div>
                        <PrimaryButton onClick={save} busy={saving} className="mt-5 h-11 px-6">{saved ? <><Check size={16} /> Saved</> : 'Save programme'}</PrimaryButton>
                    </section>

                    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-[#1F1F1F]">Rewards customers can claim</h2>
                                <p className="text-xs text-[#5F6368]">Discounts or free items they redeem points for.</p>
                            </div>
                            <TonalButton onClick={() => setEditing('new')}><Plus size={14} /> Add reward</TonalButton>
                        </div>
                        {items.length === 0 ? (
                            <p className="py-4 text-sm text-[#80868B]">No rewards yet.</p>
                        ) : (
                            <ul className="divide-y divide-[rgba(116,119,117,0.14)]">
                                {items.map((it) => (
                                    <li key={it.id} className="flex items-center gap-3 py-3">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-[#1F1F1F]">{it.title}</span>
                                            <span className="block truncate text-xs text-[#5F6368]">{it.summary} · {it.points_cost.toLocaleString()} points</span>
                                        </span>
                                        <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${it.active ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#F1F3F4] text-[#5F6368]'}`}>{it.active ? 'Active' : 'Paused'}</span>
                                        <button type="button" onClick={() => toggle(it)} className="text-xs font-semibold text-[#0B57D0] hover:underline">{it.active ? 'Pause' : 'Resume'}</button>
                                        <button type="button" onClick={() => setEditing(it)} aria-label="Edit" className="text-[#5F6368] hover:text-[#0B57D0]"><Pencil size={15} /></button>
                                        <button type="button" onClick={() => remove(it)} aria-label="Delete" className="text-[#9AA0A6] hover:text-[#D93025]"><Trash2 size={15} /></button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
                        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><Ticket size={16} className="text-[#0B57D0]" /> Redeem a customer’s voucher</h2>
                        <p className="mb-3 text-xs text-[#5F6368]">Enter the code a customer shows you to mark it as used.</p>
                        <div className="flex gap-2">
                            <input className={`${fieldClass} uppercase tracking-widest`} value={voucherCode} onChange={(e) => { setVoucherCode(e.target.value); setVoucherMsg(null); }} placeholder="Voucher code" />
                            <PrimaryButton onClick={useVoucher} busy={voucherBusy} disabled={!voucherCode.trim()} className="px-6">Use</PrimaryButton>
                        </div>
                        {voucherMsg && <p role="status" className={`mt-3 rounded-xl px-4 py-3 text-sm ${voucherMsg.ok ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#FCE8E6] text-[#B31412]'}`}>{voucherMsg.text}</p>}
                    </section>
                </div>
            )}

            <RewardItemDialog open={!!editing} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['rewards', 'items'] }); }} />
        </PagePanel>
    );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
    <div>
        <label className={labelClass}>{label}</label>
        <input className={fieldClass} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} />
    </div>
);

const RewardItemDialog: React.FC<{ open: boolean; item: RewardItem | null; onClose: () => void; onSaved: () => void }> = ({ open, item, onClose, onSaved }) => {
    const [title, setTitle] = useState('');
    const [type, setType] = useState<RewardType>('AMOUNT_OFF');
    const [value, setValue] = useState('');
    const [points, setPoints] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setTitle(item?.title ?? ''); setType(item?.reward_type ?? 'AMOUNT_OFF');
        setValue(item ? String(item.value) : ''); setPoints(item ? String(item.points_cost) : '');
    }, [open, item]);

    const save = async () => {
        if (!(Number(points) > 0)) { setError('Say how many points it costs.'); return; }
        if (type !== 'FREE_ITEM' && !(Number(value) > 0)) { setError(type === 'PERCENT_OFF' ? 'Enter the percentage off.' : 'Enter the amount off.'); return; }
        setBusy(true); setError(null);
        const input: RewardItemInput = { title: title.trim() || undefined, reward_type: type, value: type === 'FREE_ITEM' ? 0 : Number(value), points_cost: Number(points) };
        try {
            if (item) await rewardsService.updateItem(item.id, input); else await rewardsService.createItem(input);
            onSaved();
        } catch (e: any) {
            setError(e?.message || 'Could not save that reward.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} title={item ? 'Edit reward' : 'New reward'} onClose={onClose}>
            <ErrorNote text={error} />
            <div className="mb-4">
                <label className={labelClass} htmlFor="ri-title">Name (optional)</label>
                <input id="ri-title" className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. K20 off any order" autoFocus />
            </div>
            <div className="mb-4">
                <p className={labelClass}>What does it give?</p>
                <div className="flex gap-2">
                    {(Object.keys(TYPE_LABEL) as RewardType[]).map((t) => (
                        <button key={t} type="button" onClick={() => setType(t)} className={`h-10 flex-1 rounded-full text-sm transition ${type === t ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#5F6368] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>{TYPE_LABEL[t]}</button>
                    ))}
                </div>
            </div>
            {type !== 'FREE_ITEM' && <div className="mb-4"><Field label={type === 'PERCENT_OFF' ? 'Percent off' : 'Amount off (K)'} value={value} onChange={setValue} /></div>}
            <div className="mb-5"><Field label="Points it costs" value={points} onChange={setPoints} /></div>
            <PrimaryButton onClick={save} busy={busy} className="w-full">{item ? 'Save changes' : 'Add reward'}</PrimaryButton>
        </Dialog>
    );
};
