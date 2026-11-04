import React from 'react';
import { formatKwacha } from 'core';

export interface AuctionForm { start: string; reserve: string; buy: string; step: string; hours: number }

export const DURATIONS = [
    { hours: 24, label: '1 day' }, { hours: 72, label: '3 days' }, { hours: 120, label: '5 days' },
    { hours: 168, label: '7 days' }, { hours: 240, label: '10 days' }, { hours: 336, label: '14 days' }, { hours: 720, label: '30 days' },
];

export const defaultAuction = (price: number | string | null | undefined): AuctionForm => ({ start: Number(price) > 0 ? String(price) : '1', reserve: '', buy: '', step: '1', hours: 168 });

/** The first thing wrong with the auction details, or null when they can be sent. */
export function auctionProblem(a: AuctionForm): string | null {
    const start = Number(a.start), reserve = a.reserve === '' ? null : Number(a.reserve), buy = a.buy === '' ? null : Number(a.buy);
    if (a.start === '' || !(start >= 0)) return 'Enter a starting price for the auction.';
    if (!(Number(a.step) > 0)) return 'The bid increment must be more than zero.';
    if (reserve !== null && reserve < start) return 'The reserve can’t be lower than the starting price.';
    if (buy !== null && buy <= Math.max(start, reserve ?? 0)) return 'Buy it now must be higher than the starting and reserve prices.';
    return null;
}

export const auctionBody = (productId: string, a: AuctionForm) => ({
    productId, startPrice: Number(a.start), reservePrice: a.reserve || null, buyNowPrice: a.buy || null, bidIncrement: Number(a.step) || 1, durationHours: a.hours,
});

const field = 'h-12 w-full rounded-xl border border-[#C4C7C5] bg-white px-4 text-sm text-[#1F1F1F] placeholder:text-[#9AA0A6] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]';
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#5F6368]';

/** The auction details (starting price, increment, reserve, Buy it now, length), used both in the item form and in the Auction dialog. */
export const AuctionFields: React.FC<{ value: AuctionForm; onChange: (a: AuctionForm) => void; name?: string }> = ({ value, onChange, name }) => {
    const money = (k: 'start' | 'reserve' | 'buy' | 'step') => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value.replace(/[^0-9.]/g, '') });
    return (
        <div>
            <div className="mb-4 grid grid-cols-2 gap-3">
                <div><label className={label} htmlFor="af-start">Starting price (K)</label><input id="af-start" className={field} inputMode="decimal" value={value.start} onChange={money('start')} /></div>
                <div><label className={label} htmlFor="af-step">Bid increment (K)</label><input id="af-step" className={field} inputMode="decimal" value={value.step} onChange={money('step')} /></div>
                <div><label className={label} htmlFor="af-reserve">Reserve (optional)</label><input id="af-reserve" className={field} inputMode="decimal" value={value.reserve} onChange={money('reserve')} placeholder="Lowest you’ll accept" /></div>
                <div><label className={label} htmlFor="af-buy">Buy it now (optional)</label><input id="af-buy" className={field} inputMode="decimal" value={value.buy} onChange={money('buy')} placeholder="End it at once" /></div>
            </div>
            <p className={label}>How long should it run?</p>
            <div className="mb-3 flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                    <button key={d.hours} type="button" onClick={() => onChange({ ...value, hours: d.hours })} className={`rounded-full px-3.5 py-1.5 text-sm transition ${value.hours === d.hours ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>{d.label}</button>
                ))}
            </div>
            <p className="rounded-xl bg-white/70 px-3 py-2.5 text-xs text-[#5F6368]">
                {name ? `“${name}” ` : 'It '}starts at {formatKwacha(Number(value.start) || 0)}. Buyers bid up; when time is up the highest bid wins and pays through a one-time link. A bid in the last 2 minutes adds 2 minutes. You can cancel only until the first bid.
            </p>
        </div>
    );
};
