const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_TEST_MODE = process.env.AI_TEST_MODE === 'true';

export class EmbeddingService {
    /**
     * Generate a vector embedding for a given text using OpenAI.
     */
    async generateEmbedding(text: string): Promise<number[] | null> {
        if (AI_TEST_MODE) {
            // Generate a deterministic mock vector (1536 dims) for testing
            // Simple hash-like approach: fill with a deterministic pattern
            const mockVector = new Array(1536).fill(0);
            for (let i = 0; i < text.length; i++) {
                mockVector[i % 1536] += text.charCodeAt(i) / 255;
            }
            return mockVector;
        }

        if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY') {
            console.warn('[EmbeddingService] OpenAI API Key missing or default. Skipping embedding.');
            return null;
        }

        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input: text.replace(/\n/g, ' '),
                    model: 'text-embedding-3-small' // 1536 dimensions
                })
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('[EmbeddingService] OpenAI Error:', error);
                return null;
            }

            const data = await response.json();
            return data.data[0].embedding;
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
