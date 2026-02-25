import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { aiService } from '../src/services/ai/ai.service';
import { ruleEngine } from '../src/services/ai/rule.engine';
import { memoryService } from '../src/services/ai/memory.service';
import { supabase } from '../src/lib/supabase';

// FORCE LIVE AI
process.env.AI_TEST_MODE = 'false';

const groundTruth = [
    // Staff Meals
    { desc: 'Lunch at KFC', amt: 120, code: '1001', cat: 'Staff Meals' },
    { desc: 'Subway for team', amt: 350, code: '1001', cat: 'Staff Meals' },
    { desc: 'Pizza Hut delivery', amt: 800, code: '1001', cat: 'Staff Meals' },
    { desc: 'Coffee Shop breakfast', amt: 150, code: '1001', cat: 'Staff Meals' },
    { desc: 'Catering for board meeting', amt: 2500, code: '1001', cat: 'Staff Meals' },
    { desc: 'Restaurant dinner with client', amt: 1200, code: '1001', cat: 'Staff Meals' },
    { desc: 'Burgers for late shift', amt: 400, code: '1001', cat: 'Staff Meals' },
    { desc: 'Office fruit delivery', amt: 200, code: '1001', cat: 'Staff Meals' },
    { desc: 'Team building lunch', amt: 1500, code: '1001', cat: 'Staff Meals' },
    { desc: 'Afternoon snacks for office', amt: 100, code: '1001', cat: 'Staff Meals' },

    // Travel
    { desc: 'Uber ride', amt: 80, code: '6200', cat: 'Travel' },
    { desc: 'Taxi to airport', amt: 150, code: '6200', cat: 'Travel' },
    { desc: 'Hilton Hotel stay', amt: 4500, code: '6200', cat: 'Travel' },
    { desc: 'British Airways flight', amt: 12000, code: '6200', cat: 'Travel' },
    { desc: 'Yellow Cab co', amt: 60, code: '6200', cat: 'Travel' },
    { desc: 'Parking at terminal', amt: 100, code: '6200', cat: 'Travel' },
    { desc: 'Train ticket to city', amt: 45, code: '6200', cat: 'Travel' },
    { desc: 'Avis car rental', amt: 2500, code: '6200', cat: 'Travel' },
    { desc: 'Airport lounge access', amt: 300, code: '6200', cat: 'Travel' },
    { desc: 'Toll road payment', amt: 20, code: '6200', cat: 'Travel' },

    // Office Supplies
    { desc: 'Stationery World pens', amt: 25, code: '6101', cat: 'Office Supplies' },
    { desc: 'Copy paper reams', amt: 120, code: '6101', cat: 'Office Supplies' },
    { desc: 'Printer ink cartridges', amt: 850, code: '6101', cat: 'Office Supplies' },
    { desc: 'Office Depot notebooks', amt: 15, code: '6101', cat: 'Office Supplies' },
    { desc: 'Scissors and stapler', amt: 40, code: '6101', cat: 'Office Supplies' },
    { desc: 'Whiteboard markers', amt: 60, code: '6101', cat: 'Office Supplies' },
    { desc: 'Files and folders', amt: 200, code: '6101', cat: 'Office Supplies' },
    { desc: 'Post-it notes bundle', amt: 30, code: '6101', cat: 'Office Supplies' },
    { desc: 'Shredder maintenance oil', amt: 20, code: '6101', cat: 'Office Supplies' },
    { desc: 'Desk organizer', amt: 150, code: '6101', cat: 'Office Supplies' },

    // Utilities
    { desc: 'Zesco electricity', amt: 500, code: '6100', cat: 'Utilities' },
    { desc: 'Water company bill', amt: 300, code: '6100', cat: 'Utilities' },
    { desc: 'Waste management monthly', amt: 250, code: '6100', cat: 'Utilities' },
    { desc: 'Gas heating system', amt: 800, code: '6100', cat: 'Utilities' },
    { desc: 'Electric Co tokens', amt: 200, code: '6100', cat: 'Utilities' },
    { desc: 'Municipal rates', amt: 1200, code: '6100', cat: 'Utilities' },
    { desc: 'Sewerage services', amt: 150, code: '6100', cat: 'Utilities' },
    { desc: 'Trash collection fee', amt: 50, code: '6100', cat: 'Utilities' },
    { desc: 'Utility connection fee', amt: 100, code: '6100', cat: 'Utilities' },
    { desc: 'Solar panel maintenance', amt: 450, code: '6100', cat: 'Utilities' },

    // Vendor Payments
    { desc: 'Microsoft subscription', amt: 15, code: '4000', cat: 'Vendor Payments' },
    { desc: 'AWS hosting bill', amt: 2500, code: '4000', cat: 'Vendor Payments' },
    { desc: 'Oracle license renewal', amt: 15000, code: '4000', cat: 'Vendor Payments' },
    { desc: 'Zamtel internet internet', amt: 600, code: '4000', cat: 'Vendor Payments' },
    { desc: 'Google Cloud storage', amt: 10, code: '4000', cat: 'Vendor Payments' },
    { desc: 'Slack for workspace', amt: 200, code: '4000', cat: 'Vendor Payments' },
    { desc: 'Adobe Creative Cloud', amt: 600, code: '4000', cat: 'Vendor Payments' },
    { desc: 'Zoom video conferencing', amt: 150, code: '4000', cat: 'Vendor Payments' },
    { desc: 'Mailchimp marketing', amt: 400, code: '4000', cat: 'Vendor Payments' },
    { desc: 'GitHub Co-pilot', amt: 100, code: '4000', cat: 'Vendor Payments' },

    // Fees / Professional
    { desc: 'Consulting services fee', amt: 10000, code: '4100', cat: 'Fees' },
    { desc: 'Legal advisory bill', amt: 5000, code: '4100', cat: 'Fees' },
    { desc: 'Audit services', amt: 8000, code: '4100', cat: 'Fees' },
    { desc: 'Bookkeeping monthly', amt: 1200, code: '4100', cat: 'Fees' },
    { desc: 'Accounting software setup', amt: 2000, code: '4100', cat: 'Fees' },
    { desc: 'Tax filing assistance', amt: 3500, code: '4100', cat: 'Fees' },
    { desc: 'Management consulting', amt: 15000, code: '4100', cat: 'Fees' },
    { desc: 'Translation services', amt: 400, code: '4100', cat: 'Fees' },
    { desc: 'Strategic planning session', amt: 6000, code: '4100', cat: 'Fees' },
    { desc: 'Compliance review', amt: 4500, code: '4100', cat: 'Fees' }
];

// Fill up to 100 with more variations
while (groundTruth.length < 100) {
    const base = groundTruth[groundTruth.length % 60];
    groundTruth.push({
        ...base,
        desc: `${base.desc} - Var ${groundTruth.length}`,
        amt: base.amt * (1 + Math.random() * 0.2)
    });
}

async function runComparison() {
    console.log('\n🚀 STARTING HEAD-TO-HEAD METHOD ACCURACY COMPARISON');
    console.log(`Target: ${groundTruth.length} scenarios across 6 core categories.\n`);

    const { data: accounts } = await supabase.from('accounts').select('id, code, name');

    // Safety check for accounts
    const safeAccounts = accounts || [];
    if (safeAccounts.length === 0) {
        console.warn('⚠️ Using mock account context...');
        safeAccounts.push(
            { id: 'mock-1001', code: '1001', name: 'Staff Meals' },
            { id: 'mock-6200', code: '6200', name: 'Travel' },
            { id: 'mock-6100', code: '6100', name: 'Utilities' },
            { id: 'mock-6101', code: '6101', name: 'Office Supplies' },
            { id: 'mock-4000', code: '4000', name: 'Vendor Payments' },
            { id: 'mock-4100', code: '4100', name: 'Fees' }
        );
    }

    const stats = {
        memory: { correct: 0, attempted: 0, sumConf: 0 },
        rule: { correct: 0, attempted: 0, sumConf: 0 },
        ai: { correct: 0, attempted: 0, sumConf: 0 }
    };

    const logs = [];

    for (let i = 0; i < groundTruth.length; i++) {
        const item = groundTruth[i];
        process.stdout.write(`Benchmarking ${i + 1}/100: ${item.desc.substring(0, 30).padEnd(35)} `);

        // 1. Test Memory
        const memResult = await memoryService.lookup(item.desc);
        if (memResult) {
            stats.memory.attempted++;
            // Note: account_id in memory is typically the DB ID, we check if code matches
            const acct = safeAccounts.find(a => a.id === memResult.account_id);
            if (acct?.code === item.code) stats.memory.correct++;
            stats.memory.sumConf += memResult.confidence;
        }

        // 2. Test Rule
        const ruleResult = ruleEngine.match(item.desc, item.amt);
        if (ruleResult.matched) {
            stats.rule.attempted++;
            const acct = safeAccounts.find(a => a.id === ruleResult.accountId);
            if (acct?.code === item.code) stats.rule.correct++;
            stats.rule.sumConf += ruleResult.confidence;
        }

        // 3. Test AI (Live)
        try {
            const aiResult = await aiService.suggestCategory(safeAccounts, item.desc, item.amt);
            stats.ai.attempted++;
            if (aiResult.account_code === item.code) stats.ai.correct++;
            stats.ai.sumConf += aiResult.confidence;

            logs.push({
                item,
                results: {
                    memory: memResult ? { code: safeAccounts.find(a => a.id === memResult.account_id)?.code, conf: memResult.confidence } : null,
                    rule: ruleResult.matched ? { code: safeAccounts.find(a => a.id === ruleResult.accountId)?.code, conf: ruleResult.confidence } : null,
                    ai: { code: aiResult.account_code, conf: aiResult.confidence }
                }
            });
            console.log('✅');
        } catch (err) {
            console.log('❌ (AI Error)');
        }
    }

    // Final Report Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 ACCURACY COMPARISON REPORT');
    console.log('='.repeat(50));

    const printRow = (name: string, s: any) => {
        const acc = s.attempted > 0 ? (s.correct / s.attempted * 100).toFixed(1) : '0';
        const cov = (s.attempted / groundTruth.length * 100).toFixed(1);
        const avgC = s.attempted > 0 ? (s.sumConf / s.attempted * 100).toFixed(1) : '0';
        console.log(`${name.padEnd(8)} | Accuracy: ${acc.padStart(5)}% | Coverage: ${cov.padStart(5)}% | Avg Conf: ${avgC.padStart(5)}%`);
    };

    printRow('MEMORY', stats.memory);
    printRow('RULE', stats.rule);
    printRow('AI/LIVE', stats.ai);
    console.log('='.repeat(50));

    // Save logs for report generation
    require('fs').writeFileSync('accuracy_comparison_logs.json', JSON.stringify(logs, null, 2));
}

runComparison();
