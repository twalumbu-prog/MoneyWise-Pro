import { AIScenario } from '../types';

export const learningScenarios: AIScenario[] = [
    {
        name: 'Learning: Reject Override',
        input: { description: 'Overridden Item', amount: 100 },
        expected: {
            should_learn: false // Overridden transactions must not poison memory
        }
    },
    {
        name: 'Learning: Reject Low Confidence',
        input: { description: 'Low Confidence Item', amount: 200 },
        expected: {
            should_learn: false // Confidence < 0.80 rejected
        }
    },
    {
        name: 'Learning: Reject Low Frequency',
        input: { description: 'One-off Transaction', amount: 300 },
        expected: {
            should_learn: false // usage_count < 2 and no similar history
        }
    },
    {
        name: 'Learning: Approve Ground Truth',
        input: { description: 'Repeated Valid Transaction', amount: 400 },
        expected: {
            should_learn: true // Posted, no override, high confidence, reliable
        }
    }
];
