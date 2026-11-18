import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson } from 'core';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../ui/Dialog';
import { LAYOUTS, PRESETS, cleanTheme, headingClass, inkOn, themeVars } from './storeTheme';
import type { StoreCorners, StoreFont, StoreTheme } from './storeTheme';

const FONTS: { id: StoreFont; label: string }[] = [{ id: 'modern', label: 'Modern' }, { id: 'classic', label: 'Classic' }, { id: 'bold', label: 'Bold' }];
const CORNERS: { id: StoreCorners; label: string }[] = [{ id: 'soft', label: 'Soft' }, { id: 'round', label: 'Round' }, { id: 'sharp', label: 'Sharp' }];

const Seg = <T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) => (
    <div className="flex gap-1.5">
        {options.map((o) => <button key={o.id} type="button" onClick={() => onChange(o.id)} className={`h-9 flex-1 rounded-full text-sm transition ${value === o.id ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>{o.label}</button>)}
    </div>
);

/** Where a seller sets how their store looks. Few choices on purpose: the page structure is the same for every store. */
export const StoreThemeDialog: React.FC<{ open: boolean; onClose: () => void; theme: StoreTheme; storeName: string; orgId: string }> = ({ open, onClose, theme, storeName, orgId }) => {
    const qc = useQueryClient();
    const [t, setT] = useState<StoreTheme>(theme);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (open) { setT(theme); setError(null); } }, [open, theme]);
    const set = <K extends keyof StoreTheme>(k: K, v: StoreTheme[K]) => { setT((p) => ({ ...p, [k]: v })); setError(null); };

    const save = async () => {
        setBusy(true); setError(null);
        try {
            await apiJson('/marketplace/my-store-theme', { method: 'PUT', body: JSON.stringify({ accent: t.accent, mode: t.mode, font: t.font, corners: t.corners, layout: t.layout, tagline: t.tagline }) });
            await qc.invalidateQueries({ queryKey: ['marketplace', 'store', orgId] });
            onClose();
        } catch (e: any) { setError(e?.message || 'Couldn’t save the look.'); }
        finally { setBusy(false); }
    };

    const clean = cleanTheme(t);
    return (
        <Dialog open={open} onClose={onClose} title="Your store’s look" size="lg">
            {/* Live preview */}
            <div style={themeVars(clean)} className="mb-5 overflow-hidden rounded-[var(--s-card)] border border-[var(--s-line)]">
                <div className="relative h-24" style={{ background: clean.covers[0] ? `url(${clean.covers[0]}) center/cover` : `linear-gradient(135deg, ${clean.accent}, ${clean.accent}99)` }}>
                    <div className="absolute inset-0 bg-black/25" />
                    <p className={`absolute bottom-2 left-4 text-lg text-white ${headingClass(clean.font)}`}>{storeName}</p>
                </div>
                <div className="flex items-center justify-between gap-3 p-3">
                    <p className="min-w-0 truncate text-sm" style={{ color: 'var(--s-muted)' }}>{clean.tagline || 'Your tagline appears here'}</p>
                    <span className="rounded-[var(--s-control)] px-4 py-1.5 text-xs font-bold" style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)' }}>Add</span>
                </div>
            </div>

            <label className={labelClass}>Style</label>
            <div className="mb-4 grid grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                    <button key={p.name} type="button" onClick={() => setT((x) => ({ ...x, accent: p.accent, mode: p.mode }))} aria-label={p.name}
                        className={`flex h-12 flex-col items-center justify-center rounded-xl text-[10px] font-bold ${clean.accent.toLowerCase() === p.accent.toLowerCase() && clean.mode === p.mode ? 'ring-2 ring-[#0B57D0] ring-offset-2' : ''}`}
                        style={{ background: p.mode === 'dark' ? '#1F1F1F' : '#F6F6F7', color: p.mode === 'dark' ? '#F4F4F5' : '#1F1F1F' }}>
                        <span className="mb-0.5 h-3.5 w-3.5 rounded-full" style={{ background: p.accent }} />{p.name}
                    </button>
                ))}
            </div>
            <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass} htmlFor="th-accent">Your colour</label>
                    <div className="flex items-center gap-2">
                        <input id="th-accent" type="color" value={clean.accent} onChange={(e) => set('accent', e.target.value.toUpperCase())} className="h-12 w-14 cursor-pointer rounded-xl border border-[#C4C7C5] bg-white p-1" />
                        <span className="rounded-lg px-2 py-1 text-xs font-bold" style={{ background: clean.accent, color: inkOn(clean.accent) }}>{clean.accent}</span>
                    </div>
                </div>
                <div>
                    <label className={labelClass}>Mode</label>
                    <Seg value={clean.mode} options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} onChange={(v) => set('mode', v)} />
                </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Type</label><Seg value={clean.font} options={FONTS} onChange={(v) => set('font', v)} /></div>
                <div><label className={labelClass}>Corners</label><Seg value={clean.corners} options={CORNERS} onChange={(v) => set('corners', v)} /></div>
            </div>

            <label className={labelClass}>Items layout</label>
            <div className="mb-4 grid grid-cols-3 gap-2">
                {LAYOUTS.map((l) => (
                    <button key={l.id} type="button" onClick={() => set('layout', l.id)} className={`rounded-xl p-3 text-left text-xs transition ${clean.layout === l.id ? 'bg-[#D3E3FD] text-[#041E49] shadow-[inset_0_0_0_2px_#0B57D0]' : 'bg-white text-[#5F6368] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>
                        <span className="block text-sm font-bold">{l.label}</span>{l.hint}
                    </button>
                ))}
            </div>

            <label className={labelClass} htmlFor="th-tag">Tagline</label>
            <input id="th-tag" className={`${fieldClass} mb-4`} value={t.tagline} maxLength={80} onChange={(e) => set('tagline', e.target.value)} placeholder="e.g. Fresh wings, fast" />

            <ErrorNote text={error} />
            <div className="mt-4 flex gap-2">
                <TonalButton onClick={onClose} className="h-11 flex-1">Cancel</TonalButton>
                <PrimaryButton onClick={save} busy={busy} className="flex-1">Save look</PrimaryButton>
            </div>
        </Dialog>
    );
};
