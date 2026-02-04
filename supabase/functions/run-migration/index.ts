
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import postgres from "https://deno.land/x/postgresjs@v3.3.3/mod.js"

const databaseUrl = Deno.env.get("DATABASE_URL") || Deno.env.get("SUPABASE_DB_URL") || "postgresql://postgres.klfeluphcutgppkhaxyl:jwBDdE8HbNoiMFBz@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

const sql = postgres(databaseUrl, {
    ssl: "require",
    connect_timeout: 10,
})

serve(async (req) => {
    try {
        console.log("Starting migration within Edge Function...")

        // 1. Add category column
        await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS category TEXT;`
        console.log("Migration successful: added category column.")

        return new Response(JSON.stringify({ message: "Migration successful" }), {
            headers: { "Content-Type": "application/json" },
        })
    } catch (error) {
        console.error("Migration failed:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        })
    } finally {
        // Avoid closing the connection immediately if you want to reuse it, 
        // but for a one-off migration it's fine.
    }
})
