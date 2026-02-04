import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import requisitionRoutes from './routes/requisition.routes';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import voucherRoutes from './routes/voucher.routes';
import cashbookRoutes from './routes/cashbook.routes';

dotenv.config();

import pool from './db';

const runMigration = async () => {
    const directUrl = process.env.DIRECT_DATABASE_URL;
    if (!directUrl) {
        console.warn('[Migration] DIRECT_DATABASE_URL not found, using default pool (may fail for DDL)');
    }

    const migrationPool = directUrl
        ? new Pool({ connectionString: directUrl, ssl: { rejectUnauthorized: false } })
        : pool;

    try {
        console.log('[Migration] Starting startup migration using ' + (directUrl ? 'direct connection' : 'default pool') + '...');

        console.log('[Migration] Checking for "category" column in "accounts" table...');
        await migrationPool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS category TEXT;');

        console.log('[Migration] Checking for change return columns in "disbursements" table...');
        await migrationPool.query(`
            ALTER TABLE disbursements 
            ADD COLUMN IF NOT EXISTS returned_denominations JSONB,
            ADD COLUMN IF NOT EXISTS actual_change_amount NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS confirmed_denominations JSONB,
            ADD COLUMN IF NOT EXISTS confirmed_change_amount NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC DEFAULT 0;
        `);

        console.log('[Migration] Checking for status column in "cashbook_entries" table...');
        await migrationPool.query(`
            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
        `);

        console.log('[Migration] Schema update successful.');
    } catch (err) {
        console.error('[Migration] Failed to run startup migration:', err);
    } finally {
        if (directUrl && migrationPool instanceof Pool) {
            await (migrationPool as Pool).end();
            console.log('[Migration] Direct connection pool closed.');
        }
    }
};

runMigration();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/requisitions', requisitionRoutes);
app.use('/accounts', accountRoutes);
app.use('/vouchers', voucherRoutes);
app.use('/cashbook', cashbookRoutes);

app.get('/', (req, res) => {
    res.send('AE&CF API is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
