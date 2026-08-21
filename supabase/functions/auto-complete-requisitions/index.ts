/**
 * auto-complete-requisitions — hourly cron worker
 *
 * Runs every hour via pg_cron.  For each org with stuck unaccounted requisitions
 * (status DISBURSED — cash — or RECEIVED — digital disbursements, which is where
 * most requisitions actually land per disbursement.controller.ts):
 *   • 12 h old and reminder not yet sent  → POST /requisitions/auto-reminder (batch)
 *   • 24 h old and not yet auto-completed → POST /requisitions/:id/auto-complete
 *
 * The actual categorization + ledger logic lives in the prod API to avoid
 * duplicating it here, exactly as the Lenco/MasterFees sync edge functions do.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const apiUrl     = Deno.env.get('API_URL')        || 'http://localhost:3000';
    const syncSecret = Deno.env.get('LENCO_SYNC_SECRET') || '';  // reuse the internal secret

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')           ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const h12ago = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const results = {
        reminders_sent: 0,
        auto_completed: 0,
        errors: [] as string[],
    };

    try {
        // ── 1. Requisitions older than 12 h needing a reminder ──────────────
        const { data: reminderCandidates, error: remErr } = await supabase
            .from('requisitions')
            .select('id, organization_id, description, reference_number')
            .in('status', ['DISBURSED', 'RECEIVED'])
            .eq('is_auto_categorized', false)
            .is('auto_reminder_sent_at', null)
            .lt('updated_at', h12ago);

        if (remErr) throw new Error(`reminder query: ${remErr.message}`);

        if (reminderCandidates && reminderCandidates.length > 0) {
            // Group by org so we send ONE reminder email per org.
            const byOrg = new Map<string, typeof reminderCandidates>();
            for (const req of reminderCandidates) {
                const group = byOrg.get(req.organization_id) || [];
                group.push(req);
                byOrg.set(req.organization_id, group);
            }

            for (const [orgId, reqs] of byOrg) {
                try {
                    const resp = await fetch(`${apiUrl}/requisitions/auto-reminder`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${syncSecret}`,
                        },
                        body: JSON.stringify({
                            organization_id: orgId,
                            requisition_ids: reqs.map(r => r.id),
                        }),
                    });

                    if (!resp.ok) {
                        const txt = await resp.text();
                        throw new Error(`API ${resp.status}: ${txt}`);
                    }

                    // Mark reminder as sent to avoid re-sending next hour.
                    await supabase
                        .from('requisitions')
                        .update({ auto_reminder_sent_at: now.toISOString() })
                        .in('id', reqs.map(r => r.id));

                    results.reminders_sent += reqs.length;
                    console.log(`[AutoComplete] Sent reminder for org ${orgId}, ${reqs.length} requisitions`);
                } catch (err: any) {
                    const msg = `Reminder org ${orgId}: ${err.message}`;
                    results.errors.push(msg);
                    console.error(`[AutoComplete] ${msg}`);
                }
            }
        }

        // ── 2. Requisitions older than 24 h ready for auto-completion ───────
        const { data: completeCandidates, error: compErr } = await supabase
            .from('requisitions')
            .select('id')
            .in('status', ['DISBURSED', 'RECEIVED'])
            .eq('is_auto_categorized', false)
            .lt('updated_at', h24ago);

        if (compErr) throw new Error(`complete query: ${compErr.message}`);

        for (const req of completeCandidates || []) {
            try {
                const resp = await fetch(`${apiUrl}/requisitions/${req.id}/auto-complete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${syncSecret}`,
                    },
                    body: JSON.stringify({}),
                });

                if (!resp.ok) {
                    const txt = await resp.text();
                    throw new Error(`API ${resp.status}: ${txt}`);
                }

                results.auto_completed++;
                console.log(`[AutoComplete] Auto-completed requisition ${req.id}`);
            } catch (err: any) {
                const msg = `AutoComplete req ${req.id}: ${err.message}`;
                results.errors.push(msg);
                console.error(`[AutoComplete] ${msg}`);
            }
        }

        return new Response(
            JSON.stringify({ success: true, ...results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        console.error('[AutoComplete] Fatal error:', error.message);
        return new Response(
            JSON.stringify({ error: error.message, ...results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
