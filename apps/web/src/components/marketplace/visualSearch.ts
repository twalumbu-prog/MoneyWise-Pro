import { resized } from '../../lib/images';
import type { Listing } from './parts';

/**
 * Finding items that look like a photo without any AI service: each picture is reduced to a small fingerprint (its average colours in a
 * 4 by 4 grid, plus how its hues are spread), and listings are ranked by how close their fingerprint is to the photo's. It matches
 * colour and layout, not meaning (a red dress and a red bag can look alike), which is why the AI search is better when it is on.
 */
const GRID = 4;
const HUES = 12;
const cache = new Map<string, number[] | null>();

function fingerprint(src: string): Promise<number[] | null> {
    if (cache.has(src)) return Promise.resolve(cache.get(src)!);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const size = 32;
                const c = document.createElement('canvas');
                c.width = c.height = size;
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (!ctx) return resolve(null);
                // Fill the square, cropping the middle, so wide and tall pictures compare fairly.
                const s = Math.min(img.width, img.height);
                ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
                const { data } = ctx.getImageData(0, 0, size, size);
                const cell = size / GRID;
                const sums = Array.from({ length: GRID * GRID }, () => [0, 0, 0, 0]);
                const hues = new Array(HUES).fill(0);
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const i = (y * size + x) * 4;
                        const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
                        const k = Math.floor(y / cell) * GRID + Math.floor(x / cell);
                        sums[k][0] += r; sums[k][1] += g; sums[k][2] += b; sums[k][3] += 1;
                        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
                        if (d > 0.12 && max > 0.15) {
                            const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
                            hues[Math.floor((h / 6) * HUES) % HUES] += d;
                        }
                    }
                }
                const total = hues.reduce((a, b) => a + b, 0) || 1;
                const fp = [...sums.flatMap(([r, g, b, n]) => [r / n, g / n, b / n]), ...hues.map((h) => h / total)];
                cache.set(src, fp);
                resolve(fp);
            } catch { cache.set(src, null); resolve(null); } // a picture the browser won't let us read
        };
        img.onerror = () => { cache.set(src, null); resolve(null); };
        img.src = src;
    });
}

const distance = (a: number[], b: number[]): number => {
    let grid = 0, hue = 0;
    const gridLen = GRID * GRID * 3;
    for (let i = 0; i < gridLen; i++) grid += (a[i] - b[i]) ** 2;
    for (let i = gridLen; i < a.length; i++) hue += Math.abs(a[i] - b[i]);
    return Math.sqrt(grid / gridLen) + 0.6 * (hue / 2);
};

/** The listings whose pictures look most like this one, best first. Throws if the photo itself can't be read. */
export async function findLookalikes(photo: string, listings: Listing[], limit = 24): Promise<string[]> {
    const target = await fingerprint(photo);
    if (!target) throw new Error('We couldn’t read that picture here. Upload the file itself instead of a link.');
    const withPictures = listings.filter((l) => l.imageUrl).slice(0, 120);
    const scored: { id: string; d: number }[] = [];
    for (let i = 0; i < withPictures.length; i += 12) {
        await Promise.all(withPictures.slice(i, i + 12).map(async (l) => {
            const fp = await fingerprint(resized(l.imageUrl!, 64, { square: true }));
            if (fp) scored.push({ id: l.id, d: distance(target, fp) });
        }));
    }
    return scored.sort((a, b) => a.d - b.d).slice(0, limit).map((s) => s.id);
}
