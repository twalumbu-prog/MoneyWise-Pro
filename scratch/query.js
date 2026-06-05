const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/moneywise'
});
async function run() {
  await client.connect();
  const res = await client.query('SELECT id, date, balance_after, credit, debit FROM cashbook_entries ORDER BY date DESC LIMIT 2');
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
