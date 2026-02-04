
const fetch = require('node-fetch');

const PROJECT_ID = 'klfeluphcutgppkhaxyl';
const ACCESS_TOKEN = 'sbp_3a3b79bcfa0e4e072499cf0e22a6ced83723b3d6';

async function queryAccounts() {
    const url = `https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`;

    console.log(`Querying accounts from ${PROJECT_ID}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: 'SELECT code, name FROM accounts;'
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`API Error: ${JSON.stringify(err)}`);
        }

        const data = await response.json();
        console.log('Accounts in DB:', JSON.stringify(data, null, 2));

    } catch (err) {
        console.error('Failed to query:', err.message);
    }
}

queryAccounts();
