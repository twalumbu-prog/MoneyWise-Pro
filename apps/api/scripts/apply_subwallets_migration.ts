import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const ACCESS_TOKEN = 'sbp_3a3b79bcfa0e4e072499cf0e22a6ced83723b3d6';

async function runStandaloneMigration() {
    console.log('Reading migration SQL file...');
    const migrationPath = path.join(__dirname, '../../../supabase/migrations/20260602100000_add_lenco_subwallets.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Force applying migration via Management API for project: ${PROJECT_REF}...`);
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

        console.log('Migration applied successfully via HTTP API!');
        console.log('Response:', data);
    } catch (err: any) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runStandaloneMigration();

