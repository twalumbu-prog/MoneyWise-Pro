import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Phone, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, fieldClass } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { CatalogPicker } from '../components/marketplace/CatalogPicker';
import type { CatalogItem } from '../components/marketplace/compareTypes';
import { unitText } from '../components/marketplace/compareTypes';

interface Pick { itemId: string; itemName: string; unit: string; quantity: number; price: number; lineTotal: number; place: string; town: string | null; phone: string | null; trust: string; sourceType: string; ageDays: number | null; delivers: boolean; productId?: string }
interface Option { places: { place: string; town: string | null; phone: string | null }[]; total: number; savings: number | null; lines: Pick[]; missing: string[] }
interface Result { lines: { item: CatalogItem; quantity: number; typical: number | null; offerCount: number }[]; singleOptions: Option[]; fullCoverage: boolean; mix: Option | null; typicalTotal: number | null; notes: string[] }
interface Template { id: string; name: string; lines: { item: CatalogItem; quantity: number }[] }
interface Row { key: number; itemId: string; item: CatalogItem | null; quantity: string }

let rowKey = 1;
const blankRow = (): Row => ({ key: rowKey++, itemId: '', item: null, quantity: '' });

const Saving: React.FC<{ v: number | null }> = ({ v }) => {
    if (v === null) return null;
    if (Math.abs(v) < 1) return <span className="text-xs text-[#5F6368]">About the typical price</span>;
    return <span className={`text-xs font-semibold ${v > 0 ? 'text-[#137333]' : 'text-[#B06000]'}`}>{formatKwacha(Math.abs(v))} {v > 0 ? 'below' : 'above'} typical prices</span>;
};

const OptionCard: React.FC<{ title: string; hint?: string; o: Option; best?: boolean; onBuy: (id: string) => void }> = ({ title, hint, o, best, onBuy }) => (
    <section className={`rounded-2xl bg-white p-4 ${best ? 'shadow-[inset_0_0_0_2px_#137333]' : 'shadow-[inset_0_0_0_1px_#E0E0E0]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <p className="flex flex-wrap items-center gap-2 text-base font-bold text-[#1F1F1F]">{title}{best && <span className="rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]">Lowest total</span>}</p>
                {hint && <p className="text-xs text-[#5F6368]">{hint}</p>}
            </div>
            <div className="text-right"><p className="text-xl font-bold tabular-nums">{formatKwacha(o.total)}</p><Saving v={o.savings} /></div>
        </div>
        <ul className="mt-3 divide-y divide-[#F1F3F4] text-sm">
            {o.lines.map((l) => (
                <li key={`${l.itemId}-${l.place}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><span className="block font-medium text-[#1F1F1F]">{l.quantity.toLocaleString()} × {l.itemName}</span>
                        <span className="block text-xs text-[#5F6368]">{l.place}{l.town ? `, ${l.town}` : ''} · {formatKwacha(l.price)} each{l.delivers ? ' · delivers' : ''}{l.ageDays ? ` · price from ${l.ageDays} days ago` : ''}</span></span>
                    <span className="flex items-center gap-2">
                        {l.trust === 'LISTED' && l.productId ? <button type="button" onClick={() => onBuy(l.productId!)} className="rounded-full bg-[#E8F0FE] px-3 py-1 text-xs font-bold text-[#1967D2]">Buy on MoneyWise</button> : l.trust === 'VERIFIED' ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#137333]"><BadgeCheck size={12} /> Checked</span> : null}
                        <span className="w-24 text-right font-semibold tabular-nums">{formatKwacha(l.lineTotal)}</span>
                    </span>
                </li>
            ))}
        </ul>
        {o.missing.length > 0 && <p className="mt-2 rounded-xl bg-[#FEF7E0] px-3 py-2 text-xs text-[#7A4B00]">Not available here: {o.missing.join(', ')}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
            {o.places.map((p) => p.phone && <a key={p.place} href={`tel:${p.phone.replace(/[^+\d]/g, '')}`} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5]"><Phone size={12} /> {p.place}: {p.phone}</a>)}
        </div>
    </section>
);

/** Plan a purchase: say what you need, and see the cheapest place or places to buy it. */
export const MarketplacePlan: React.FC = () => {
    const navigate = useNavigate();
    const [rows, setRows] = useState<Row[]>([blankRow()]);
    const [town, setTown] = useState('');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const [result, setResult] = useState<Result | null>(null);

    useEffect(() => { apiJson<{ templates: Template[] }>('/marketplace/advice/templates').then((r) => setTemplates(r.templates)).catch(() => setTemplates([])); }, []);

    const useTemplate = (t: Template) => { setRows(t.lines.map((l) => ({ key: rowKey++, itemId: l.item.id, item: l.item, quantity: String(l.quantity) }))); setResult(null); };
    const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const ready = rows.filter((r) => r.itemId && Number(r.quantity) > 0);

    const find = async () => {
        setBusy(true); setErr(null);
        try { setResult(await apiJson<Result>('/marketplace/advice/basket', { method: 'POST', body: JSON.stringify({ items: ready.map((r) => ({ catalogItemId: r.itemId, quantity: Number(r.quantity) })), town: town.trim() || undefined }) })); }
        catch (e: any) { setErr(e?.message || 'Could not work that out.'); } finally { setBusy(false); }
    };
    const buy = (productId: string) => navigate(`/marketplace/${productId}`);

    return (
        <PagePanel title="Marketplace" subtitle="Plan a purchase: the cheapest place to buy everything you need" tabs={<MarketplaceTabs active="plan" />}>
            <section className="mb-5 rounded-[24px] bg-gradient-to-br from-[#6B3FA0] to-[#2E1A5C] p-5 text-white md:p-7">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80"><ShoppingBasket size={14} /> Plan a purchase</p>
                <h2 className="mt-1 text-2xl font-bold leading-tight md:text-3xl">Where should I buy all this?</h2>
                <p className="mt-1.5 max-w-xl text-sm opacity-90">List what you need and how many. We compare every price we know and show the cheapest single place and the cheapest mix.</p>
            </section>

            {templates.length > 0 && (
                <div className="mb-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5F6368]">Start from an example job</p>
                    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">{templates.map((t) => <button key={t.id} type="button" onClick={() => useTemplate(t)} className="h-10 flex-shrink-0 rounded-full px-4 text-sm font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]">{t.name}</button>)}</div>
                    <p className="mt-1 text-[11px] text-[#80868B]">Quantities in examples are only a starting point. Change them to match your job.</p>
                </div>
            )}

            <div className="space-y-3 rounded-2xl bg-[#F8FAFD] p-4">
                {rows.map((r) => (
                    <div key={r.key} className="grid grid-cols-[1fr_96px_36px] items-start gap-2">
                        <CatalogPicker value={r.itemId} onChange={(id, i) => set(r.key, { itemId: id, item: i ?? null })} placeholder="Search a product" />
                        <div><input className={fieldClass} inputMode="decimal" value={r.quantity} onChange={(e) => set(r.key, { quantity: e.target.value })} placeholder="How many" aria-label="Quantity" />{r.item && <p className="mt-0.5 text-[10px] text-[#80868B]">{unitText(r.item)}s</p>}</div>
                        <button type="button" aria-label="Remove" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blankRow()]))} className="flex h-11 w-9 items-center justify-center rounded-full text-[#5F6368] hover:bg-white"><Trash2 size={16} /></button>
                    </div>
                ))}
                <button type="button" onClick={() => setRows((rs) => [...rs, blankRow()])} className="inline-flex items-center gap-1 text-sm font-semibold text-[#0B57D0]"><Plus size={16} /> Add another product</button>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div><label className="mb-1 block text-xs font-semibold text-[#3C4043]">Your town (optional: prefers places there or that deliver)</label><input className={fieldClass} value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g. Lusaka" /></div>
                    <PrimaryButton busy={busy} onClick={find} disabled={ready.length === 0} className="h-12 px-8">Find the best place</PrimaryButton>
                </div>
            </div>
            <ErrorNote text={err} />

            {result && (
                <div className="mt-6 space-y-4">
                    {result.notes.map((n) => <p key={n} className="rounded-2xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#7A4B00]">{n}</p>)}
                    {result.mix && <OptionCard title={result.mix.places.length > 1 ? `Cheapest mix: ${result.mix.places.length} places` : 'Cheapest: one place'} hint="Each product from wherever it is cheapest" o={result.mix} best onBuy={buy} />}
                    {result.singleOptions.length > 0 && (
                        <>
                            <h3 className="pt-2 text-base font-bold text-[#1F1F1F]">{result.fullCoverage ? 'Everything from one place' : 'No single place has everything. Closest:'}</h3>
                            {result.singleOptions.map((o, i) => <OptionCard key={i} title={o.places.map((p) => p.place).join(', ')} hint={o.places[0]?.town ?? undefined} o={o} onBuy={buy} />)}
                        </>
                    )}
                    {!result.mix && result.singleOptions.length === 0 && <p className="rounded-2xl bg-[#F8FAFD] p-6 text-center text-sm text-[#5F6368]">We don’t have current prices for these yet. Ask suppliers for quotes instead.</p>}
                    <p className="text-xs leading-5 text-[#80868B]">Totals add up each price × quantity. Prices from places not on MoneyWise were collected and can change, and delivery isn’t included unless stated: confirm with the seller before you pay or travel.</p>
                </div>
            )}
        </PagePanel>
    );
};
