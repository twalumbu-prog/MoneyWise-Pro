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
        const syncSecret = Deno.env.get('LENCO_SYNC_SECRET') || '';

        console.log(`[Edge Function] Triggering Lenco sync on API_URL: ${apiUrl}`);

        const response = await fetch(`${apiUrl}/lenco/sync`, {
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
        console.log('[Edge Function] Lenco sync completed successfully:', JSON.stringify(data));

        return new Response(
            JSON.stringify({ success: true, data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[Edge Function] Error triggering Lenco sync:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
