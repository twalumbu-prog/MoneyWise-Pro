import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { apiJson } from 'core';
import type { CatalogBrowse, CatalogItem } from './compareTypes';
import { unitText } from './compareTypes';

/**
 * Chooses a product from the shared catalogue ("Cement 50 kg bag"). Used by sellers, so their listing shows up in that product's price
 * comparison, and by the team when entering prices collected from other places.
 */
export const CatalogPicker: React.FC<{
    value: string;
    onChange: (id: string, item?: CatalogItem) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}> = ({ value, onChange, disabled, placeholder = 'Search the catalogue, e.g. cement or river sand', className }) => {
    const [selected, setSelected] = useState<CatalogItem | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CatalogItem[]>([]);
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    // Show the name of a product that was chosen earlier.
    useEffect(() => {
        let alive = true;
        if (!value) { setSelected(null); return; }
        if (selected?.id === value) return;
        apiJson<{ item: CatalogItem }>(`/marketplace/catalog/${value}`).then((r) => { if (alive) setSelected(r.item); }).catch(() => { if (alive) setSelected(null); });
        return () => { alive = false; };
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => {
            apiJson<CatalogBrowse>(`/marketplace/catalog?vertical=ALL${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`).then((r) => setResults(r.items.slice(0, 40))).catch(() => setResults([]));
        }, 200);
        return () => clearTimeout(t);
    }, [query, open]);

    useEffect(() => {
        if (!open) return;
        const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', down);
        return () => document.removeEventListener('mousedown', down);
    }, [open]);

    if (selected && value) {
        return (
            <div className={`flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm ${className ?? ''}`}>
                <span className="min-w-0"><span className="block truncate font-medium text-gray-900">{selected.name}</span><span className="block text-xs text-gray-500">{selected.category} · priced per {unitText(selected)}</span></span>
                {!disabled && <button type="button" aria-label="Clear" onClick={() => { setSelected(null); onChange(''); }} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X size={14} /></button>}
            </div>
        );
    }

    return (
        <div ref={box} className={`relative ${className ?? ''}`}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" value={query} disabled={disabled} onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} placeholder={placeholder} className="block w-full rounded-2xl border border-gray-200 bg-white py-3 pl-9 pr-3 text-sm outline-none transition-all placeholder-gray-400 focus:border-[#0B57D0] focus:ring-2 focus:ring-[#0B57D0]/20 disabled:bg-gray-50" />
            {open && (
                <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-gray-200 bg-white py-1 shadow-xl" role="listbox">
                    {results.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No match in the catalogue yet.</li>}
                    {results.map((i) => (
                        <li key={i.id}><button type="button" role="option" aria-selected={false} onClick={() => { setSelected(i); setOpen(false); setQuery(''); onChange(i.id, i); }} className="block w-full px-4 py-2 text-left hover:bg-[#F8FAFD]"><span className="block text-sm font-medium text-gray-900">{i.name}</span><span className="block text-xs text-gray-500">{i.category}</span></button></li>
                    ))}
                </ul>
            )}
        </div>
    );
};
