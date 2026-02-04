
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Use default which looks in CWD (apps/api)
let envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.resolve(process.cwd(), 'apps/api/.env');
}
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not found in apps/api/.env, checking root .env...');
    envPath = path.resolve(process.cwd(), '../../.env');
    dotenv.config({ path: envPath });
}

const runMigration = async () => {
    try {
        console.log('Database URL:', process.env.DATABASE_URL ? 'Found' : 'Missing');

        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is missing');
        }

        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });

        const sqlPath = path.resolve(__dirname, '../db/migrations/add_ai_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running AI migration...');
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
