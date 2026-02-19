import { resolve } from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { QuickBooksService } from '../services/quickbooks.service';

const ORG_ID = '9e7bb109-d6da-4dcd-9ac3-55bba2718cff';

async function debugQB() {
    try {
        console.log('--- QuickBooks Audit Diagnostic ---');
        console.log('Fetching valid token and realmId...');
        const { accessToken, realmId } = await QuickBooksService.getValidToken(ORG_ID);
        console.log(`Realm ID: ${realmId}`);

        // Try BOTH sandbox and production if we get 403, to be sure
        const bases = [
            'https://quickbooks.api.intuit.com/v3/company',
            'https://sandbox-quickbooks.api.intuit.com/v3/company'
        ];

        for (const apiBase of bases) {
            console.log(`\n--- Testing Base: ${apiBase} ---`);
            try {
                console.log(`Fetching CompanyInfo...`);
                const coResponse = await fetch(`${apiBase}/${realmId}/companyinfo/${realmId}?minorversion=70`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });

                const coText = await coResponse.text();
                let coData;
                try {
                    coData = JSON.parse(coText);
                } catch {
                    coData = { rawText: coText, status: coResponse.status };
                }

                console.log('CompanyInfo:', JSON.stringify(coData, null, 2));

                if (coResponse.ok) {
                    console.log(`Fetching Accounts...`);
                    const query = encodeURIComponent("select * from Account MAXRESULTS 1000");
                    const accResponse = await fetch(`${apiBase}/${realmId}/query?query=${query}&minorversion=70`, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        }
                    });
                    const accData = await accResponse.json();
                    console.log(`Fetched ${accData?.QueryResponse?.Account?.length || 0} accounts.`);

                    // Specifically look for account 35
                    const acc35 = accData?.QueryResponse?.Account?.find((a: any) => a.Id === '35');
                    if (acc35) {
                        console.log('Account "35" found:', JSON.stringify(acc35, null, 2));
                    } else {
                        console.log('Account "35" NOT found.');
                        // List bank accounts
                        const banks = accData?.QueryResponse?.Account?.filter((a: any) => a.AccountType === 'Bank');
                        console.log('Bank Accounts:', banks?.map((b: any) => `${b.Id}: ${b.Name} (${b.AccountSubType})`) || []);
                    }

                    // Also check for AccountRef 1 which is used as fallback
                    const acc1 = accData?.QueryResponse?.Account?.find((a: any) => a.Id === '1');
                    if (acc1) {
                        console.log('Account "1" (fallback) type:', acc1.AccountType);
                    }

                    break; // If this base worked, we are done
                } else {
                    console.log(`Base ${apiBase} failed with status ${coResponse.status}`);
                }
            } catch (e: any) {
                console.error(`Error with base ${apiBase}:`, e.message);
            }
        }

    } catch (error: any) {
        console.error('Audit Error:', error.message || error);
    }
}

debugQB();
