import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const apiUrl = Deno.env.get('API_URL') || 'http://localhost:3000';
        // Falls back to LENCO_SYNC_SECRET, matching the API's own fallback
        // (see syncAllMasterFees in masterfees.controller.ts) so this cron can
        // reuse the existing secret without provisioning a new one.
        const syncSecret = Deno.env.get('MASTERFEES_SYNC_SECRET') || Deno.env.get('LENCO_SYNC_SECRET') || '';

        console.log(`[Edge Function] Triggering Master Fees sync on API_URL: ${apiUrl}`);

        const response = await fetch(`${apiUrl}/integrations/masterfees/sync-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${syncSecret}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Node API responded with status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('[Edge Function] Master Fees sync completed successfully:', JSON.stringify(data));

        return new Response(
            JSON.stringify({ success: true, data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[Edge Function] Error triggering Master Fees sync:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
