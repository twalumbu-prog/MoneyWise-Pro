import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle, Loader2, Sparkles, X, AlertCircle } from 'lucide-react';
import { templatesForIndustries, needsPrice, productFromTemplate } from 'core';
import type { BusinessTemplate } from 'core';
import { productService, Product } from '../services/product.service';

/**
 * "Start from a template": pick the kind of business, see what businesses like it usually sell, type YOUR price for the ones you want, and they
 * are added to the store in one go. No prices are suggested (a made-up price would be wrong), only what to sell. Quotes and donations need no price.
 * Listings made here are for the business's own store and pay links; they are not put on the marketplace.
 */
interface Props {
    open: boolean;
    onClose: () => void;
    /** The industries the business chose in onboarding, so the right template is suggested first. */
    industries?: string[];
    /** Names already in the store: those rows are shown as already there and not added twice. */
    existingNames?: string[];
    onAdded: (created: Product[]) => void;
}

const norm = (s: string) => s.trim().toLowerCase();
const TYPE_NOTE: Record<string, string> = {
    SERVICE_VARIABLE: 'Price set when you sell', DONATION: 'The giver chooses the amount', SERVICE_APPOINTMENT: 'Bookable time slot',
    SERVICE_BOOKING: 'Booked by the night', SERVICE_BOOKING_DAILY: 'Booked by the day',
};

export const TemplatePickerModal: React.FC<Props> = ({ open, onClose, industries = [], existingNames = [], onAdded }) => {
    const ranked = useMemo(() => templatesForIndustries(industries), [industries]);
    const [chosen, setChosen] = useState<BusinessTemplate | null>(null);
    const [include, setInclude] = useState<Record<number, boolean>>({});
    const [prices, setPrices] = useState<Record<number, string>>({});
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [failures, setFailures] = useState<string[]>([]);
    const [doneCount, setDoneCount] = useState<number | null>(null);

    useEffect(() => { if (open) { setChosen(null); setInclude({}); setPrices({}); setFailures([]); setDoneCount(null); setProgress(0); } }, [open]);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy, onClose]);
    if (!open) return null;

    const have = new Set(existingNames.map(norm));
    const rows = chosen ? chosen.items.map((item, i) => ({ item, i, already: have.has(norm(item.name)) })) : [];
    // An item is ready when it is ticked and, if it needs a price, has a valid one.
    const ready = rows.filter((r) => !r.already && include[r.i] && productFromTemplate(r.item, prices[r.i]) !== null);
    const problems = rows.filter((r) => !r.already && include[r.i] && productFromTemplate(r.item, prices[r.i]) === null);

    const setPrice = (i: number, v: string) => { setPrices((p) => ({ ...p, [i]: v })); if (v.trim()) setInclude((s) => ({ ...s, [i]: true })); };

    const add = async () => {
        if (!ready.length || busy) return;
        setBusy(true); setFailures([]); setProgress(0);
        const created: Product[] = [];
        const failed: string[] = [];
        for (const r of ready) {
            try { created.push(await productService.createProduct(productFromTemplate(r.item, prices[r.i])!)); }
            catch (e: any) { failed.push(`${r.item.name}: ${e?.message || 'could not be added'}`); }
            setProgress((n) => n + 1);
        }
        setBusy(false);
        setFailures(failed);
        if (created.length) onAdded(created);
        setDoneCount(created.length);
        if (!failed.length) setTimeout(onClose, 1400);
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Start from a template">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !busy && onClose()} />
            <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
                <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
                    {chosen && doneCount === null && <button type="button" onClick={() => setChosen(null)} disabled={busy} aria-label="Back" className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><ArrowLeft size={18} /></button>}
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-[#1F1F1F]">{chosen ? chosen.name : 'Start from a template'}</h3>
                        <p className="text-xs text-gray-500">{chosen ? 'Tick what you sell and add your price. Nothing is added until you press the button.' : 'Pick the kind of business you run and we will list what businesses like yours usually sell.'}</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
                </div>

                <div className="overflow-y-auto px-6 py-5">
                    {!chosen && (
                        <ul className="grid gap-2.5 sm:grid-cols-2">
                            {ranked.map(({ template, suggested }) => (
                                <li key={template.id}>
                                    <button type="button" onClick={() => setChosen(template)} className={`h-full w-full rounded-2xl border p-4 text-left transition-colors hover:border-[#0B57D0] hover:bg-[#F4F8FF] ${suggested ? 'border-[#0B57D0]/50 bg-[#F4F8FF]' : 'border-gray-200'}`}>
                                        <span className="flex items-start justify-between gap-2">
                                            <span className="text-sm font-bold text-[#1F1F1F]">{template.name}</span>
                                            {suggested && <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold text-[#0B57D0]"><Sparkles size={10} /> Suggested</span>}
                                        </span>
                                        <span className="mt-1 block text-xs text-gray-500">{template.blurb}</span>
                                        <span className="mt-2 block text-[11px] font-semibold text-gray-400">{template.items.length} items</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {chosen && (
                        <>
                            <ul className="divide-y divide-gray-100">
                                {rows.map(({ item, i, already }) => (
                                    <li key={i} className={`flex items-center gap-3 py-3 ${already ? 'opacity-50' : ''}`}>
                                        <input type="checkbox" checked={!!include[i] && !already} disabled={already || busy} onChange={(e) => setInclude((s) => ({ ...s, [i]: e.target.checked }))} aria-label={`Add ${item.name}`} className="h-5 w-5 flex-shrink-0 rounded border-gray-300 text-[#0B57D0]" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-[#1F1F1F]">{item.name}</span>
                                            <span className="block truncate text-[11px] text-gray-400">{already ? 'Already in your store' : TYPE_NOTE[item.product_type] || item.category || ''}</span>
                                        </span>
                                        {!already && needsPrice(item) && (
                                            <span className="relative flex-shrink-0">
                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">K</span>
                                                <input inputMode="decimal" value={prices[i] ?? ''} disabled={busy} onChange={(e) => setPrice(i, e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Price" aria-label={`Price for ${item.name}`} className="w-28 rounded-xl border border-gray-200 py-2 pl-7 pr-3 text-sm outline-none focus:border-[#0B57D0]" />
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {problems.length > 0 && <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-amber-700"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> Add a price (a number, up to two decimals) for: {problems.map((p) => p.item.name).join(', ')}.</p>}
                            {failures.length > 0 && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><p>These could not be added:</p><ul className="mt-1 list-disc pl-4">{failures.map((f) => <li key={f}>{f}</li>)}</ul></div>}
                            {doneCount !== null && !failures.length && <p className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle size={16} /> {doneCount} item{doneCount === 1 ? '' : 's'} added to your store.</p>}
                        </>
                    )}
                </div>

                {chosen && (
                    <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
                        <span className="text-xs font-semibold text-gray-500">{ready.length} ready to add</span>
                        <button type="button" onClick={doneCount !== null && failures.length ? onClose : add} disabled={busy || (doneCount === null && ready.length === 0)} className="inline-flex items-center gap-2 rounded-full bg-[#0B57D0] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#0A4DBA] disabled:opacity-50">
                            {busy ? <><Loader2 size={15} className="animate-spin" /> Adding {progress} of {ready.length}…</> : doneCount !== null && failures.length ? 'Done' : <><Check size={15} /> Add {ready.length || ''} item{ready.length === 1 ? '' : 's'}</>}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

