const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/moneywise'
});

async function applyMigration() {
  try {
    await client.connect();
    console.log('Connected to database');

    const query = `
      ALTER TABLE public.requisitions 
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS recipient_account VARCHAR(50),
      ADD COLUMN IF NOT EXISTS recipient_bank_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);
    `;

    await client.query(query);
    console.log('Migration applied successfully');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}

applyMigration();
