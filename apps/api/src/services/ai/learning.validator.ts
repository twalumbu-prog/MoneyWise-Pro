export interface LearningContext {
    isPostedToQB: boolean;
    wasOverridden: boolean;
    confidence: number;
    method: string;
    usageCount?: number;
    vectorSimilarity?: number;
}

export class LearningValidator {
    private MIN_LEARNING_CONFIDENCE = 0.80;
    private MIN_USAGE_COUNT = 2;
    private MIN_VECTOR_SIMILARITY = 0.90;

    /**
     * Determines if a transaction is safe to be used for organizational learning.
     * Criteria (All must be true):
     * - Posted to QB (Verified Ground Truth)
     * - No manual override occurred
     * - Confidence >= 0.80
     * - AND (usage_count >= 2 OR similar transaction seen before with sim >= 0.90)
     */
    isSafeToLearn(context: LearningContext): boolean {
        // 1. Transaction must be finalized in the accounting system
        if (!context.isPostedToQB) {
            console.log('[LearningValidator] Rejected: Not posted to QB');
            return false;
        }

        // 2. Strict override check
        if (context.wasOverridden) {
            console.log('[LearningValidator] Rejected: Manual override detected');
            return false;
        }

        // 3. Confidence threshold
        if (context.confidence < this.MIN_LEARNING_CONFIDENCE) {
            console.log(`[LearningValidator] Rejected: Low confidence (${context.confidence})`);
            return false;
        }

        // 4. Frequency or Similarity Threshold (Prevent one-off poison)
        const hasFrequency = (context.usageCount || 0) >= this.MIN_USAGE_COUNT;
        const hasHighSimilarity = (context.vectorSimilarity || 0) >= this.MIN_VECTOR_SIMILARITY;

        if (!hasFrequency && !hasHighSimilarity) {
            console.log('[LearningValidator] Rejected: Insufficient frequency (count < 2) and no high-similarity base (sim < 0.90)');
            return false;
        }

        return true;
    }
}

export const learningValidator = new LearningValidator();
