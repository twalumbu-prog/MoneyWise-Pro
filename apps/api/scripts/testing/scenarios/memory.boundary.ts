import { AIScenario } from '../types';

export const memoryScenarios: AIScenario[] = [
    {
        name: 'Memory: Ignore Low Similarity',
        input: { description: 'Random Coffee Shop', amount: 45.00 },
        expected: {
            // Should not hit memory if similarity < 0.85
            decision_path: 'FAILED', // Assuming no rules/AI configured for this
        }
    },
    {
        name: 'Memory: Weak Hint Threshold',
        input: { description: 'KFC Cairo Rd (Near Match)', amount: 150.00 },
        expected: {
            // Similarity 0.86 should be MEMORY_WEAK, allowing flow to continue
            decision_path: 'MEMORY_WEAK',
            min_confidence: 0.85,
            max_confidence: 0.9199
        }
    },
    {
        name: 'Memory: High Confidence Termination',
        input: { description: 'Exact KFC Match', amount: 150.00 },
        expected: {
            // Similarity >= 0.92 should terminate as MEMORY
            decision_path: 'MEMORY',
            min_confidence: 0.92,
            requires_review: false
        }
    }
];
