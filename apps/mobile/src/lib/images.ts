/**
 * Smaller pictures for the screens that show many of them. Same idea as the web's lib/images.ts, written with plain string handling
 * because React Native's URL support is partial. Anything it doesn't recognise is returned unchanged.
 */
const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

const withParams = (url: string, params: Record<string, string | number>) => {
    const [base, query = ''] = url.split('?');
    const kept = query.split('&').filter((p) => p && !(p.split('=')[0] in params));
    const added = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    return `${base}?${[...kept, ...added].join('&')}`;
};

export function resized(url: string | null | undefined, width: number, opts: { square?: boolean; quality?: number } = {}): string {
    if (!url) return '';
    const m = url.match(/^https?:\/\/([^/?#]+)/i);
    if (!m) return url;
    const host = m[1].toLowerCase();
    const w = Math.round(width);
    if (/(^|\.)storeimages\.cdn-apple\.com$/.test(host)) return withParams(url, { wid: w, hei: w, fmt: 'jpeg' });
    if (/(^|\.)cdn\.shopify\.com$/.test(host)) return withParams(url, { width: w });
    if (/(^|\.)images\.samsung\.com$/.test(host)) return withParams(url, { wid: w, fmt: 'webp' });
    if (/(^|\.)image-cdn\.beforward\.jp$/.test(host)) return url.replace('/medium/', '/large/');
    if (!url.includes(OBJECT_PATH) || !/\.supabase\.co$/.test(host)) return url;
    return withParams(url.replace(OBJECT_PATH, RENDER_PATH), { width: w, ...(opts.square ? { height: w } : {}), resize: 'cover', quality: opts.quality ?? 72 });
}
