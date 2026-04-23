const { Client } = require('pg');

const password = 'jwBDdE8HbNoiMFBz';
const tenant = 'klfeluphcutgppkhaxyl';
const host = 'aws-0-eu-central-1.pooler.supabase.com';
const directUrl = `postgresql://postgres.${tenant}:${password}@${host}:5432/postgres`;

const client = new Client({
  connectionString: directUrl,
  ssl: { rejectUnauthorized: false }
});

async function applyFix() {
  try {
    await client.connect();
    console.log('Connected to remote database');

    const query = `
      ALTER TABLE public.requisitions 
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS recipient_account VARCHAR(50),
      ADD COLUMN IF NOT EXISTS recipient_bank_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);
    `;

    await client.query(query);
    console.log('Migration applied successfully to remote database');
  } catch (err) {
    console.error('Error applying migration:', err.message);
  } finally {
    await client.end();
  }
}

applyFix();
