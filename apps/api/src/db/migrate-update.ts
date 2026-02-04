import fs from 'fs';
import path from 'path';
import pool from './index';

const migrate = async () => {
    try {
        const schemaPath = path.join(__dirname, 'migrations/update_entry_types.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Running update_entry_types migration...');
        await pool.query(schemaSql);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
};

migrate();
