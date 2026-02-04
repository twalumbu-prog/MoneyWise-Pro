
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const ACCESS_TOKEN = 'sbp_3a3b79bcfa0e4e072499cf0e22a6ced83723b3d6';

async function runMigration() {
    const sqlPath = path.resolve(__dirname, '../db/migrations/add_ai_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`Running migration via Management API for project: ${PROJECT_REF}`);

    try {
        const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sql })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Migration failed:', data);
            process.exit(1);
        }

        console.log('Migration successful!');
        console.log('Response:', data);
    } catch (error) {
        console.error('Error running migration:', error);
        process.exit(1);
    }
}

runMigration();
