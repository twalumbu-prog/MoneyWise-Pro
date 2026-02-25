import { AIScenario } from '../types';

export const ruleScenarios: AIScenario[] = [
    {
        name: 'Rule: Continue on Medium Confidence',
        input: { description: 'Office Supplies Inc', amount: 500.00 },
        expected: {
            // Rule confidence 0.89 should not terminate (threshold is 0.90 after normalization)
            decision_path: 'RULE',
            max_confidence: 0.8999
        }
    },
    {
        name: 'Rule: Terminate on High Confidence',
        input: { description: 'RENT PAYMENT FEB', amount: 5000.00 },
        expected: {
            // Rule confidence >= 0.90 should stop the flow
            decision_path: 'RULE',
            min_confidence: 0.90,
            requires_review: false
        }
    }
];
