import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    try {
        console.log('📦 Reading migration file...');
        const sqlPath = path.resolve(__dirname, '../db/migrations/add_cashbook_columns.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('🚀 Executing migration...\n');
        console.log(sql);

        // Try using Supabase's query method (may not work for DDL)
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error('\n❌ Migration via RPC failed:', error.message);
            console.log('\n📋 Please run this SQL manually in Supabase Dashboard > SQL Editor:\n');
            console.log(sql);
            console.log('\n💡 Dashboard URL: https://supabase.com/dashboard/project/klfeluphcutgppkhaxyl/sql');
        } else {
            console.log('\n✅ Migration completed successfully!');
        }
    } catch (err: any) {
        console.error('\n❌ Error:', err.message);
        console.log('\n📋 Please run the migration manually in Supabase Dashboard.');
    }
}

runMigration();
