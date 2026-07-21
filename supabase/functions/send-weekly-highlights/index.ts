import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Weekly Financial Highlights newsletter trigger.
 *
 * Mirrors sync-lenco-transactions: pg_cron calls this function, and it forwards
 * to the Node API (which owns Resend and the ledger maths) using the shared
 * LENCO_SYNC_SECRET. Scheduled for Monday 05:00 UTC — 07:00 in Lusaka — and it
 * summarises the week that ended the previous night.
 */
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const apiUrl = Deno.env.get('API_URL') || 'http://localhost:3000';
        const syncSecret = Deno.env.get('LENCO_SYNC_SECRET') || '';

        console.log(`[Edge Function] Triggering weekly highlights on API_URL: ${apiUrl}`);

        const response = await fetch(`${apiUrl}/ai/highlights/weekly-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${syncSecret}`,
            },
            // No organizationId — fan out to every organization.
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Node API responded with status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('[Edge Function] Weekly highlights run completed:', JSON.stringify(data));

        return new Response(
            JSON.stringify({ success: true, data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[Edge Function] Error triggering weekly highlights:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
