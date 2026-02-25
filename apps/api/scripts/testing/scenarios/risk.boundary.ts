import { AIScenario } from '../types';

export const riskScenarios: AIScenario[] = [
    {
        name: 'Risk: Force Review on High Risk with Sub-Hardened Confidence',
        input: { description: 'Sensitive Payment', amount: 15000.00 },
        expected: {
            // HIGH risk + 0.91 confidence should require review (hardened threshold is 0.93)
            risk_level: 'HIGH',
            min_confidence: 0.90,
            max_confidence: 0.9299,
            requires_review: true
        }
    },
    {
        name: 'Risk: Allow High Risk with Hardened Confidence',
        input: { description: 'Verified High Value Vendor', amount: 25000.00 },
        expected: {
            // HIGH risk + 0.94 confidence should pass without review
            risk_level: 'HIGH',
            min_confidence: 0.93,
            requires_review: false
        }
    }
];
