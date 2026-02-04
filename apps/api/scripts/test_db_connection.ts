
import { Client } from 'pg';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const PASSWORD = 'jwBDdE8HbNoiMFBz';
const POOLER_HOST = 'aws-0-eu-central-1.pooler.supabase.com';
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;

async function testDNS(host: string) {
    console.log(`\nTesting DNS: ${host}`);
    try {
        const addresses = await resolve4(host);
        console.log(`✅ Resolved: ${addresses.join(', ')}`);
        return true;
    } catch (err: any) {
        console.error(`❌ DNS Error: ${err.code}`);
        return false;
    }
}

async function testConnection(name: string, config: any) {
    console.log(`\nTesting Connection: ${name}`);
    console.log(`URL: ${config.connectionString.replace(PASSWORD, '****')}`);

    const client = new Client(config);
    try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log(`✅ Success! Time: ${res.rows[0].now}`);
        await client.end();
        return true;
    } catch (err: any) {
        console.error(`❌ Connection Error: ${err.message}`);
        if (err.message.includes('password')) console.error('   -> Check Password');
        if (err.message.includes('Tenant')) console.error('   -> Check Project Ref / User format');
        await client.end().catch(() => { });
        return false;
    }
}

async function run() {
    // 1. DNS Checks
    await testDNS(DIRECT_HOST);
    await testDNS(POOLER_HOST);

    // 2. Connection Checks

    // a) Direct Connection (Standard 5432)
    // format: postgres://postgres:[pw]@[host]:5432/postgres
    await testConnection('Direct (5432)', {
        connectionString: `postgresql://postgres:${PASSWORD}@${DIRECT_HOST}:5432/postgres`,
        ssl: { rejectUnauthorized: false } // Supabase requires SSL, but sometimes cert verification fails locally
    });

    // b) Pooler Connection (Standard 6543) - Project User
    // format: postgres://postgres.[ref]:[pw]@[host]:6543/postgres
    await testConnection('Pooler (6543) - Project User', {
        connectionString: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${POOLER_HOST}:6543/postgres`,
        ssl: { rejectUnauthorized: false }
    });

    // c) Pooler Connection - Generic User (Sometimes works if host is specific?)
    await testConnection('Pooler (6543) - Generic User', {
        connectionString: `postgresql://postgres:${PASSWORD}@${POOLER_HOST}:6543/postgres`,
        ssl: { rejectUnauthorized: false }
    });

    // d) Pooler Connection (5432) - Generic User
    await testConnection('Pooler (5432) - Generic User', {
        connectionString: `postgresql://postgres:${PASSWORD}@${POOLER_HOST}:5432/postgres`,
        ssl: { rejectUnauthorized: false }
    });

    // e) Pooler Connection (5432) - Project User
    await testConnection('Pooler (5432) - Project User', {
        connectionString: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${POOLER_HOST}:5432/postgres`,
        ssl: { rejectUnauthorized: false }
    });
}

run().catch(console.error);
