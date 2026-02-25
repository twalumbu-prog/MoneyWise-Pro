import { AIScenario } from '../types';

export const combinedScenarios: AIScenario[] = [
    {
        name: 'High-confidence memory match',
        input: { description: 'Invoice #123', amount: 500, department: 'SALES' },
        expected: { decision_path: 'MEMORY', min_confidence: 0.9, requires_review: false, risk_level: 'LOW', should_learn: true }
    },
    {
        name: 'Regex rule trigger',
        input: { description: 'Refund for order #999', amount: 200, department: 'SALES' },
        expected: { decision_path: 'RULE', min_confidence: 0.9, requires_review: false, risk_level: 'LOW', should_learn: true }
    },
    {
        name: 'Multi-model ensemble fallback',
        input: { description: 'Miscellaneous expense', amount: 50, department: 'ADMIN' },
        expected: { decision_path: 'AI', min_confidence: 0.7, requires_review: true, risk_level: 'LOW', should_learn: false }
    },
    {
        name: 'High-risk transaction',
        input: { description: 'Transfer to external account', amount: 10000, department: 'FINANCE' },
        expected: { decision_path: 'AI', min_confidence: 0.8, requires_review: true, risk_level: 'HIGH', should_learn: false }
    },
    {
        name: 'Learning gate pass',
        input: { description: 'Recurring subscription payment', amount: 100, department: 'SALES' },
        expected: { decision_path: 'AI', min_confidence: 0.85, requires_review: false, risk_level: 'LOW', should_learn: true }
    },
    {
        name: 'Learning gate block due to override',
        input: { description: 'Corrected invoice', amount: 300, department: 'SALES' },
        expected: { decision_path: 'RULE', min_confidence: 0.9, requires_review: false, risk_level: 'LOW', should_learn: true }
    },
    {
        name: 'Low confidence fallback',
        input: { description: 'Unknown expense', amount: 75, department: 'HR' },
        expected: { decision_path: 'FAILED', min_confidence: 0, requires_review: true, risk_level: 'LOW', should_learn: false }
    },
    {
        name: 'Edge case: zero amount transaction',
        input: { description: 'Promotional credit', amount: 0, department: 'MARKETING' },
        expected: { decision_path: 'RULE', min_confidence: 0.95, requires_review: false, risk_level: 'LOW', should_learn: true }
    },
    {
        name: 'High frequency learning validation',
        input: { description: 'Daily subscription payment', amount: 10, department: 'SALES' },
        expected: { decision_path: 'AI', min_confidence: 0.8, requires_review: true, risk_level: 'LOW', should_learn: true }
    },
    {
        name: 'Manual review triggered',
        input: { description: 'Employee reimbursement', amount: 1200, department: 'HR' },
        expected: { decision_path: 'AI', min_confidence: 0.75, requires_review: true, risk_level: 'HIGH', should_learn: false }
    }
];
