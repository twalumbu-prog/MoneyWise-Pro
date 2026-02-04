
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const host = 'aws-0-eu-central-1.pooler.supabase.com';
const password = 'jwBDdE8HbNoiMFBz';
const tenant = 'klfeluphcutgppkhaxyl';
const directUrl = `postgresql://postgres.${tenant}:${password}@${host}:5432/postgres`;

async function checkConstraints() {
    const pool = new Pool({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
    try {
        console.log('Fetching constraints for requisitions table...');
        const res = await pool.query(`
            SELECT conname, pg_get_constraintdef(oid) 
            FROM pg_constraint 
            WHERE conrelid = 'requisitions'::regclass;
        `);
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkConstraints();
