import React from 'react';
import { Check } from 'lucide-react';

export interface StockVariant { id: string; name: string; color: string; size: string; stock: number }
export interface StockInfo { tracked: boolean; available: number | null; low: boolean; soldOut: boolean; variants: StockVariant[] }

const COLOURS: Record<string, string> = {
    black: '#1F1F1F', white: '#FFFFFF', red: '#D93025', blue: '#1A73E8', green: '#188038', yellow: '#F9AB00', orange: '#E8710A', pink: '#E91E8C', purple: '#8430CE',
    grey: '#80868B', gray: '#80868B', silver: '#C0C4C8', gold: '#D4AF37', brown: '#795548', beige: '#E8D8BE', navy: '#1B2A5C', maroon: '#7B1E1E', teal: '#00796B',
    cream: '#F5EBD6', khaki: '#BDB76B', turquoise: '#26C6DA', lilac: '#C9A7EB', burgundy: '#6D1A36', peach: '#FFCBA4',
};
/** A swatch colour for a colour name, or null when it isn't one we know (then the name is shown without a swatch). */
export const colourHex = (name: string): string | null => COLOURS[name.trim().toLowerCase()] ?? null;

/** "Only 2 left", "Sold out": the short line a buyer sees, or null when there is nothing worth saying. */
export const scarcity = (s: StockInfo | undefined): { text: string; tone: 'red' | 'dark' } | null => {
    if (!s?.tracked) return null;
    if (s.soldOut) return { text: 'Sold out', tone: 'dark' };
    if (s.low && s.available !== null) return { text: s.available === 1 ? 'Only 1 left' : `Only ${s.available} left`, tone: 'red' };
    return null;
};

/** The small label on a card's picture. */
export const StockChip: React.FC<{ stock: StockInfo | undefined; className?: string }> = ({ stock, className = '' }) => {
    const s = scarcity(stock);
    if (!s) return null;
    return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm ${s.tone === 'red' ? 'bg-[#B31412] text-white' : 'bg-[#1F1F1F] text-white'} ${className}`}>{s.text}</span>;
};

/** Colours and sizes to choose from; one that is out is crossed out and can't be picked. */
export const VariantPicker: React.FC<{ variants: StockVariant[]; value: string | null; onChange: (id: string) => void }> = ({ variants, value, onChange }) => {
    if (variants.length === 0) return null;
    const hasColour = variants.some((v) => v.color);
    const chosen = variants.find((v) => v.id === value) ?? null;
    return (
        <div>
            <p className="mb-2 text-sm text-[#5F6368]">{hasColour && variants.some((v) => v.size) ? 'Colour and size' : hasColour ? 'Colour' : variants.some((v) => v.size) ? 'Size' : 'Option'}{chosen && <span className="ml-1.5 font-semibold text-[#1F1F1F]">{chosen.name}</span>}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose an option">
                {variants.map((v) => {
                    const hex = colourHex(v.color);
                    const out = v.stock <= 0;
                    const on = v.id === value;
                    return (
                        <button key={v.id} type="button" role="radio" aria-checked={on} disabled={out} onClick={() => onChange(v.id)} title={out ? `${v.name}: sold out` : v.stock <= 5 ? `${v.name}: only ${v.stock} left` : v.name}
                            className={`inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm transition ${on ? 'bg-[#E8F0FE] font-bold text-[#041E49] ring-2 ring-[#0B57D0]' : 'bg-white text-[#1F1F1F] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'} ${out ? 'cursor-not-allowed text-[#9AA0A6] line-through opacity-60 hover:bg-white' : ''}`}>
                            {hex && <span className="h-4 w-4 flex-shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ background: hex }} />}
                            {v.name}
                            {on && <Check size={14} className="text-[#0B57D0]" />}
                            {!out && v.stock <= 5 && !on && <span className="text-[11px] font-semibold text-[#B31412]">{v.stock} left</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

/** How many are left of what is chosen, in words ("Only 2 left", "12 available"), with the urgent ones in red. */
export const StockLine: React.FC<{ stock: StockInfo | undefined; variantId: string | null; threshold?: number }> = ({ stock, variantId, threshold = 5 }) => {
    if (!stock?.tracked) return null;
    const v = stock.variants.find((x) => x.id === variantId);
    const n = v ? v.stock : stock.available ?? 0;
    if (n <= 0) return <p className="text-sm font-bold text-[#B31412]">{v ? 'This option is sold out' : 'Sold out'}</p>;
    if (n <= threshold) return <p className="text-sm font-bold text-[#B31412]">{n === 1 ? 'Only 1 left' : `Only ${n} left`}{v ? '' : ': order soon'}</p>;
    return <p className="text-sm text-[#137333]">{n} available</p>;
};
