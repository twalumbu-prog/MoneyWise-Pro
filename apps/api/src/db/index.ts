import { Pool } from 'pg';
import dotenv from 'dotenv';

import path from 'path';

// Force load .env from project root (apps/api/.env)
dotenv.config({ path: path.join(__dirname, '../../.env') });

console.log('[DB] Loading database config...');
console.log('[DB] DATABASE_URL present:', !!process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) console.error('[DB] Error: DATABASE_URL is missing!');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
