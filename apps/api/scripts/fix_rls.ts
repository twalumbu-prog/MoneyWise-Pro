import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function fixRLS() {
    // Original pooler host but port 5432 and no pgbouncer param
    const directUrl = process.env.DATABASE_URL!
        .replace(':6543/', ':5432/')
        .replace('?pgbouncer=true', '')
        .replace('&pgbouncer=true', '');

    console.log(`🔌 Connecting to: ${directUrl.split('@')[1]}`);
    const pool = new Pool({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected');

        console.log('🚀 Running SQL...');
        const sql = `
            ALTER TABLE cashbook_entries ENABLE ROW LEVEL SECURITY;

            DROP POLICY IF EXISTS "Allow all users to read cashbook" ON cashbook_entries;
            CREATE POLICY "Allow all users to read cashbook" 
            ON cashbook_entries FOR SELECT 
            TO authenticated
            USING (true);

            DROP POLICY IF EXISTS "Allow cashiers and admins to insert cashbook" ON cashbook_entries;
            CREATE POLICY "Allow cashiers and admins to insert cashbook" 
            ON cashbook_entries FOR INSERT 
            TO authenticated
            WITH CHECK (true);
        `;

        await client.query(sql);
        console.log('✅ RLS and Policies updated successfully!');

        client.release();
        await pool.end();
    } catch (err: any) {
        console.error('❌ Error:', err.message);
        await pool.end();
    }
}

fixRLS();
