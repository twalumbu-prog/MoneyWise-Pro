import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const runMigration = async () => {
    // Remove the pgbouncer parameter and connect directly
    let dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    // Try direct connection (remove pgbouncer parameter if present)
    const directUrl = dbUrl.replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');

    console.log('🔌 Attempting direct database connection...');

    const pool = new Pool({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected to database');

        console.log('🚀 Running migration...\n');

        const sql = `
            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS entry_type VARCHAR(50) CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE')),
            ADD COLUMN IF NOT EXISTS requisition_id UUID REFERENCES requisitions(id),
            ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
        `;

        console.log(sql);

        await client.query(sql);

        console.log('\n✅ Migration completed successfully!');
        console.log('📋 Verifying columns were added...\n');

        // Verify the columns exist
        const verifyQuery = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'cashbook_entries' 
            AND column_name IN ('entry_type', 'requisition_id', 'created_by')
            ORDER BY column_name;
        `;

        const result = await client.query(verifyQuery);

        if (result.rows.length === 3) {
            console.log('✅ All columns verified:');
            result.rows.forEach(row => {
                console.log(`   - ${row.column_name}: ${row.data_type}`);
            });
        } else {
            console.log('⚠️  Only found', result.rows.length, 'of 3 columns');
        }

        client.release();
        await pool.end();
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        await pool.end();
        process.exit(1);
    }
};

runMigration();
