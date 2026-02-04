
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Use default which looks in CWD (apps/api)
let envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not found in apps/api/.env, checking root .env...');
    envPath = path.resolve(process.cwd(), '../../.env');
    console.log('Target root .env path:', envPath);
    console.log('File exists:', fs.existsSync(envPath));
    const result = dotenv.config({ path: envPath });
    console.log('Dotenv parsed keys form root:', result.parsed ? Object.keys(result.parsed) : 'None');
}

const runMigration = async () => {
    try {
        console.log('CWD:', process.cwd());
        console.log('Database URL:', process.env.DATABASE_URL ? 'Found' : 'Missing');

        if (!process.env.DATABASE_URL) {
            // Try to construct it from SUPABASE_URL if possible? No, password is missing.
            throw new Error('DATABASE_URL is missing');
        }

        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });

        const sqlPath = path.resolve(__dirname, '../db/migrations/add_user_trigger.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        const client = await pool.connect();
        try {
            await client.query(sql);
            console.log('Migration completed successfully.');
        } finally {
            client.release();
        }
        await pool.end();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

runMigration();
