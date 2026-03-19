import pool from './src/db';

async function findData() {
    try {
        const query = `
            SELECT 
                r.id, r.status, r.reference_number, 
                d.id as disbursement_id, d.total_prepared, d.external_reference,
                ce.id as cashbook_id, ce.description, ce.credit, ce.debit
            FROM requisitions r
            LEFT JOIN disbursements d ON d.requisition_id = r.id
            LEFT JOIN cashbook_entries ce ON ce.requisition_id = r.id
            WHERE r.id::text LIKE '41b45cf5%' OR r.reference_number LIKE '%41b45cf5%';
        `;
        const res = await pool.query(query);
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findData();
