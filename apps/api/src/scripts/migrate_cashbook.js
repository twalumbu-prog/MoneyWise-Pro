// Script to run cashbook enhancement migration
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log('Running cashbook enhancement migration...');

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '../db/migrations/add_cashbook_enhancements.sql'),
            'utf8'
        );

        await pool.query(migrationSQL);

        console.log('✅ Migration completed successfully');
        console.log('✅ Cashbook table enhanced with:');
        console.log('   - entry_type column');
        console.log('   - requisition_id column');
        console.log('   - created_by column');
        console.log('   - Indexes for efficient querying');
        console.log('   - Opening balance (if first time)');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
