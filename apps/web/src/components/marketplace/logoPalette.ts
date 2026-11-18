/**
 * The main colour of a company's logo, so a cover made for an item with no photo carries the company's own colours.
 * Read in the browser from the logo picture (storage serves it with open CORS). Cached per logo. When no colour can be read (a failed
 * load, a plain black or white logo) it returns null and the cover falls back to its own palette.
 */
export interface LogoColour { h: number; s: number }

const cache = new Map<string, LogoColour | null>();
const inflight = new Map<string, Promise<LogoColour | null>>();

export const cachedLogoColour = (url: string | null | undefined): LogoColour | null | undefined => (url ? cache.get(url) : null);

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
}

export function logoColour(url: string): Promise<LogoColour | null> {
    if (cache.has(url)) return Promise.resolve(cache.get(url)!);
    const pending = inflight.get(url);
    if (pending) return pending;
    const job = new Promise<LogoColour | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const size = 28;
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return resolve(null);
                ctx.drawImage(img, 0, 0, size, size);
                const { data } = ctx.getImageData(0, 0, size, size);
                // Twelve hue buckets; only colourful, mid-light pixels count (white, black and grey are background, not brand).
                const buckets = Array.from({ length: 12 }, () => ({ w: 0, s: 0, x: 0, y: 0 }));
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 200) continue;
                    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                    if (s < 0.28 || l < 0.14 || l > 0.9) continue;
                    const b = buckets[Math.floor(h / 30) % 12];
                    const w = s * (1 - Math.abs(l - 0.5));
                    b.w += w; b.s += s * w; b.x += Math.cos((h * Math.PI) / 180) * w; b.y += Math.sin((h * Math.PI) / 180) * w;
                }
                const top = buckets.reduce((a, b) => (b.w > a.w ? b : a));
                if (top.w < 0.6) return resolve(null);
                resolve({ h: (Math.atan2(top.y, top.x) * 180 / Math.PI + 360) % 360, s: Math.min(0.9, Math.max(0.5, top.s / top.w)) });
            } catch { resolve(null); } // a picture the browser won't let us read
        };
        img.onerror = () => resolve(null);
        img.src = url;
    }).then((c) => { cache.set(url, c); inflight.delete(url); return c; });
    inflight.set(url, job);
    return job;
}

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

/** A full colour set built on the logo's colour: dark with a bright accent, or a pale tint with a deep accent. */
export function paletteFrom(c: LogoColour, dark: boolean): { bg: string; fg: string; accent: string; soft: string } {
    return dark
        ? { bg: hsl(c.h, Math.min(c.s, 0.55), 0.13), soft: hsl(c.h, Math.min(c.s, 0.5), 0.22), accent: hsl(c.h, c.s, 0.56), fg: hsl(c.h, 0.3, 0.96) }
        : { bg: hsl(c.h, 0.65, 0.94), soft: hsl(c.h, 0.55, 0.85), accent: hsl(c.h, c.s, 0.46), fg: hsl(c.h, 0.7, 0.15) };
}
