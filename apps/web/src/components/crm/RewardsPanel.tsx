import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Plus, Pencil, Trash2, X, Loader2, Search, Check } from 'lucide-react';
import { rewardsService, productService } from 'core';
import type { RewardItem, RewardItemInput, RewardType } from 'core';

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5';
const TYPES: { id: RewardType; label: string; hint: string }[] = [
    { id: 'AMOUNT_OFF', label: 'Discount (K off)', hint: 'A fixed amount comes off' },
    { id: 'PERCENT_OFF', label: 'Discount (% off)', hint: 'A percentage comes off' },
    { id: 'FREE_ITEM', label: 'Free item', hint: 'The chosen product is free' },
];
const KEY = ['rewards-items'] as const;

interface Draft { id?: string; title: string; reward_type: RewardType; value: string; points_cost: string; product_ids: string[]; active: boolean }
const blank: Draft = { title: '', reward_type: 'AMOUNT_OFF', value: '', points_cost: '', product_ids: [], active: true };

/** CRM → Rewards: the rewards customers can redeem their points for, what each applies to, and what it costs. */
export const RewardsPanel: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
    const qc = useQueryClient();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    const { data: items = [], isLoading, error: loadError } = useQuery<RewardItem[]>({ queryKey: KEY, queryFn: () => rewardsService.listItems() });
    const { data: products = [] } = useQuery({ queryKey: ['rewards-products'], queryFn: () => productService.getProducts(), staleTime: 60_000 });
    const shopProducts = useMemo(() => products.filter((p: any) => p.is_active !== false), [products]);

    const save = useMutation({
        mutationFn: (d: Draft) => {
            const input: RewardItemInput = {
                title: d.title.trim() || undefined, reward_type: d.reward_type, points_cost: Number(d.points_cost),
                value: d.reward_type === 'FREE_ITEM' ? 0 : Number(d.value), product_ids: d.product_ids, active: d.active,
            };
            return d.id ? rewardsService.updateItem(d.id, input) : rewardsService.createItem(input);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); setDraft(null); setError(''); },
        onError: (e: Error) => setError(e.message),
    });
    const toggle = useMutation({
        mutationFn: (r: RewardItem) => rewardsService.updateItem(r.id, { active: !r.active }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
    const remove = useMutation({
        mutationFn: (id: string) => rewardsService.deleteItem(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });

    const open = (r?: RewardItem) => {
        setError(''); setSearch('');
        setDraft(r ? { id: r.id, title: r.title, reward_type: r.reward_type, value: r.reward_type === 'FREE_ITEM' ? '' : String(r.value), points_cost: String(r.points_cost), product_ids: r.product_ids, active: r.active } : blank);
    };
    const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
    const toggleProduct = (id: string) => draft && set({ product_ids: draft.product_ids.includes(id) ? draft.product_ids.filter((x) => x !== id) : [...draft.product_ids, id] });
    const visible = shopProducts.filter((p: any) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold text-gray-900 font-['DM_Sans']">Rewards</h2>
                    <p className="text-[11px] text-gray-500 max-w-xl">Customers earn points when they pay you and spend them on the rewards below. Each reward shows in the MoneyWise app with their points balance.</p>
                </div>
                {canEdit && (
                    <button onClick={() => open()} className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
                        <Plus size={14} /> Add reward
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : loadError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm p-4">{(loadError as Error).message}</div>
            ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 px-6 text-center">
                    <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><Gift size={20} /></div>
                    <p className="text-sm font-semibold text-gray-900">No rewards yet</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Add a reward — a discount or a free item — and say how many points it costs. Until you do, customers can redeem the single reward from your programme settings.</p>
                </div>
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                    {items.map((r) => (
                        <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${r.active ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}><Gift size={16} /></div>
                            <div className="min-w-0 flex-1">
                                <p className={`text-sm font-semibold truncate ${r.active ? 'text-gray-900' : 'text-gray-400'}`}>{r.title}</p>
                                <p className="text-[11px] text-gray-500 truncate">
                                    {r.products.length === 0 ? 'Applies to everything' : r.products.map((p) => p.name).join(', ')}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-gray-900">{r.points_cost.toLocaleString('en-US')} pts</p>
                                <p className="text-[11px] text-gray-500">{TYPES.find((t) => t.id === r.reward_type)?.label}</p>
                            </div>
                            {canEdit && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => toggle.mutate(r)} className={`h-7 px-2.5 rounded-md text-[11px] font-semibold ${r.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.active ? 'On' : 'Off'}</button>
                                    <button onClick={() => open(r)} aria-label="Edit reward" className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 flex items-center justify-center"><Pencil size={14} /></button>
                                    <button onClick={() => { if (window.confirm(`Delete "${r.title}"? Vouchers already issued still work.`)) remove.mutate(r.id); }} aria-label="Delete reward" className="w-7 h-7 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600 flex items-center justify-center"><Trash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {draft && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !save.isPending) setDraft(null); }}>
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="flex items-center justify-between px-5 pt-5 pb-3">
                            <h3 className="text-base font-bold text-gray-900 font-['DM_Sans']">{draft.id ? 'Edit reward' : 'Add reward'}</h3>
                            <button onClick={() => setDraft(null)} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center"><X size={16} /></button>
                        </div>
                        <div className="px-5 pb-5 flex flex-col gap-4">
                            <div>
                                <label className={LABEL}>What the customer gets</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {TYPES.map((t) => (
                                        <button key={t.id} type="button" onClick={() => set({ reward_type: t.id })}
                                            className={`text-left rounded-lg border px-3 py-2 transition-colors ${draft.reward_type === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                            <span className="block text-xs font-semibold text-gray-900">{t.label}</span>
                                            <span className="block text-[10px] text-gray-500">{t.hint}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={LABEL}>Points needed</label>
                                    <input className={INPUT} inputMode="numeric" placeholder="e.g. 500" value={draft.points_cost} onChange={(e) => set({ points_cost: e.target.value.replace(/[^\d]/g, '') })} />
                                </div>
                                {draft.reward_type !== 'FREE_ITEM' && (
                                    <div>
                                        <label className={LABEL}>{draft.reward_type === 'PERCENT_OFF' ? 'Percent off' : 'Amount off (K)'}</label>
                                        <input className={INPUT} inputMode="decimal" placeholder={draft.reward_type === 'PERCENT_OFF' ? 'e.g. 10' : 'e.g. 25'} value={draft.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.]/g, '') })} />
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className={`${LABEL} mb-0`}>{draft.reward_type === 'FREE_ITEM' ? 'Free product' : 'Applies to'}</label>
                                    <span className="text-[10px] text-gray-400">{draft.product_ids.length === 0 ? (draft.reward_type === 'FREE_ITEM' ? 'Choose at least one' : 'Everything') : `${draft.product_ids.length} selected`}</span>
                                </div>
                                {shopProducts.length === 0 ? (
                                    <p className="text-xs text-gray-500 rounded-lg bg-gray-50 p-3">You have no products yet, so this reward applies to everything. Add products in Settings to limit it to some.</p>
                                ) : (
                                    <div className="border border-gray-200 rounded-lg">
                                        <div className="flex items-center gap-2 px-3 border-b border-gray-100">
                                            <Search size={13} className="text-gray-400" />
                                            <input className="flex-1 py-2 text-sm outline-none placeholder:text-gray-400" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
                                        </div>
                                        <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                                            {visible.map((p: any) => {
                                                const on = draft.product_ids.includes(p.id);
                                                return (
                                                    <button key={p.id} type="button" onClick={() => toggleProduct(p.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50">
                                                        <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>{on && <Check size={11} />}</span>
                                                        <span className="flex-1 text-sm text-gray-900 truncate">{p.name}</span>
                                                        <span className="text-[11px] text-gray-400">K{Number(p.price).toLocaleString('en-US')}</span>
                                                    </button>
                                                );
                                            })}
                                            {visible.length === 0 && <p className="text-xs text-gray-400 px-3 py-3">No products match.</p>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className={LABEL}>Name shown to customers (optional)</label>
                                <input className={INPUT} placeholder="We’ll write one, e.g. “K25 off Latte”" maxLength={80} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
                            </div>

                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} /> Available to customers
                            </label>

                            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                            <div className="flex justify-end gap-2 pt-1">
                                <button onClick={() => setDraft(null)} disabled={save.isPending} className="h-9 px-4 rounded-lg text-sm text-gray-700 hover:bg-gray-100">Cancel</button>
                                <button onClick={() => { setError(''); save.mutate(draft); }} disabled={save.isPending} className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
                                    {save.isPending && <Loader2 size={14} className="animate-spin" />} {draft.id ? 'Save changes' : 'Add reward'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
