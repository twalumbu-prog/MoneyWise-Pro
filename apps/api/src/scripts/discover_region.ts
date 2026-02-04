
import { Client } from 'pg';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const PASSWORD = 'jwBDdE8HbNoiMFBz';

const REGIONS = [
    'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-2',
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
    'sa-east-1', 'ca-central-1'
];

async function testRegion(region: string) {
    const host = `aws-0-${region}.pooler.supabase.com`;

    // DNS check first
    try {
        await resolve4(host);
    } catch (e) {
        // DNS not found for this region host
        return;
    }

    console.log(`Testing host: ${host}`);

    const config = {
        connectionString: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${host}:6543/postgres?pgbouncer=true`,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    };

    const client = new Client(config);
    try {
        await client.connect();
        console.log(`\n🎉 SUCCESS! Region found: ${region}`);
        const res = await client.query('SELECT current_database();');
        console.log('Result:', res.rows[0]);
        await client.end();
        process.exit(0);
    } catch (err: any) {
        console.log(`  - ${region}: ${err.message}`);
        await client.end().catch(() => { });
    }
}

async function run() {
    console.log(`Discovering region for project: ${PROJECT_REF}`);
    for (const region of REGIONS) {
        await testRegion(region);
    }
    console.log('\nFinished testing all regions.');
}

run().catch(console.error);
