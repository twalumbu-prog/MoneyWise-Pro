/**
 * Tries a sample of catalogue photos per image host, the way a browser on our site would ask for them (with our page as the referrer),
 * and again with no referrer. Read-only. Run: npx tsx src/scripts/check_images.ts
 */
import { supabase } from '../lib/supabase';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const probe = async (url: string, referer?: string) => {
    try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*', ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(15_000) });
        const type = r.headers.get('content-type') ?? '';
        const buf = r.ok ? (await r.arrayBuffer()).byteLength : 0;
        return `${r.status} ${type.split(';')[0]} ${buf}B`;
    } catch (e: any) { return `ERR ${e.cause?.code ?? e.message}`; }
};

(async () => {
    const rows: any[] = [];
    for (let from = 0; from < 4000; from += 1000) {
        const { data } = await supabase.from('imported_products').select('source, images, is_active, listed').eq('is_active', true).eq('listed', true).order('id').range(from, from + 999);
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
    }
    const byHost = new Map<string, { urls: string[]; empty: number; total: number }>();
    for (const r of rows) {
        const first = Array.isArray(r.images) ? r.images[0] : null;
        let host = '(no image)';
        try { if (first) host = new URL(first).host; } catch { host = '(bad url)'; }
        const e = byHost.get(host) ?? { urls: [], empty: 0, total: 0 };
        e.total++;
        if (!first) e.empty++; else if (e.urls.length < 3) e.urls.push(first);
        byHost.set(host, e);
    }
    for (const [host, e] of [...byHost].sort((a, b) => b[1].total - a[1].total)) {
        console.log(`\n${host}  (${e.total} items${e.empty ? `, ${e.empty} without an image` : ''})`);
        for (const u of e.urls) console.log(`   with our referrer: ${await probe(u, 'http://localhost:5173/')}   | no referrer: ${await probe(u)}   ${u.slice(0, 90)}`);
    }
    process.exit(0);
})();
