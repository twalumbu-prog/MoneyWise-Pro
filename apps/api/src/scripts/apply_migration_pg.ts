
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load env from api root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const applyMigration = async () => {
    const connectionString = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;

    if (!connectionString) {
        console.error('DATABASE_URL or DIRECT_DATABASE_URL not found in environment.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false } // Needed for Supabase usually
    });

    try {
        const migrationPath = path.resolve(__dirname, '../../../../supabase/migrations/20260124192000_add_change_return_flow.sql');
        console.log(`Reading migration from: ${migrationPath}`);

        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Applying migration...');

        await pool.query(sql);

        console.log('Migration applied successfully.');
    } catch (error: any) {
        console.error('Error applying migration:', error);
    } finally {
        await pool.end();
    }
};

applyMigration();
