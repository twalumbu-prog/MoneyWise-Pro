
const { Client } = require('pg');
const dns = require('dns');
const { promisify } = require('util');

const resolve4 = promisify(dns.resolve4);

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const PASSWORD = 'jwBDdE8HbNoiMFBz';

// COMPLETE list of Supabase Pooler Regions
const REGIONS = [
    'aws-0-us-east-1',      // N. Virginia
    'aws-0-us-west-1',      // N. California
    'aws-0-eu-central-1',   // Frankfurt
    'aws-0-eu-west-1',      // Ireland
    'aws-0-eu-west-2',      // London
    'aws-0-ap-southeast-1', // Singapore
    'aws-0-ap-northeast-1', // Tokyo
    'aws-0-ap-northeast-2', // Seoul
    'aws-0-ap-south-1',     // Mumbai
    'aws-0-sa-east-1',      // São Paulo
    'aws-0-ca-central-1',   // Canada
    'aws-0-eu-west-3',      // Paris
];

async function testConnection(region) {
    const host = `${region}.pooler.supabase.com`;
    console.log(`Testing: ${region}...`);

    // DNS check first to fail fast
    try {
        await resolve4(host);
    } catch (e) {
        return;
    }

    const config = {
        connectionString: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${host}:6543/postgres`,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 3000 // Fast fail
    };

    const client = new Client(config);
    try {
        await client.connect();
        await client.query('SELECT 1');
        console.log(`\n🎉 FOUND IT! The correct region is: ${region}`);
        await client.end();
        process.exit(0); // Exit immediately on success
    } catch (err) {
        // "Tenant or user not found" means right server, wrong tenant (so wrong region for this tenant)
        // "password authentication failed" would actually mean we FOUND the region but pass is wrong!
        if (err.message.includes('password')) {
            console.log(`\n🔑 FOUND REGION: ${region} (but password was rejected)`);
            process.exit(0);
        }
        // Silence other errors (wrong region)
        await client.end().catch(() => { });
    }
}

async function run() {
    console.log('--- Brute Force Region Check ---');
    console.log(`Target: ${PROJECT_REF}`);

    const promises = REGIONS.map(region => testConnection(region));
    await Promise.all(promises);

    console.log('\n--- check complete ---');
    // If we get here, we didn't find it
}

run().catch(console.error);
