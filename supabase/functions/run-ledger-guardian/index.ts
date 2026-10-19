import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Runs the Ledger Guardian cycle (see apps/api/src/services/ledgerGuardian/): re-verifies every organization's
// inflows, outflows, sweeps and closing balance against Lenco and records the result. The Lenco sync already runs a
// guardian pass with whatever time it has left; this dedicated trigger guarantees every organization is checked (and
// its daily full-history baseline refreshed) regardless of how busy the sync is. Idempotent — overlapping calls are safe
// (each org has a run lock).
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const apiUrl = Deno.env.get('API_URL') || 'http://localhost:3000';
        const syncSecret = Deno.env.get('LENCO_SYNC_SECRET') || '';

        const response = await fetch(`${apiUrl}/lenco/guardian`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${syncSecret}` },
            body: '{}',
        });
        if (!response.ok) {
            throw new Error(`Node API responded with status ${response.status}: ${await response.text()}`);
        }
        const data = await response.json();
        console.log('[Edge Function] Ledger Guardian cycle:', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('[Edge Function] Ledger Guardian trigger failed:', error);
        return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
