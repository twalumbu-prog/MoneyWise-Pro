
import { supabase } from '../lib/supabase';
import pool from '../db';

const setupExpenseFeature = async () => {
    console.log('--- Setting up Expense Tracking Feature ---');

    // 1. Create Receipt Storage Bucket
    try {
        console.log('1. Creating "receipts" storage bucket...');
        const { data, error } = await supabase.storage.createBucket('receipts', {
            public: false,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
        });

        if (error) {
            if (error.message.includes('already exists')) {
                console.log('   Bucket "receipts" already exists.');
            } else {
                console.error('   Failed to create bucket:', error.message);
            }
        } else {
            console.log('   Bucket "receipts" created successfully.');
        }
    } catch (e) {
        console.error('   Error creating bucket:', e);
    }

    // 2. Add Columns to Database
    // We try to run this via pg, debugging connection if it fails
    try {
        console.log('2. Adding columns to line_items table...');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Allow this to be idempotent
            await client.query(`
                ALTER TABLE line_items 
                ADD COLUMN IF NOT EXISTS actual_amount DECIMAL(10, 2),
                ADD COLUMN IF NOT EXISTS receipt_url TEXT;
            `);

            await client.query('COMMIT');
            console.log('   Columns added successfully.');
        } catch (dbErr: any) {
            await client.query('ROLLBACK');
            throw dbErr;
        } finally {
            client.release();
        }
    } catch (e: any) {
        console.error('   FAILED database migration:', e.message);
        console.log('   (If this fails due to connection issues, we may need to run the SQL manually or fix the connection string)');
    } finally {
        await pool.end();
    }
};

setupExpenseFeature();
