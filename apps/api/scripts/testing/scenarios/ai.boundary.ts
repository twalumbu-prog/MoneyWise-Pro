import { AIScenario } from '../types';

export const aiScenarios: AIScenario[] = [
    {
        name: 'AI: Review Required on Medium Confidence',
        input: { description: 'Unusual Software Subscription', amount: 299.00 },
        expected: {
            // AI confidence 0.75 should require review
            decision_path: 'AI',
            min_confidence: 0.70,
            max_confidence: 0.8999,
            requires_review: true
        }
    },
    {
        name: 'AI: Stop on High Confidence',
        input: { description: 'Standard Utility Bill', amount: 1200.00 },
        expected: {
            // AI confidence 0.95 should not require review
            decision_path: 'AI',
            min_confidence: 0.90,
            requires_review: false
        }
    }
];
