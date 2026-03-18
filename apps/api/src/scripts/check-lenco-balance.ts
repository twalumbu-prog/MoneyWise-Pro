import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env BEFORE other imports
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { LencoService } from '../services/lenco.service';

const subaccountId = 'df2ff8c6-eebf-4e53-923e-986c970e6794';
const secretKey = process.env.LENCO_SECRET_KEY;
console.log('LENCO_SECRET_KEY available:', secretKey ? 'YES' : 'NO');

async function checkBalance() {
    console.log('--- Lenco Balance Check ---');
    console.log(`Subaccount ID: ${subaccountId}`);
    
    try {
        const balanceData = await LencoService.getAccountBalance(subaccountId);
        console.log('Lenco Response:', JSON.stringify(balanceData, null, 2));
        
        const balance = balanceData.balance;
        const availableBalance = balanceData.availableBalance;
        const currency = balanceData.currency || 'ZMW';
        
        console.log('\n--------------------------------');
        console.log(`Current Balance: ${balance || balanceData.ledgerBalance} ${currency}`);
        console.log(`Available Balance: ${availableBalance} ${currency}`);
        console.log('--------------------------------');
        
        console.log('\n--- Recent Lenco Transactions ---');
        const txResponse = await LencoService.getAccountTransactions(subaccountId);
        const transactions = txResponse.data || [];
        
        transactions.slice(0, 10).forEach((tx: any) => {
            console.log(`[${tx.datetime}] ${tx.type.toUpperCase()}: ${tx.amount} ${tx.currency} - ${tx.narration || tx.reference}`);
        });

        console.log('\nMoneyWise Ledger Balance: 141.50 ZMW');
        
        const actualBalance = parseFloat(availableBalance);
        if (actualBalance === 141.50) {
            console.log('\n✅ SUCCESS: Balances match perfectly!');
        } else {
            console.log(`\n⚠️ NOTICE: Balances differ marking Lenco ${actualBalance > 141.50 ? 'HIGHER' : 'LOWER'} by ${(Math.abs(actualBalance - 141.50)).toFixed(2)} ${currency}`);
            console.log('Compare the transactions above with your MoneyWise ledger to find the missing entry.');
        }
    } catch (error: any) {
        console.error('Error fetching data:', error.message);
    }
}

checkBalance();
