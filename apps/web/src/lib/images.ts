/**
 * Smaller pictures for the screens that show many of them.
 *
 * A product photo is uploaded once at full size. On a grid of thumbnails that is megabytes the browser has to download and shrink, so
 * Supabase Storage's image service is asked for the size actually needed (`/render/image/` with a width), which is typically a
 * fraction of the bytes. Anything that isn't a Supabase Storage link is returned unchanged.
 */
const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

/** A Supabase public storage URL resized to `width` pixels wide (square-cropped when `square`). */
export function resized(url: string | null | undefined, width: number, opts: { square?: boolean; quality?: number } = {}): string {
    if (!url) return '';
    try {
        const u = new URL(url);
        // Other stores' photos are full-size (Apple's are about 700 KB each): ask their image servers for the size needed.
        if (/(^|\.)storeimages\.cdn-apple\.com$/i.test(u.host)) { u.searchParams.set('wid', String(Math.round(width))); u.searchParams.set('hei', String(Math.round(width))); u.searchParams.set('fmt', 'jpeg'); u.searchParams.set('qlt', '80'); return u.toString(); }
        if (/(^|\.)cdn\.shopify\.com$/i.test(u.host)) { u.searchParams.set('width', String(Math.round(width))); return u.toString(); }
        if (/(^|\.)images\.samsung\.com$/i.test(u.host)) { u.searchParams.set('wid', String(Math.round(width))); u.searchParams.set('fmt', 'webp'); return u.toString(); }
        if (/(^|\.)image-cdn\.beforward\.jp$/i.test(u.host)) return url.replace('/medium/', '/large/'); // cars are judged by their photos: always the large one
        if (!u.pathname.startsWith(OBJECT_PATH) || !/\.supabase\.co$/i.test(u.host)) return url;
        u.pathname = u.pathname.replace(OBJECT_PATH, RENDER_PATH);
        u.searchParams.set('width', String(Math.round(width)));
        if (opts.square) u.searchParams.set('height', String(Math.round(width)));
        u.searchParams.set('resize', 'cover');
        u.searchParams.set('quality', String(opts.quality ?? 72));
        return u.toString();
    } catch {
        return url;
    }
}

/** A `srcset` of the same picture at several widths, so each screen downloads the smallest that still looks sharp. */
export function resizedSet(url: string | null | undefined, widths: number[], opts: { square?: boolean; quality?: number } = {}): string | undefined {
    if (!url) return undefined;
    const first = resized(url, widths[0], opts);
    if (first === url) return undefined; // not resizable
    return widths.map((w) => `${resized(url, w, opts)} ${w}w`).join(', ');
}
