import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { promisify } from 'util';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const resolve4 = promisify(dns.resolve4);

const PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'jwBDdE8HbNoiMFBz';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'klfeluphcutgppkhaxyl';
const HOSTNAME = process.env.SUPABASE_DB_HOST || 'aws-0-eu-central-1.pooler.supabase.com';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

async function run() {
    const sqlPath = path.join(__dirname, '01_recalculate_balance_rpc.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`Setting public DNS resolvers...`);
    dns.setServers(['8.8.8.8', '1.1.1.1']);

    console.log(`Resolving DNS for ${HOSTNAME}...`);
    let ip: string;
    try {
        const ips = await resolve4(HOSTNAME);
        ip = ips[0];
        console.log(`Resolved to IP: ${ip}`);
    } catch (dnsErr: any) {
        console.warn(`DNS Resolution failed (${dnsErr.message}). Falling back to cached IP: 18.156.40.2`);
        ip = '18.156.40.2';
    }

    console.log('Connecting to remote database IP...');
    const client = new Client({
        host: ip,
        port: 6543,
        database: 'postgres',
        user: `postgres.${PROJECT_REF}`,
        password: PASSWORD,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected!');
        console.log('Executing SQL from 01_recalculate_balance_rpc.sql...');
        await client.query(sql);
        console.log('Successfully created the public.recalculate_cashbook_balances function!');
    } catch (err: any) {
        console.warn('PostgreSQL direct connection failed. Falling back to Supabase Management API...', err.message);
        try {
            const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: sql })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(JSON.stringify(data));
            }

            console.log('Successfully created the public.recalculate_cashbook_balances function via Management API fallback!');
        } catch (apiErr: any) {
            console.error('Management API fallback also failed:', apiErr.message);
        }
    } finally {
        try {
            await client.end();
        } catch (_) {}
    }
}

run();
