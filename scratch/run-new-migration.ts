import fs from 'fs';
import path from 'path';
import pool from '../apps/api/src/db/index';

const runMigration = async () => {
    try {
        const migrationPath = path.resolve(__dirname, '../apps/api/src/db/migrations/20260605110000_add_user_organizations.sql');
        console.log('Reading migration file from:', migrationPath);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executing migration SQL...');
        await pool.query(sql);
        console.log('Migration executed successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
};

runMigration();
