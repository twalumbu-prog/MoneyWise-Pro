import dotenv from 'dotenv';
import path from 'path';

// Load .env from the API folder explicitly
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('ENV CHECK:', {
    SUPABASE_URL: process.env.SUPABASE_URL ? 'OK' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'MISSING'
});
import fs from 'fs';
import { AIScenario, TestResult } from './testing/types';
import { decisionRouter } from '../src/services/ai/decision.router';
import { learningValidator } from '../src/services/ai/learning.validator';
import { supabase } from '../src/lib/supabase';

// --- CONFIGURATION ---
const VERBOSE = process.argv.includes('--verbose');
const ONLY_FILTER = process.argv.find(arg => arg.startsWith('--only='))?.split('=')[1];
const SCENARIOS_DIR = path.join(__dirname, 'testing', 'scenarios');

async function runTests() {
    console.log('\n' + '='.repeat(40));
    console.log('🚀 AI ENGINE AUTOMATED VALIDATION HARNESS');
    console.log('='.repeat(40) + '\n');

    if (process.env.AI_TEST_MODE === 'true') {
        console.log('⚠️  [DETERMINISTIC MODE ACTIVE]');
    }

    // 1. Fetch live accounts for realistic context (or use empty if DB down)
    let accounts: any[] = [];
    try {
        const { data } = await supabase.from('accounts').select('id, code, name, AcctNum, Name');
        accounts = data || [];

        // Inject required mock accounts if missing
        const requiredCodes = ['1001', '1002', '4000', '4100', '4500', '6000', '6100', '6101', '6200', '6300', '6500', '6900', '9000', '1234'];
        requiredCodes.forEach(code => {
            if (!accounts.some(a => (a.code || a.AcctNum) === code)) {
                accounts.push({ id: `mock-${code}`, code: code, name: `Mock Account ${code}` });
            }
        });

        console.log(`✅ Loaded ${accounts.length} accounts for context (including mocks).`);
    } catch (err) {
        console.warn('⚠️  Could not fetch live accounts, using empty context.');
    }

    // 2. Load Scenarios
    const scenarioFiles = fs.readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    const allScenarios: AIScenario[] = [];

    for (const file of scenarioFiles) {
        if (ONLY_FILTER && !file.includes(ONLY_FILTER)) continue;

        // Use dynamic import for scenarios
        const filePath = path.join(SCENARIOS_DIR, file);
        const module = require(filePath);
        const exportedScenarios = Object.values(module).find(Array.isArray) as AIScenario[];
        if (exportedScenarios) allScenarios.push(...exportedScenarios);
    }

    console.log(`📦 Loaded ${allScenarios.length} scenarios from ${scenarioFiles.length} files.\n`);

    const results: TestResult[] = [];

    // 3. Execution Loop
    for (const scenario of allScenarios) {
        process.stdout.write(`Testing: ${scenario.name.padEnd(50)} `);

        const errors: string[] = [];
        let result: any;

        try {
            // Test Algorithm
            result = await decisionRouter.classify(accounts, scenario.input);

            // --- ASSERTIONS ---
            const { expected } = scenario;

            if (expected.decision_path && result.decision_path !== expected.decision_path) {
                errors.push(`Path mismatch: expected ${expected.decision_path}, got ${result.decision_path}`);
            }

            if (expected.min_confidence !== undefined && result.confidence < expected.min_confidence) {
                errors.push(`Confidence too low: min ${expected.min_confidence}, got ${result.confidence}`);
            }

            if (expected.max_confidence !== undefined && result.confidence > expected.max_confidence) {
                errors.push(`Confidence too high: max ${expected.max_confidence}, got ${result.confidence}`);
            }

            if (expected.requires_review !== undefined && result.requires_review !== expected.requires_review) {
                errors.push(`Review flag mismatch: expected ${expected.requires_review}, got ${result.requires_review}`);
            }

            if (expected.risk_level && result.risk?.riskLevel !== expected.risk_level) {
                errors.push(`Risk level mismatch: expected ${expected.risk_level}, got ${result.risk?.riskLevel}`);
            }

            // Test Learning Gate if expected
            if (expected.should_learn !== undefined) {
                // Mock learning context items for validation test
                const learnContext = {
                    isPostedToQB: true,
                    wasOverridden: scenario.name.includes('Override'),
                    confidence: result.confidence,
                    method: result.method,
                    usageCount: scenario.name.includes('Frequency') ? 1 : 3,
                    vectorSimilarity: result.similarity_score || 0
                };
                const safe = learningValidator.isSafeToLearn(learnContext);
                if (safe !== expected.should_learn) {
                    errors.push(`Learning gate mismatch: expected ${expected.should_learn}, got ${safe}`);
                }
            }

        } catch (err: any) {
            errors.push(`Execution error: ${err.message}`);
        }

        const passed = errors.length === 0;
        results.push({ scenario, actual: result, passed, errors });

        if (passed) {
            console.log('✅ PASS');
        } else {
            console.log('❌ FAIL');
            if (VERBOSE) {
                errors.forEach(e => console.log(`   - ${e}`));
                console.log(`   Actual: ${JSON.stringify(result, null, 2)}`);
            }
        }
    }

    // 4. Batch Performance Test
    if (!ONLY_FILTER || ONLY_FILTER === 'performance') {
        await runPerformanceTest(accounts);
    }

    // 5. Final Report
    printSummary(results);
}

async function runPerformanceTest(accounts: any[]) {
    console.log('\n⏱️ Running Batch Performance Test (50 synthetic items)...');
    const items = Array.from({ length: 50 }, (_, i) => ({
        description: `Synthetic Transaction ${i}`,
        amount: Math.random() * 1000,
        department: 'TEST'
    }));

    const start = Date.now();
    for (const item of items) {
        await decisionRouter.classify(accounts, item);
    }
    const duration = Date.now() - start;

    console.log(`   Total Time: ${duration}ms`);
    console.log(`   Avg/Item:   ${(duration / 50).toFixed(2)}ms`);
    console.log(`   Throughput: ${(1000 / (duration / 50)).toFixed(2)} items/sec`);
}

function printSummary(results: TestResult[]) {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    const avgConf = results.reduce((acc, r) => acc + (r.actual?.confidence || 0), 0) / total;
    const reviewRate = (results.filter(r => r.actual?.requires_review).length / total) * 100;

    const pathStats = results.reduce((acc: any, r) => {
        const path = r.actual?.decision_path || 'FAILED';
        acc[path] = (acc[path] || 0) + 1;
        return acc;
    }, {});

    console.log('\n' + '='.repeat(30));
    console.log('AI ENGINE TEST SUMMARY');
    console.log('='.repeat(30));
    console.log(`Total Scenarios: ${total}`);
    console.log(`Passed:          ${passed}`);
    console.log(`Failed:          ${failed}`);
    console.log(`Pass Rate:       ${passRate.toFixed(1)}%`);
    console.log('-'.repeat(30));
    console.log(`Avg Confidence:  ${(avgConf * 100).toFixed(1)}%`);
    console.log(`Review Rate:     ${reviewRate.toFixed(1)}%`);
    console.log('-'.repeat(30));
    Object.entries(pathStats).forEach(([path, count]) => {
        console.log(`${path.padEnd(16)} ${(Number(count) / total * 100).toFixed(1)}%`);
    });
    console.log('='.repeat(30) + '\n');

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});
