import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const sql = `
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS audit_score NUMERIC DEFAULT 0;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS audit_score_breakdown JSONB DEFAULT '{}';
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS accounted_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN requisitions.audit_score IS 'Calculated audit score (0-100)';
COMMENT ON COLUMN requisitions.audit_score_breakdown IS 'Breakdown of the audit score components (Timing, Compliance, Accuracy)';
COMMENT ON COLUMN requisitions.accounted_at IS 'Timestamp when the requisition was posted to accounting/QuickBooks';
`;

async function applyMigration() {
    console.log('Connecting to database...');
    try {
        await pool.query(sql);
        console.log('Migration applied successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

applyMigration();
