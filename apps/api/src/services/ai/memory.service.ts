import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { embeddingService } from './embedding.service';

const AI_TEST_MODE = process.env.AI_TEST_MODE === 'true';

// Tokens that carry no categorization signal and only fragment the signature
// (so "KFC Cairo Rd Receipt #4471" and "KFC Manda Hill" collapse to the same vendor).
const NOISE_TOKENS = new Set([
    'ref', 'reference', 'invoice', 'inv', 'receipt', 'rcpt', 'no', 'number',
    'txn', 'transaction', 'trans', 'order', 'ord', 'payment', 'pmt', 'pay',
    'for', 'the', 'of', 'to', 'at', 'on', 'and', 'date', 'qty', 'paid', 'via'
]);

export interface MemoryHit {
    account_id: string;
    confidence: number;
    usage_count: number;
    is_user_verified: boolean;
    method: 'MEMORY_EXACT' | 'MEMORY_VECTOR';
}

export interface MemoryExample {
    description: string;
    account_id: string;
    confidence: number;
}

export const memoryService = {
    /**
     * Canonical, denoised form of a description. Used for BOTH the exact-match
     * signature and the embedding text so that learning and lookup line up.
     * Strips punctuation, pure-number tokens (receipt/store/amount fragments),
     * stray single characters and known noise words.
     */
    canonicalize(description: string): string {
        const base = (description || '').toLowerCase();
        const cleaned = base
            .replace(/[#*]/g, ' ')
            .replace(/[^a-z0-9 ]/g, ' ');
        const tokens = cleaned
            .split(/\s+/)
            .filter(Boolean)
            .filter(t => !/^\d+$/.test(t))     // drop pure numbers (amounts, receipt #s, dates)
            .filter(t => !NOISE_TOKENS.has(t)) // drop noise words
            .filter(t => t.length > 1);        // drop stray single chars
        return tokens.join(' ').trim();
    },

    generateSignature(description: string): string {
        const normalized = this.canonicalize(description) || (description || '').toLowerCase().trim();
        return crypto.createHash('sha256').update(normalized).digest('hex');
    },

    embeddingText(description: string): string {
        return this.canonicalize(description) || (description || '').toLowerCase().trim();
    },

    /**
     * Single write path into organizational memory.
     * `authoritative` = the mapping was confirmed/corrected by a human, so it
     * overwrites any prior mapping and marks the row user-verified.
     */
    async learn(params: {
        organizationId: string;
        description: string;
        accountId: string;
        confidence?: number;
        authoritative?: boolean;
        source?: string;
    }): Promise<void> {
        const { organizationId, description, accountId } = params;
        if (AI_TEST_MODE) return;
        if (!organizationId || !accountId || !description) return;

        try {
            const signature = this.generateSignature(description);
            const sample = this.canonicalize(description) || description.toLowerCase().trim();
            const intent = {
                source: params.source || 'feedback',
                validated: !!params.authoritative,
                sample, // kept so few-shot examples can show a real description, not a hash
            };

            const { error } = await supabase.rpc('learn_transaction_memory', {
                p_org_id: organizationId,
                p_signature: signature,
                p_account_id: accountId,
                p_confidence: params.confidence ?? (params.authoritative ? 1.0 : 0.9),
                p_intent: intent,
                p_authoritative: !!params.authoritative,
            });

            if (error) {
                console.error(`[AI Memory] learn RPC failed for "${sample}":`, error.message);
                return;
            }

            // Embedding is written separately — the proven-safe pattern for pgvector
            // columns via supabase-js (RPC params don't cast number[] -> vector cleanly).
            const embedding = await embeddingService
                .generateEmbedding(this.embeddingText(description))
                .catch(() => null);

            if (embedding) {
                await supabase
                    .from('ai_transaction_memory')
                    .update({ embedding })
                    .eq('organization_id', organizationId)
                    .eq('description_signature', signature);
            }
        } catch (err: any) {
            console.error('[AI Memory] learn error:', err?.message || err);
        }
    },

    /**
     * Learn every categorized line item on a requisition.
     * authoritative=true when the user has reviewed/posted (ground truth).
     */
    async learnFromRequisition(requisitionId: string, opts: { authoritative?: boolean } = {}): Promise<void> {
        try {
            console.log(`[AI Memory] Learning from requisition ${requisitionId} (authoritative=${!!opts.authoritative})`);

            const { data: req } = await supabase
                .from('requisitions')
                .select('organization_id')
                .eq('id', requisitionId)
                .single();

            const organizationId = req?.organization_id;
            if (!organizationId) {
                console.warn(`[AI Memory] No organization for req ${requisitionId}; skipping learn.`);
                return;
            }

            const { data: items, error } = await supabase
                .from('line_items')
                .select('description, account_id')
                .eq('requisition_id', requisitionId);

            if (error) throw error;
            if (!items || items.length === 0) return;

            let learned = 0;
            for (const item of items) {
                if (!item.account_id || !item.description) continue;
                await this.learn({
                    organizationId,
                    description: item.description,
                    accountId: item.account_id,
                    authoritative: opts.authoritative ?? false,
                    confidence: opts.authoritative ? 1.0 : 0.9,
                    source: opts.authoritative ? 'user_confirmed' : 'auto_high_confidence',
                });
                learned++;
            }

            console.log(`[AI Memory] Learned ${learned}/${items.length} item(s) from req ${requisitionId}.`);
        } catch (err) {
            console.error('[AI Memory] learnFromRequisition error:', err);
        }
    },

    /**
     * Org-scoped lookup: exact signature first, then vector similarity.
     */
    async lookup(
        params: string | { description: string; amount?: number; department?: string; organizationId?: string }
    ): Promise<MemoryHit | null> {
        if (AI_TEST_MODE) {
            const description = typeof params === 'string' ? params : params.description;
            const desc = description.toLowerCase();
            // Faithful to the legacy harness: confidence drives the decision path and
            // is_user_verified stays false so threshold semantics are unchanged.
            const hit = (id: string, conf: number): MemoryHit => ({
                account_id: id,
                confidence: conf,
                usage_count: 3,
                is_user_verified: false,
                method: conf >= 0.92 ? 'MEMORY_EXACT' : 'MEMORY_VECTOR',
            });
            if (desc.includes('exact kfc')) return hit('mock-1001', 0.95);
            if (desc.includes('kfc cairo rd')) return hit('mock-1001', 0.86);
            if (desc.includes('kfc') || desc.includes('subway') || desc.includes('pizza') || desc.includes('diner')) return hit('mock-1001', 0.98);
            if (desc.includes('microsoft') || desc.includes('amazon') || desc.includes('oracle') || desc.includes('zesco')) return hit('mock-4000', 0.98);
            if (desc.includes('office') || desc.includes('stationery') || desc.includes('paper')) return hit('mock-6101', 0.98);
            if (desc.includes('uber') || desc.includes('emirates') || desc.includes('hilton') || desc.includes('cab')) return hit('mock-6200', 0.98);
            if (desc.includes('water') || desc.includes('electric') || desc.includes('waste')) return hit('mock-6100', 0.98);
            if (desc.includes('consulting') || desc.includes('fee') || desc.includes('sale') || desc.includes('revenue')) return hit('mock-4100', 0.98);
            if (desc.includes('invoice #123')) return hit('mock-4000', 0.95);
            return null;
        }

        const description = typeof params === 'string' ? params : params.description;
        const organizationId = typeof params === 'string' ? undefined : params.organizationId;

        // Memory is strictly per-organization. Without an org we cannot (and must
        // not) return a cross-tenant memory.
        if (!organizationId || !description) return null;

        try {
            // Tier 1: exact signature
            const signature = this.generateSignature(description);
            const { data: exact } = await supabase
                .from('ai_transaction_memory')
                .select('system_account_id, confidence, usage_count, is_user_verified')
                .eq('organization_id', organizationId)
                .eq('description_signature', signature)
                .maybeSingle();

            if (exact && exact.system_account_id) {
                console.log(`[AI Memory] Exact match (org ${organizationId}): ${exact.system_account_id}`);
                return {
                    account_id: exact.system_account_id,
                    confidence: exact.is_user_verified ? 1.0 : Number(exact.confidence) || 0.9,
                    usage_count: exact.usage_count || 1,
                    is_user_verified: !!exact.is_user_verified,
                    method: 'MEMORY_EXACT',
                };
            }

            // Tier 2: vector similarity (org-scoped)
            const embedding = await embeddingService.generateEmbedding(this.embeddingText(description));
            if (embedding) {
                const { data: sims, error: simError } = await supabase.rpc('match_ai_memory', {
                    query_embedding: embedding,
                    match_threshold: 0.86,
                    match_count: 1,
                    p_org_id: organizationId,
                });

                if (!simError && sims && sims.length > 0) {
                    const m = sims[0];
                    console.log(`[AI Memory] Vector match: ${m.system_account_id} (sim ${m.similarity})`);
                    return {
                        account_id: m.system_account_id,
                        confidence: Number(m.similarity),
                        usage_count: m.usage_count || 1,
                        is_user_verified: !!m.is_user_verified,
                        method: 'MEMORY_VECTOR',
                    };
                }
            }

            return null;
        } catch (err) {
            console.error('[AI Memory] lookup error:', err);
            return null;
        }
    },

    /**
     * Retrieve the org's most similar past categorizations to use as few-shot
     * grounding for the LLM tier. Returns real descriptions + the account each
     * was mapped to.
     */
    async getExamples(organizationId: string, description: string, k = 5): Promise<MemoryExample[]> {
        if (AI_TEST_MODE || !organizationId || !description) return [];
        try {
            const embedding = await embeddingService.generateEmbedding(this.embeddingText(description));
            if (!embedding) return [];

            const { data: sims, error } = await supabase.rpc('match_ai_memory', {
                query_embedding: embedding,
                match_threshold: 0.5, // looser than lookup — these are hints, not decisions
                match_count: k,
                p_org_id: organizationId,
            });
            if (error || !sims || sims.length === 0) return [];

            const ids = [...new Set(sims.map((s: any) => s.id).filter(Boolean))];
            if (ids.length === 0) return [];

            const { data: rows } = await supabase
                .from('ai_transaction_memory')
                .select('id, intent, system_account_id, confidence')
                .in('id', ids);

            const examples: MemoryExample[] = [];
            for (const row of rows || []) {
                const sample = (row.intent as any)?.sample;
                if (!sample || !row.system_account_id) continue;
                examples.push({
                    description: sample,
                    account_id: row.system_account_id,
                    confidence: Number(row.confidence) || 0.9,
                });
            }
            return examples;
        } catch (err) {
            console.error('[AI Memory] getExamples error:', err);
            return [];
        }
    },
};
