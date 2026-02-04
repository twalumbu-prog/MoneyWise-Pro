import { Pool } from 'pg';
import dotenv from 'dotenv';

import path from 'path';

// Try to load .env, but don't fail if missing (Vercel provides env vars directly)
dotenv.config();

console.log('[DB] Loading database config...');
console.log('[DB] DATABASE_URL present:', !!process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) console.error('[DB] Error: DATABASE_URL is missing!');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
