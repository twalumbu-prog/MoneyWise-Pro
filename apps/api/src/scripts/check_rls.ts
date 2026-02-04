import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkRLS() {
    const directUrl = process.env.DATABASE_URL!.replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');
    const pool = new Pool({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();

        console.log('--- Table Properties ---');
        const tableRes = await client.query(`
            SELECT tablename, rowsecurity 
            FROM pg_tables 
            WHERE schemaname = 'public' AND tablename = 'cashbook_entries';
        `);
        console.log(tableRes.rows[0]);

        console.log('\n--- RLS Policies ---');
        const policyRes = await client.query(`
            SELECT * FROM pg_policies WHERE tablename = 'cashbook_entries';
        `);
        if (policyRes.rows.length === 0) {
            console.log('No policies found.');
        } else {
            policyRes.rows.forEach(p => console.log(`- ${p.policyname}: ${p.roles.join(', ')} (${p.cmd})`));
        }

        client.release();
        await pool.end();
    } catch (err: any) {
        console.error('Error:', err.message);
    }
}

checkRLS();
