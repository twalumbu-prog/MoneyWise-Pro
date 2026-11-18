import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Heart } from 'lucide-react';
import { TREE, categoryPath } from './taxonomy';
import type { CategoryCounts } from './taxonomy';

/** "Shop by category": one button that opens every main category with its sub-categories, like eBay's menu. */
export const ShopByCategory: React.FC<{ counts: CategoryCounts }> = ({ counts }) => {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
    }, [open]);
    const go = (to: string) => { setOpen(false); navigate(to); };

    return (
        <div ref={box} className="relative flex-shrink-0">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true" className="inline-flex h-12 items-center gap-1.5 rounded-full px-3 text-left text-xs font-medium leading-tight text-[#5F6368] hover:bg-[#F1F3F4]">
                <span>Shop by<br />category</span><ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 mt-2 w-[min(920px,92vw)] rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-6 shadow-xl" role="menu">
                    <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                        {TREE.filter((m) => m.id !== 'food' && ((counts.main.get(m.id) ?? 0) > 0 || m.subs.length > 0)).map((m) => (
                            <div key={m.id}>
                                <button type="button" onClick={() => go(categoryPath(m.id))} className="mb-1.5 text-sm font-bold text-[#1F1F1F] hover:text-[#0B57D0] hover:underline">{m.name}</button>
                                <ul className="space-y-1">
                                    {m.subs.map((s) => (
                                        <li key={s.id}>
                                            <button type="button" onClick={() => go(categoryPath(m.id, s.id))} className="text-sm text-[#5F6368] hover:text-[#0B57D0] hover:underline">
                                                {s.name}{(counts.sub.get(`${m.id}/${s.id}`) ?? 0) > 0 && <span className="ml-1.5 text-xs text-[#9AA0A6]">{counts.sub.get(`${m.id}/${s.id}`)}</span>}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 border-t border-[rgba(116,119,117,0.16)] pt-4 text-sm font-bold">
                        <Link to="/marketplace" onClick={() => setOpen(false)} className="text-[#1F1F1F] hover:text-[#0B57D0]">Marketplace home &rsaquo;</Link>
                        <Link to="/marketplace/food" onClick={() => setOpen(false)} className="ml-6 text-[#1F1F1F] hover:text-[#0B57D0]">Food &amp; catering &rsaquo;</Link>
                        <Link to="/marketplace/services" onClick={() => setOpen(false)} className="ml-6 text-[#1F1F1F] hover:text-[#0B57D0]">Services &rsaquo;</Link>
                    </div>
                </div>
            )}
        </div>
    );
};

/** The row of main categories under the search bar. Only categories with something in them are shown. */
export const CategoryBar: React.FC<{ counts: CategoryCounts; active?: string; saved: number; onSaved: () => void; onDeals: () => void }> = ({ counts, active, saved, onSaved, onDeals }) => {
    const mains = TREE.filter((m) => (counts.main.get(m.id) ?? 0) > 0);
    const link = (on: boolean) => `flex-shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${on ? 'border-[#1F1F1F] font-bold text-[#1F1F1F]' : 'border-transparent text-[#3C4043] hover:text-[#0B57D0]'}`;
    return (
        <nav className="no-scrollbar -mx-1 mb-5 flex items-center justify-center gap-1 overflow-x-auto border-b border-[rgba(116,119,117,0.16)] px-1" aria-label="Categories">
            <button type="button" onClick={onSaved} className={`${link(false)} inline-flex items-center gap-1.5`}><Heart size={14} /> Saved{saved ? ` (${saved})` : ''}</button>
            {mains.map((m) => <Link key={m.id} to={categoryPath(m.id)} className={link(active === m.id)}>{m.name}</Link>)}
            <button type="button" onClick={onDeals} className={link(false)}>Auctions</button>
        </nav>
    );
};
