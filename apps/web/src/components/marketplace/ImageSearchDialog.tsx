import React, { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { apiJson } from 'core';
import { Dialog, ErrorNote } from '../ui/Dialog';
import { categorize } from './taxonomy';
import { findLookalikes } from './visualSearch';
import type { Listing } from './parts';

/** What the photo turned out to be: what it shows, the words to look for it by and its category. */
export interface ImageMatch { thumb: string; summary: string; keywords: string[]; category: string; /** Set when the match is by how pictures look (no AI): the listings, best first. */ ids?: string[] }

/** How well a listing fits a photo: its name counts most, then its category, description and seller. Zero means it doesn't fit. */
export function matchScore(l: Listing, m: ImageMatch): number {
    if (m.ids) { const at = m.ids.indexOf(l.id); return at < 0 ? 0 : m.ids.length - at; }
    const name = l.name.toLowerCase(), rest = `${l.category ?? ''} ${l.description ?? ''} ${l.seller.name}`.toLowerCase();
    let score = 0;
    for (const k of m.keywords) { if (name.includes(k)) score += 3; else if (rest.includes(k)) score += 1; }
    if (score > 0 && categorize(l).main === m.category) score += 2;
    return score;
}

/** Shrinks a photo to something small enough to send (about 640 pixels wide). */
function shrink(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, 640 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
            c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file doesn’t look like a picture.')); };
        img.src = url;
    });
}

/** "Can't find the words? Search with an image": drop a photo or paste a link to one. */
export const ImageSearchDialog: React.FC<{ open: boolean; onClose: () => void; onResult: (m: ImageMatch) => void; listings: Listing[] }> = ({ open, onClose, onResult, listings }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [link, setLink] = useState('');
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    const run = async (image: string, thumb: string) => {
        setBusy(true); setError(null);
        try {
            const r = await apiJson<{ summary: string; keywords: string[]; category: string }>('/marketplace/image-search', { method: 'POST', body: JSON.stringify({ image }) });
            onResult({ thumb, summary: r.summary, keywords: r.keywords, category: r.category });
            onClose();
        } catch (e: any) {
            // The AI search isn't switched on: match by how the pictures look instead.
            if (/switched on/i.test(String(e?.message))) {
                try {
                    const ids = await findLookalikes(image, listings);
                    if (ids.length === 0) { setError('No items with pictures to compare yet.'); return; }
                    onResult({ thumb, summary: 'Matched by colour and look. It finds items that resemble your picture, not what it is.', keywords: [], category: 'other', ids });
                    onClose();
                } catch (v: any) { setError(v?.message || 'We couldn’t search with that picture.'); }
            } else setError(e?.message || 'We couldn’t search with that picture.');
        }
        finally { setBusy(false); }
    };
    const fromFile = async (file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Choose a picture (a photo or screenshot).'); return; }
        try { const data = await shrink(file); await run(data, data); } catch (e: any) { setError(e?.message || 'We couldn’t read that file.'); }
    };
    const fromLink = () => {
        const u = link.trim();
        if (!/^https:\/\//i.test(u)) { setError('Paste a link that starts with https://'); return; }
        run(u, u);
    };

    return (
        <Dialog open={open} onClose={() => !busy && onClose()} title="Can’t find the words? Search with an image" size="md">
            <div
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); fromFile(e.dataTransfer.files?.[0]); }}
                className={`flex h-44 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-sm transition ${over ? 'border-[#0B57D0] bg-[#E8F0FE]' : 'border-[#9AA0A6] bg-white'}`}
            >
                {busy ? (
                    <span className="inline-flex items-center gap-2 font-semibold text-[#0B57D0]"><Loader2 size={18} className="animate-spin" /> Looking at your picture…</span>
                ) : (
                    <span className="inline-flex items-center gap-3 text-[#1F1F1F]">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F4]"><Upload size={20} /></span>
                        <span>Drag an image here or <button type="button" onClick={() => input.current?.click()} className="font-semibold underline">browse to a file</button></span>
                    </span>
                )}
                <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <div className="my-4 flex items-center gap-3 text-xs text-[#80868B]"><span className="h-px flex-1 bg-[rgba(116,119,117,0.2)]" />or<span className="h-px flex-1 bg-[rgba(116,119,117,0.2)]" /></div>
            <div className="flex gap-2">
                <input value={link} onChange={(e) => { setLink(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') fromLink(); }} placeholder="Paste an image link" aria-label="Image link" disabled={busy} className="h-11 min-w-0 flex-1 rounded-xl border border-[#C4C7C5] bg-white px-4 text-sm focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]" />
                <button type="button" onClick={fromLink} disabled={busy || !link.trim()} className="h-11 rounded-full px-6 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE] disabled:opacity-50">Go</button>
            </div>
            <ErrorNote text={error} />
            <p className="mt-4 text-xs text-[#80868B]">We find Marketplace items that match your picture. Your picture is only used for this search.</p>
        </Dialog>
    );
};
