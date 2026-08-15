import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Runs every 6 hours (see the accompanying pg_cron migration). Closes the class of
// bug found investigating Twalumbu 2026-08-15: the periodic Lenco sync trusts, but
// never verifies, that a "Split payment"/"Split-Inflow Payment" debit is already
// absorbed by a net-booked collection — so when that assumption breaks (e.g. Lenco's
// sub-account split-payment config stops sweeping some collections), the fee just
// vanishes from the ledger with no trace. This calls the same matching logic used to
// find and fix that gap by hand, across every linked org, on a schedule — so a future
// gap gets caught and posted within hours instead of sitting undetected for months.
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const apiUrl = Deno.env.get('API_URL') || 'http://localhost:3000';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        console.log(`[Edge Function] Triggering platform-fee healing pass on API_URL: ${apiUrl}`);

        const response = await fetch(`${apiUrl}/admin/reconciliation/heal-platform-fees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Node API responded with status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('[Edge Function] Platform-fee healing completed:', JSON.stringify(data));

        return new Response(
            JSON.stringify({ success: true, data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[Edge Function] Error triggering platform-fee healing:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
