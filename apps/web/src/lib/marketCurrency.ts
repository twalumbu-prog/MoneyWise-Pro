import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';

/**
 * Which currency the Marketplace shows prices in, and the converter behind it.
 * Everything inside the Marketplace is worked out in kwacha; this only changes how a price is SHOWN. A dollar-priced item shows its own dollar
 * price; anything else is converted at today's rate and marked "≈". The choice is remembered; the first time, someone browsing from outside
 * Zambia (by their device's time zone) sees dollars and everyone else sees kwacha. With no dollar rate set, kwacha is shown.
 */
export type MarketDisplay = 'ZMW' | 'USD';
const KEY = 'mw_market_currency';

let rate: number | null = null;
let chosen: MarketDisplay | null = (() => { try { const v = localStorage.getItem(KEY); return v === 'USD' || v === 'ZMW' ? v : null; } catch { return null; } })();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Where the device says it is: Zambia (or unknown) counts as local. */
export function looksLocal(): boolean {
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; return !tz || tz === 'Africa/Lusaka'; } catch { return true; }
}

export function displayCurrency(): MarketDisplay {
    if (!rate) return 'ZMW';
    return chosen ?? (looksLocal() ? 'ZMW' : 'USD');
}

export function setMarketRate(next: number | null | undefined) {
    const n = next && next > 0 ? next : null;
    if (n === rate) return;
    rate = n; snapshot = key(); emit();
}

export function setMarketDisplay(next: MarketDisplay) {
    chosen = next;
    try { localStorage.setItem(KEY, next); } catch { /* the choice just isn't remembered */ }
    snapshot = key(); emit();
}

/** Converts kwacha to dollars at the shared rate (null when there is no rate). */
export const kwachaToUsd = (zmw: number): number | null => (rate ? Math.round((zmw / rate) * 100) / 100 : null);

/**
 * A price for display. `zmw` is the kwacha amount; `usd` is the item's own dollar price when it has one.
 * In dollars: the item's own dollar price, or the kwacha amount converted (shown with "≈"). In kwacha: the kwacha amount.
 */
export function moneyText(zmw: number, usd?: number | null): string {
    // A dollar-priced item shown in kwacha keeps its own dollar price beside it, so the seller and buyer both see what it was priced at.
    if (displayCurrency() !== 'USD' && usd != null && usd > 0) return `${formatKwacha(zmw)} · $${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (displayCurrency() === 'USD' && rate) {
        const own = usd != null && usd > 0;
        const v = own ? usd! : Math.round((zmw / rate) * 100) / 100;
        return `${own ? '' : '≈ '}$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return formatKwacha(zmw);
}

/** An amount on an auction, in the auction's OWN currency (every bid is in it): $50.00 or K1,350.00. */
export function auctionMoney(amount: number, currency?: string | null): string {
    if (String(currency).toUpperCase() === 'USD') return `$${(Number(amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return formatKwacha(amount);
}
export const currencySymbol = (currency?: string | null) => (String(currency).toUpperCase() === 'USD' ? '$' : 'K');

let snapshot = '';
const key = () => `${displayCurrency()}|${rate ?? ''}`;
snapshot = key();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Re-renders when the display currency or the rate changes. The rate comes with the listings (the same cached request every Marketplace page makes). */
export function useMarketCurrency(): { display: MarketDisplay; rate: number | null; canUsd: boolean } {
    const { data } = useQuery({ queryKey: ['marketplace', 'listings'], queryFn: () => apiJson<{ dollarRate?: number | null }>('/marketplace/listings'), staleTime: 60_000 });
    const r = data?.dollarRate ?? null;
    useEffect(() => { setMarketRate(r); }, [r]);
    useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
    return { display: displayCurrency(), rate, canUsd: !!rate };
}
