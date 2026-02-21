export interface LearningContext {
    isPostedToQB: boolean;
    wasOverridden: boolean;
    confidence: number;
    method: string;
}

export class LearningValidator {
    private MIN_LEARNING_CONFIDENCE = 0.80;

    /**
     * Determines if a transaction is safe to be used for organizational learning.
     * Criteria:
     * - Posted to QB (Verified Ground Truth)
     * - No manual override after AI suggestion (unless it's the correction we are learning from)
     * - High enough confidence
     */
    isSafeToLearn(context: LearningContext): boolean {
        // 1. Transaction must be finalized in the accounting system
        if (!context.isPostedToQB) return false;

        // 2. If it was overridden, it's safe to learn the correction IF we explicitly want to learn from the human fix.
        // However, the user's CRITICAL RULE says:
        // "The system must ONLY learn when: Transaction is posted to QB AND no override occurred AND confidence >= 0.80"

        if (context.wasOverridden) return false;

        if (context.confidence < this.MIN_LEARNING_CONFIDENCE) return false;

        return true;
    }
}

export const learningValidator = new LearningValidator();
