const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_TEST_MODE = process.env.AI_TEST_MODE === 'true';

// Embeddings go through OpenRouter (no direct Google key / billing needed). The model is still Google's
// gemini-embedding-001, truncated to 1536 dims to fit the existing vector(1536) column / match_ai_memory RPC.
// NOTE: vectors from this endpoint are NOT interchangeable with ones made earlier through Google's own API
// (that call used taskType SEMANTIC_SIMILARITY) — see scripts/reembed_memory.ts, which re-embedded the memory.
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'google/gemini-embedding-001';
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 1536);

export class EmbeddingService {
    /**
     * Generate a vector embedding for a given text through OpenRouter.
     */
    async generateEmbedding(text: string): Promise<number[] | null> {
        if (AI_TEST_MODE) {
            // Deterministic mock vector matching the configured dimension.
            const mockVector = new Array(EMBEDDING_DIMENSIONS).fill(0);
            for (let i = 0; i < text.length; i++) {
                mockVector[i % EMBEDDING_DIMENSIONS] += text.charCodeAt(i) / 255;
            }
            return mockVector;
        }

        if (!OPENROUTER_API_KEY) {
            console.warn('[EmbeddingService] OPENROUTER_API_KEY missing. Skipping embedding.');
            return null;
        }

        for (let attempt = 0; attempt < 2; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10_000);
            try {
                const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'https://moneywise.blueopus.cloud',
                        'X-Title': 'MoneyWise Pro',
                    },
                    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.replace(/\n/g, ' '), dimensions: EMBEDDING_DIMENSIONS }),
                    signal: controller.signal as any,
                });
                clearTimeout(timer);

                if (!response.ok) {
                    const error = await response.text();
                    console.error(`[EmbeddingService] OpenRouter ${response.status}:`, error.slice(0, 300));
                    if (response.status >= 500 || response.status === 429) continue; // transient: one retry
                    return null;
                }

                const data: any = await response.json();
                const values = data?.data?.[0]?.embedding;
                if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
                    console.warn('[EmbeddingService] OpenRouter returned an unexpected embedding.');
                    return null;
                }
                return values;
            } catch (err) {
                clearTimeout(timer);
                if (attempt === 1) console.error('[EmbeddingService] Fetch Error:', err);
            }
        }
        return null;
    }

    /**
     * Formats transaction data into a string suitable for embedding.
     */
    formatForEmbedding(data: {
        description: string;
        vendor?: string;
        department?: string;
        amount?: number;
    }): string {
        const parts = [
            `Description: ${data.description.toLowerCase().trim()}`
        ];

        if (data.vendor) parts.push(`Vendor: ${data.vendor.toLowerCase().trim()}`);
        if (data.department) parts.push(`Dept: ${data.department.toLowerCase().trim()}`);

        if (data.amount !== undefined) {
            // Bucket amounts to help similarity (e.g., small, medium, large)
            let bucket = 'small';
            if (data.amount > 1000) bucket = 'large';
            else if (data.amount > 100) bucket = 'medium';
            parts.push(`Size: ${bucket}`);
        }

        return parts.join(' | ');
    }
}

export const embeddingService = new EmbeddingService();
