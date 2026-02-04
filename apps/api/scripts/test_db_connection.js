
const { Client } = require('pg');
const dns = require('dns');
const { promisify } = require('util');

const resolve4 = promisify(dns.resolve4);

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const PASSWORD = 'jwBDdE8HbNoiMFBz';

// List of common Supabase regions to test
const REGIONS = [
    'aws-0-eu-central-1',
    'aws-0-us-east-1',
    'aws-0-us-west-1',
    'aws-0-ap-southeast-1',
    'aws-0-sa-east-1'
];

async function testConnection(region) {
    const host = `${region}.pooler.supabase.com`;
    console.log(`\nTesting Region: ${region} (${host})`);

    // DNS check first
    try {
        await resolve4(host);
    } catch (e) {
        console.log(`Skipping ${region}: invalid host`);
        return;
    }

    const config = {
        connectionString: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${host}:6543/postgres`,
        ssl: { rejectUnauthorized: false }
    };

    const client = new Client(config);
    try {
        await client.connect();
        const res = await client.query('SELECT version()');
        console.log(`✅ SUCCESS! Found correct region: ${region}`);
        console.log(`   Version: ${res.rows[0].version}`);
        await client.end();
        return true;
    } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
        await client.end().catch(() => { });
        return false;
    }
}

async function run() {
    console.log('--- Region Discovery Diagnostic ---');
    for (const region of REGIONS) {
        if (await testConnection(region)) break;
    }
}

run().catch(console.error);
