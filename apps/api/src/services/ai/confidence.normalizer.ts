export class ConfidenceNormalizer {
    /**
     * Memory matches are authoritative and usually high quality.
     * Factor: 1.0 (No reduction)
     */
    normalizeMemory(similarity: number): number {
        return this.clamp(similarity);
    }

    /**
     * Rules are deterministic but may have overlapping edge cases.
     * Factor: 0.97
     */
    normalizeRule(confidence: number): number {
        return this.clamp(confidence * 0.97);
    }

    /**
     * AI models are high-effort but can hallucinate or be overconfident.
     * Factor: 0.90
     */
    normalizeAI(confidence: number): number {
        return this.clamp(confidence * 0.90);
    }

    /**
     * Clamps values between 0.0 and 0.99 to prevent false 100% certainty
     * unless explicitly manually verified.
     */
    private clamp(value: number): number {
        return Math.min(Math.max(value, 0), 0.99);
    }
}

export const confidenceNormalizer = new ConfidenceNormalizer();
