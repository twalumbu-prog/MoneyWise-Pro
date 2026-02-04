
const TOKEN = 'sbp_3a3b79bcfa0e4e072499cf0e22a6ced83723b3d6'; // Management API Token

async function verifyAI() {
    console.log('--- AI Classification Verification ---');

    const tests = [
        { description: 'Domain and email hosting', expected: '5004' },
        { description: 'Bank charges – January', expected: '7001' },
        { description: 'Mobile money transaction fee', expected: '7001' },
        { description: 'Cleaning detergents', expected: '5013' }
    ];

    for (const test of tests) {
        try {
            const response = await fetch('http://localhost:3000/accounts/suggest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZmVsdXBoY3V0Z3Bwa2hheHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDU5NDA0NSwiZXhwIjoyMDgwMTcwMDQ1fQ.2-2e2jhkrE_L9iR2N_q-EFc2bN9x0M4n8ZbdXOiOd5Y` // Using Service Role Token
                },
                body: JSON.stringify({ description: test.description, amount: 100 })
            });
            const result = await response.json();

            if (!response.ok) {
                console.error(`❌ API Error (${response.status}):`, result);
                continue;
            }

            const match = test.expected === 'AI_CHECK' ? result.method === 'AI' : result.account_code === test.expected;
            console.log(`${match ? '✅' : '❌'} Description: "${test.description}"`);
            if (match) {
                console.log(`   Suggested: ${result.account_code} | Method: ${result.method} | Conf: ${Math.round(result.confidence * 100)}%`);
            } else {
                console.log(`   Suggested: ${result.account_code} (Exp: ${test.expected}) | Method: ${result.method}`);
                console.log(`   Full Response:`, JSON.stringify(result));
            }
        } catch (err) {
            console.error(`❌ Error verifying "${test.description}":`, err.message);
        }
    }
}

verifyAI();
