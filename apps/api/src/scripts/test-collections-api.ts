import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env BEFORE other imports
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { LencoService } from '../services/lenco.service';

// Lenco sandbox test numbers (see /collections/mobile-money docs).
// airtel timeout number simulates the slow-network case we're trying to solve for.
const SCENARIOS: Record<string, { phone: string; operator: 'mtn' | 'airtel' | 'tnm'; expect: string }> = {
    mtn_success: { phone: '0961111111', operator: 'mtn', expect: 'successful' },
    mtn_timeout: { phone: '0966666666', operator: 'mtn', expect: 'failed (timeout)' },
    airtel_success: { phone: '0971111111', operator: 'airtel', expect: 'successful' },
    airtel_wrong_pin: { phone: '0972222222', operator: 'airtel', expect: 'failed (incorrect PIN)' },
};

const scenarioName = process.argv[2] || 'mtn_success';
const scenario = SCENARIOS[scenarioName];

if (!scenario) {
    console.error(`Unknown scenario "${scenarioName}". Options: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
}

const secretKey = process.env.LENCO_SECRET_KEY;
console.log('LENCO_SECRET_KEY available:', secretKey ? 'YES' : 'NO');

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const reference = `TEST-COLLECT-${Date.now()}`;

    console.log(`\n--- Initiating mobile money collection ---`);
    console.log(`Scenario: ${scenarioName} (expecting: ${scenario.expect})`);
    console.log(`Phone: ${scenario.phone} | Operator: ${scenario.operator} | Reference: ${reference}`);

    const initiated = await LencoService.initiateMobileMoneyCollection({
        amount: 10,
        reference,
        phone: scenario.phone,
        operator: scenario.operator,
    }, secretKey);

    console.log('\nInitiation response:', JSON.stringify(initiated, null, 2));

    if (initiated.status !== 'pay-offline') {
        console.log(`\nUnexpected initial status "${initiated.status}" — stopping (expected pay-offline).`);
        return;
    }

    console.log('\n--- Polling collection status every 5s (max 24 attempts / 2 min) ---');
    for (let attempt = 1; attempt <= 24; attempt++) {
        await sleep(5000);
        const status = await LencoService.getCollectionStatus(reference, secretKey);
        console.log(`[${new Date().toISOString()}] Attempt ${attempt}: status=${status?.status}`);

        if (status?.status === 'successful') {
            console.log('\n✅ SUCCESS — final payload:');
            console.log(JSON.stringify(status, null, 2));
            return;
        }
        if (status?.status === 'failed') {
            console.log(`\n❌ FAILED — reasonForFailure: ${status?.reasonForFailure}`);
            console.log(JSON.stringify(status, null, 2));
            return;
        }
    }

    console.log('\n⏱ Timed out waiting for a terminal status after 2 minutes.');
}

run().catch(err => {
    console.error('\nScript error:', err.message);
    process.exit(1);
});
