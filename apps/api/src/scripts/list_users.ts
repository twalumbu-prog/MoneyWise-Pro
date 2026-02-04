
import pool from '../db/index';

async function listUsers() {
    try {
        console.log('Fetching users and roles...');
        const res = await pool.query('SELECT id, email, role FROM users');
        console.table(res.rows);
    } catch (err) {
        console.error('Failed to list users:', err);
    } finally {
        await pool.end();
    }
}

listUsers();
