const { Client } = require('pg');
const dns = require('dns');
const { promisify } = require('util');

const resolve4 = promisify(dns.resolve4);

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const PASSWORD = 'jwBDdE8HbNoiMFBz';

const REGIONS = [
    'aws-0-eu-central-1',
    'aws-0-eu-west-1',
    'aws-0-eu-west-2',
    'aws-0-eu-west-3',
    'aws-0-eu-central-2',
    'aws-0-us-east-1',
    'aws-0-us-east-2',
    'aws-0-us-west-1',
    'aws-0-us-west-2',
    'aws-0-ap-southeast-1',
    'aws-0-ap-southeast-2',
    'aws-0-ap-northeast-1',
    'aws-0-ap-northeast-2',
    'aws-0-ap-south-1',
    'aws-0-sa-east-1',
    'aws-0-ca-central-1'
];

async function testConnection(region) {
    const host = `${region}.pooler.supabase.com`;

    try {
        await resolve4(host);
    } catch (e) {
        return;
    }

    const config = {
        connectionString: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${host}:5432/postgres`,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    };

    const client = new Client(config);
    try {
        await client.connect();
        await client.query('SELECT 1');
        console.log(`\n🎉 FOUND IT! The correct region is: ${region}`);
        await client.end();
        process.exit(0);
    } catch (err) {
        if (err.message.includes('password')) {
            console.log(`\n🔑 FOUND REGION: ${region} (but password was rejected)`);
            process.exit(0);
        }
        // If it returns tenant not found, it is the wrong region
        console.log(`  - ${region}: ${err.message}`);
        await client.end().catch(() => { });
    }
}

async function run() {
    console.log('--- Port 5432 Region Check ---');
    for (const region of REGIONS) {
        await testConnection(region);
    }
    console.log('\n--- check complete ---');
}

run().catch(console.error);
