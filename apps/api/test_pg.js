const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected!');
    const res = await client.query(`
      SELECT indexdef 
      FROM pg_indexes 
      WHERE indexname = 'idx_cashbook_unique_disbursement';
    `);
    console.log('Index Definition:', res.rows[0]);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
