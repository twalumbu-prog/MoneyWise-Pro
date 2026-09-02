export type InvestProductType = 'UNIT_TRUST' | 'FIXED_DEPOSIT' | 'BOND';

export interface PricePoint {
    t: number;
    price: number;
}

export type Timeframe = '1D' | '1W' | '1M' | '3M' | 'YTD';

function hashStringToSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) || 1;
}

function makeRng(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function gaussian(rand: () => number): number {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Brownian bridge in log-space: a random walk that starts at startPrice and
 * ends exactly at endPrice after `days` steps, with volatility `vol` (daily stdev).
 */
function brownianBridge(startPrice: number, endPrice: number, days: number, vol: number, rand: () => number): number[] {
    if (days <= 1) return [startPrice, endPrice].slice(0, days + 1);
    const w: number[] = [0];
    for (let i = 1; i <= days; i++) {
        w.push(w[i - 1] + gaussian(rand) * vol);
    }
    const wEnd = w[days];
    const logStart = Math.log(startPrice);
    const logEnd = Math.log(endPrice);
    const out: number[] = [];
    for (let i = 0; i <= days; i++) {
        const bridge = w[i] - (i / days) * wEnd;
        const logPrice = logStart + (i / days) * (logEnd - logStart) + bridge;
        out.push(Math.exp(logPrice));
    }
    return out;
}

const VOLATILITY: Record<InvestProductType, number> = {
    UNIT_TRUST: 0.016,
    BOND: 0.006,
    FIXED_DEPOSIT: 0.0012,
};

const HISTORICAL_GROWTH_RANGE: Record<InvestProductType, [number, number]> = {
    UNIT_TRUST: [0.25, 0.65],
    BOND: [0.1, 0.3],
    FIXED_DEPOSIT: [0.05, 0.15],
};

function parsePrice(priceStr: string): number {
    return parseFloat(priceStr.replace(/[K,]/g, '')) || 100;
}

function parseYtdPercent(ytdStr: string): number {
    const m = ytdStr.match(/(-?\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : 15;
}

const DAY_MS = 86400000;

/**
 * Generates ~3 years of daily synthetic price history ending exactly at the
 * product's current listed price, with the Jan-1-this-year price anchored so
 * that the YTD slice reproduces the product's displayed YTD % change.
 */
export function generateDailyHistory(productId: string, priceStr: string, ytdStr: string, type: InvestProductType): PricePoint[] {
    const rand = makeRng(hashStringToSeed(productId));
    const todayPrice = parsePrice(priceStr);
    const ytdPercent = parseYtdPercent(ytdStr);
    const vol = VOLATILITY[type];

    const now = Date.now();
    const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
    const daysThisYear = Math.max(1, Math.round((now - yearStart) / DAY_MS));

    const yearStartPrice = todayPrice / (1 + ytdPercent / 100);

    const [growMin, growMax] = HISTORICAL_GROWTH_RANGE[type];
    const growthFactor = 1 + growMin + rand() * (growMax - growMin);
    const daysSegmentA = Math.max(1, 365 * 3 - daysThisYear);
    const historyStartPrice = yearStartPrice / growthFactor;
    const segmentA = brownianBridge(historyStartPrice, yearStartPrice, daysSegmentA, vol, rand);

    const segmentB = brownianBridge(yearStartPrice, todayPrice, daysThisYear, vol, rand);

    const startTime = now - (daysSegmentA + daysThisYear) * DAY_MS;
    const prices = [...segmentA, ...segmentB.slice(1)];

    return prices.map((price, i) => ({
        t: startTime + i * DAY_MS,
        price: Math.round(price * 100) / 100,
    }));
}

/**
 * Synthesizes 24 hourly points for "today", interpolating from yesterday's
 * close to today's official close price with small noise, ending exactly at
 * the current price.
 */
export function generateIntradayHistory(productId: string, daily: PricePoint[]): PricePoint[] {
    const rand = makeRng(hashStringToSeed(productId + '-1d'));
    if (daily.length < 2) return daily;

    const todayPrice = daily[daily.length - 1].price;
    const prevClose = daily[daily.length - 2].price;
    const now = Date.now();
    const hourMs = 3600000;
    const hours = 24;
    const points: PricePoint[] = [];

    for (let i = 0; i < hours; i++) {
        const progress = i / (hours - 1);
        const target = prevClose + (todayPrice - prevClose) * progress;
        const noise = gaussian(rand) * todayPrice * 0.0035;
        const price = i === hours - 1 ? todayPrice : target + noise;
        points.push({ t: now - (hours - 1 - i) * hourMs, price: Math.round(price * 100) / 100 });
    }
    return points;
}

export function sliceForTimeframe(daily: PricePoint[], intraday: PricePoint[], tf: Timeframe): PricePoint[] {
    if (tf === '1D') return intraday;

    const now = Date.now();
    let cutoff: number;
    switch (tf) {
        case '1W': cutoff = now - 7 * DAY_MS; break;
        case '1M': cutoff = now - 30 * DAY_MS; break;
        case '3M': cutoff = now - 90 * DAY_MS; break;
        case 'YTD': cutoff = new Date(new Date(now).getFullYear(), 0, 1).getTime(); break;
    }
    const sliced = daily.filter((p) => p.t >= cutoff);
    return sliced.length >= 2 ? sliced : daily.slice(-2);
}

export function formatAxisDate(t: number, tf: Timeframe): string {
    const d = new Date(t);
    if (tf === '1D') return d.toLocaleTimeString([], { hour: 'numeric' });
    if (tf === '1W') return d.toLocaleDateString([], { weekday: 'short' });
    if (tf === '1M' || tf === '3M') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { month: 'short' });
}
