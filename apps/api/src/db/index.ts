import { Pool } from 'pg';
import dotenv from 'dotenv';

import path from 'path';

// Try to load .env, but don't fail if missing (Vercel provides env vars directly)
dotenv.config();

console.log('[DB] Initializing database pool...');
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('[DB] CRITICAL ERROR: DATABASE_URL is missing!');
}

const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl?.includes('supabase.co') || dbUrl?.includes('.db.elephantsql.com')
        ? { rejectUnauthorized: false }
        : false,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client', err);
});

export const query = (text: string, params?: any[]) => {
    console.log('[DB] Executing query:', text.substring(0, 50) + '...');
    return pool.query(text, params);
};
export default pool;
