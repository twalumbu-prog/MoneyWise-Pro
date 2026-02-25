import dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { aiService } from '../src/services/ai/ai.service';
import { supabase } from '../src/lib/supabase';

// FORCE LIVE MODE
process.env.AI_TEST_MODE = 'false';

const goldenDataset = [
    {
        name: 'Staff Meal - Standard',
        description: 'Lunch for team at KFC',
        amount: 250,
        expected_code: '1001'
    },
    {
        name: 'Staff Meal - Ambiguous',
        description: 'Team outing for pizza',
        amount: 500,
        expected_code: '1001'
    },
    {
        name: 'Travel - Taxi',
        description: 'Uber ride to airport',
        amount: 150,
        expected_code: '6200'
    },
    {
        name: 'Travel - Flight',
        description: 'Emirates flight ZK882',
        amount: 8500,
        expected_code: '6200'
    },
    {
        name: 'Utility - Electric',
        description: 'Zesco electricity token',
        amount: 1000,
        expected_code: '6100'
    },
    {
        name: 'Office Supplies',
        description: 'Printer ink and paper bundle',
        amount: 450,
        expected_code: '6101'
    },
    {
        name: 'Vendor Payment - AWS',
        description: 'Amazon Web Services cloud hosting',
        amount: 2400,
        expected_code: '4000'
    },
    {
        name: 'Income - Fees',
        description: 'Consulting services for Project X',
        amount: 15000,
        expected_code: '4100'
    },
    {
        name: 'Nonsense - Adversarial',
        description: 'XyZ#123 abc',
        amount: 10,
        expected_code: 'unknown' // Expect low confidence
    }
];

async function verifyLiveAI() {
    console.log('\n=== LIVE AI INTELLIGENCE VERIFIER ===');
    console.log('Testing actual OpenAI & Gemini responses...\n');

    // Fetch accounts for context
    let { data: accounts } = await supabase.from('accounts').select('id, code, name');
    if (!accounts || accounts.length === 0) {
        console.warn('⚠️ No live accounts found, injecting mocks for context.');
        accounts = [
            { id: 'mock-1001', code: '1001', name: 'Staff Meals' },
            { id: 'mock-6200', code: '6200', name: 'Travel' },
            { id: 'mock-6100', code: '6100', name: 'Utilities' },
            { id: 'mock-6101', code: '6101', name: 'Office Supplies' },
            { id: 'mock-4000', code: '4000', name: 'Vendor Payments' },
            { id: 'mock-4100', code: '4100', name: 'Revenue / Fees' }
        ];
    }

    const results = [];
    let passed = 0;

    for (const scenario of goldenDataset) {
        process.stdout.write(`Testing: ${scenario.name.padEnd(30)} `);

        try {
            const suggestion = await aiService.classifyItem(accounts, {
                description: scenario.description,
                amount: scenario.amount
            });

            const isMatch = suggestion.account_code === scenario.expected_code;
            const isUnknownPass = scenario.expected_code === 'unknown' && suggestion.confidence < 0.6;

            const success = isMatch || isUnknownPass;
            if (success) passed++;

            results.push({
                ...scenario,
                actual_code: suggestion.account_code,
                confidence: suggestion.confidence,
                reasoning: suggestion.reasoning,
                success
            });

            console.log(success ? '✅' : '❌');
            if (!success || scenario.expected_code === 'unknown') {
                console.log(`   - Model Thought: "${suggestion.reasoning}"`);
                console.log(`   - Confidence: ${Math.round(suggestion.confidence * 100)}%`);
                if (!success) console.log(`   - Expected: ${scenario.expected_code}, Got: ${suggestion.account_code}`);
            }
        } catch (err: any) {
            console.log('💥 ERROR:', err.message);
        }
    }

    console.log('\n=== SUMARY ===');
    console.log(`Accuracy: ${passed}/${goldenDataset.length} (${Math.round((passed / goldenDataset.length) * 100)}%)`);

    // Save report hint
    const reportData = JSON.stringify(results, null, 2);
    require('fs').writeFileSync('live_ai_results.json', reportData);
}

verifyLiveAI();
