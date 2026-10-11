/**
 * One-off: re-embed organizational AI memory through OpenRouter.
 *
 * Embeddings made before 2026-10-11 came from Google's own API (taskType SEMANTIC_SIMILARITY); the ones made now
 * come from OpenRouter's google/gemini-embedding-001. Same model and size, but the two vector spaces only agree
 * to ~0.75 cosine, so they must not be mixed in the fuzzy-match tier (threshold 0.86).
 *
 * Memory rows only keep a hash of the description, so the text is recovered by hashing every line-item description
 * and matching signatures. Rows whose text can't be recovered get their stale vector cleared: they still match by
 * exact signature, and are re-embedded the next time they are confirmed.
 *
 * Run (after `tsc`): node dist/scripts/reembed_memory.js [--dry]
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { memoryService } from '../services/ai/memory.service';
import { embeddingService } from '../services/ai/embedding.service';

async function main() {
    const dry = process.argv.includes('--dry');
    const { data: rows, error } = await supabase.from('ai_transaction_memory').select('id, description_signature, embedding');
    if (error || !rows) throw new Error(`Could not read memory: ${error?.message}`);

    // signature -> embedding text, from every description we have ever seen.
    const texts = new Map<string, string>();
    const want = new Set(rows.map((r: any) => r.description_signature));
    for (let from = 0; ; from += 1000) {
        const { data, error: liErr } = await supabase.from('line_items').select('description').not('description', 'is', null).range(from, from + 999);
        if (liErr) console.warn(`[reembed] line_items page ${from} failed: ${liErr.message}`);
        if (!data || data.length === 0) break;
        console.log(`[reembed] scanned ${from + data.length} line items, matched ${texts.size}/${want.size}`);
        for (const li of data as any[]) {
            const sig = memoryService.generateSignature(li.description);
            if (want.has(sig) && !texts.has(sig)) texts.set(sig, memoryService.embeddingText(li.description));
        }
        if (data.length < 1000) break;
    }

    let embedded = 0, cleared = 0, failed = 0;
    for (const r of rows as any[]) {
        const text = texts.get(r.description_signature);
        if (!text) {
            if (r.embedding && !dry) await supabase.from('ai_transaction_memory').update({ embedding: null }).eq('id', r.id);
            if (r.embedding) cleared++;
            continue;
        }
        const v = await embeddingService.generateEmbedding(text);
        if ((embedded + failed) % 20 === 0) console.log(`[reembed] progress embedded=${embedded} failed=${failed}`);
        if (!v) { failed++; continue; }
        if (!dry) await supabase.from('ai_transaction_memory').update({ embedding: v }).eq('id', r.id);
        embedded++;
    }
    console.log(`[reembed] rows=${rows.length} recoverable=${texts.size} re-embedded=${embedded} stale-vectors-cleared=${cleared} failed=${failed}${dry ? ' (dry run)' : ''}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
