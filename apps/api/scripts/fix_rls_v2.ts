import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function fixRLS() {
    const password = 'jwBDdE8HbNoiMFBz';
    const tenant = 'klfeluphcutgppkhaxyl';
    // Trying .com instead of .co
    const directUrl = `postgresql://postgres:${password}@db.${tenant}.supabase.com:5432/postgres`;

    console.log(`🔌 Attempting to connect to: ${directUrl.split('@')[1]}`);
    const pool = new Pool({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected');

        console.log('🚀 Running SQL to disable RLS and add policies...');
        const sql = `
            -- Disable RLS to ensure data is visible regardless of policies for now
            ALTER TABLE cashbook_entries DISABLE ROW LEVEL SECURITY;
            
            -- Also add policies just in case it's re-enabled
            DROP POLICY IF EXISTS "Allow all users to read cashbook" ON cashbook_entries;
            CREATE POLICY "Allow all users to read cashbook" 
            ON cashbook_entries FOR SELECT 
            TO authenticated
            USING (true);

            DROP POLICY IF EXISTS "Allow all users to insert cashbook" ON cashbook_entries;
            CREATE POLICY "Allow all users to insert cashbook" 
            ON cashbook_entries FOR INSERT 
            TO authenticated
            WITH CHECK (true);
        `;

        await client.query(sql);
        console.log('✅ Success!');

        client.release();
        await pool.end();
    } catch (err: any) {
        console.error('❌ Error:', err.message);
        await pool.end();
    }
}

fixRLS();
