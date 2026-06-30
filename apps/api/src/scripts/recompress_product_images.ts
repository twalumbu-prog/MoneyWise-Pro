import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env BEFORE other imports
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { supabase } from '../lib/supabase';

/**
 * One-off remediation (2026-06, owner-approved): existing product images were
 * uploaded at full resolution (multi-MB photos shown in ~150px thumbnails on the
 * public portal), so they loaded slowly. ProductSettings now compresses new
 * uploads; this script back-fills existing ones.
 *
 * For each product image it: downloads the original, downscales to ≤1000px and
 * re-encodes as JPEG q72 using the macOS `sips` tool (no extra npm dependency),
 * uploads the smaller file to a new path, and repoints products.image_url.
 *
 * Safe + idempotent:
 *  - skips images already re-compressed (path contains `product-rc-`)
 *  - skips when the result isn't meaningfully smaller (<10% saving)
 *  - keeps the old file (just repoints the URL) so nothing breaks mid-run
 *
 * Run: cd apps/api && npx ts-node src/scripts/recompress_product_images.ts
 */

const BUCKET = 'product-images';
const MAX_DIM = 1000;
const QUALITY = 72;

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)}KB`;

async function run() {
    console.log('[Recompress] Loading products with images…');
    const { data: products, error } = await supabase
        .from('products')
        .select('id, organization_id, image_url, name')
        .not('image_url', 'is', null);

    if (error) throw error;
    if (!products || products.length === 0) {
        console.log('[Recompress] No product images found.');
        return;
    }

    let processed = 0, skipped = 0, failed = 0, savedBytes = 0;

    for (const p of products as any[]) {
        const url: string = p.image_url;
        if (!url || url.includes('/product-rc-')) { skipped++; continue; }

        const tmp = mkdtempSync(path.join(tmpdir(), 'rc-'));
        const inPath = path.join(tmp, 'in');
        const outPath = path.join(tmp, 'out.jpg');
        try {
            const res = await fetch(url);
            if (!res.ok) { console.warn(`  • ${p.name}: download ${res.status}, skipping`); skipped++; continue; }
            const original = Buffer.from(await res.arrayBuffer());
            writeFileSync(inPath, original);

            // Downscale (never upscales) + re-encode JPEG.
            execFileSync('sips', [
                '-s', 'format', 'jpeg',
                '-s', 'formatOptions', String(QUALITY),
                '-Z', String(MAX_DIM),
                inPath, '--out', outPath
            ], { stdio: 'ignore' });

            const out = readFileSync(outPath);
            if (out.length >= original.length * 0.9) {
                console.log(`  • ${p.name}: already small (${kb(original.length)}), skipping`);
                skipped++;
                continue;
            }

            const folder = p.organization_id || 'shared';
            const newPath = `${folder}/product-rc-${p.id}-${Date.now()}.jpg`;
            const { error: upErr } = await supabase.storage
                .from(BUCKET)
                .upload(newPath, out, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
            if (upErr) { console.error(`  • ${p.name}: upload failed — ${upErr.message}`); failed++; continue; }

            const newUrl = supabase.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
            const { error: updErr } = await supabase
                .from('products')
                .update({ image_url: newUrl, updated_at: new Date().toISOString() })
                .eq('id', p.id);
            if (updErr) { console.error(`  • ${p.name}: db update failed — ${updErr.message}`); failed++; continue; }

            savedBytes += original.length - out.length;
            processed++;
            console.log(`  ✓ ${p.name}: ${kb(original.length)} → ${kb(out.length)}`);
        } catch (err: any) {
            console.error(`  • ${p.name}: error — ${err.message}`);
            failed++;
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    }

    console.log(`\n[Recompress] Done. processed=${processed} skipped=${skipped} failed=${failed} saved=${kb(savedBytes)}`);
}

run().then(() => process.exit(0)).catch((e) => { console.error('[Recompress] Fatal:', e); process.exit(1); });
