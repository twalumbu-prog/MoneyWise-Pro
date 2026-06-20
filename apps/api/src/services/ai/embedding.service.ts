const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AI_TEST_MODE = process.env.AI_TEST_MODE === 'true';

// gemini-embedding-001 supports Matryoshka truncation, so we request 1536 dims
// to stay compatible with the existing vector(1536) column / match_ai_memory RPC.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 1536);

export class EmbeddingService {
    /**
     * Generate a vector embedding for a given text using Google Gemini.
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

        if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
            console.warn('[EmbeddingService] Gemini API key missing or default. Skipping embedding.');
            return null;
        }

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: `models/${EMBEDDING_MODEL}`,
                    content: { parts: [{ text: text.replace(/\n/g, ' ') }] },
                    taskType: 'SEMANTIC_SIMILARITY',
                    outputDimensionality: EMBEDDING_DIMENSIONS,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('[EmbeddingService] Gemini Error:', error);
                return null;
            }

            const data = await response.json();
            const values = data?.embedding?.values;
            if (!Array.isArray(values)) {
                console.warn('[EmbeddingService] Gemini returned no embedding values.');
                return null;
            }
            return values;
        } catch (err) {
            console.error('[EmbeddingService] Fetch Error:', err);
            return null;
        }
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
