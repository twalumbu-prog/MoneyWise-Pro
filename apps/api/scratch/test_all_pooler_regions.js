const { Client } = require('pg');

const regions = [
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-northeast-1',
    'ap-northeast-2',
    'ca-central-1',
    'sa-east-1',
    'af-south-1',
    'ap-south-1'
];

async function testRegion(region) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const connectionString = `postgresql://postgres.klfeluphcutgppkhaxyl:jwBDdE8HbNoiMFBz@${host}:6543/postgres?pgbouncer=true`;
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000 // 5 seconds timeout
    });

    try {
        console.log(`Trying ${region} (${host})...`);
        await client.connect();
        console.log(`[SUCCESS] Connected to ${region}!`);
        const res = await client.query('SELECT current_database(), current_user;');
        console.log(`[SUCCESS] Query result for ${region}:`, res.rows[0]);
        return true;
    } catch (err) {
        console.log(`[FAIL] ${region}: ${err.message}`);
        return false;
    } finally {
        await client.end().catch(() => {});
    }
}

async function run() {
    for (const region of regions) {
        const success = await testRegion(region);
        if (success) {
            console.log(`\nFound working region: ${region}`);
            break;
        }
    }
    console.log('Done.');
}

run();
