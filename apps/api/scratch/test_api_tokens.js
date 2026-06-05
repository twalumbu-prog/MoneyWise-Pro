const tokens = [
    'sbp_12cfd0b0f1db6bd6313a253fbcd65abad001dbf2',
    'sbp_3a3b79bcfa0e4e072499cf0e22a6ced83723b3d6'
];

async function testToken(token) {
    console.log(`Testing token: ${token.substring(0, 10)}...`);
    try {
        const response = await fetch('https://api.supabase.com/v1/projects', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const status = response.status;
        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            data = { text: await response.text() };
        }
        console.log(`Result: Status = ${status}`, data);
    } catch (err) {
        console.error('Error:', err.message || err);
    }
}

async function run() {
    for (const token of tokens) {
        await testToken(token);
    }
}

run();
