import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { handleCollectionSuccessful } from '../src/controllers/lenco.webhook.controller';

const ORGANIZATION_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a'; // Twalumbu Education Centre
const REFERENCE = '2614804193';
const AMOUNT = '133100.00';
const NARRATION = 'Masterfees transfer received';
const DESCRIPTION = 'Transfer to moneywise for salaries / 2614804192';

async function run() {
    console.log(`Inserting missed cash inflow for reference: ${REFERENCE}...`);
    
    const success = await handleCollectionSuccessful({
        reference: REFERENCE,
        amount: AMOUNT,
        narration: NARRATION,
        description: DESCRIPTION,
        accountId: null
    }, ORGANIZATION_ID);

    if (success) {
        console.log('✅ Successfully inserted the cash inflow and charge!');
    } else {
        console.error('❌ Failed to insert the cash inflow.');
    }
    process.exit(0);
}

run().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});
