import pool from './src/db';

async function findData() {
    try {
        const query = `
            SELECT 
                r.id, r.status, r.reference_number
            FROM requisitions r
            WHERE r.id::text LIKE '%f5663264%' OR r.reference_number LIKE '%F5663264%';
        `;
        const res = await pool.query(query);
        console.log('Requisition Info:');
        console.log(JSON.stringify(res.rows, null, 2));

        if (res.rows.length > 0) {
            const reqId = res.rows[0].id;
            const msgQuery = `
                SELECT id, content, message_type, metadata, created_at
                FROM requisition_messages
                WHERE requisition_id = $1
                ORDER BY created_at ASC;
            `;
            const msgRes = await pool.query(msgQuery, [reqId]);
            console.log('\nMessages:');
            console.log(JSON.stringify(msgRes.rows, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findData();
