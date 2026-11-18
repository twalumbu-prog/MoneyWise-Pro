// Receives MTN MADAPI callbacks and stores them. MTN doesn't sign its callbacks, so the address carries a secret:
//   https://<project>.supabase.co/functions/v1/mtn-callback/<MTN_CALLBACK_SECRET>/<product>
// A wrong or missing secret gets a 404, the same as any page that isn't there. The function never acts on what MTN says; the API reads the
// stored row, asks MTN for the real status, and only then changes anything.
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
    const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
    if (x.length !== y.length) return false;
    let d = 0;
    for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
    return d === 0;
}

Deno.serve(async (req) => {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    const at = parts.indexOf('mtn-callback');
    const secret = parts[at + 1] ?? '';
    const product = (parts[at + 2] ?? 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'general';

    const want = Deno.env.get('MTN_CALLBACK_SECRET') ?? '';
    if (want.length < 16 || !secret || !safeEqual(secret, want)) return new Response('Not found', { status: 404 });
    if (req.method === 'GET' || req.method === 'HEAD') return json({ statusCode: '0000', statusMessage: 'ok' });

    const text = (await req.text()).slice(0, 100_000);
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { error } = await db.from('mtn_callbacks').insert({ product, method: req.method, body });
    if (error) { console.error('[mtn-callback] could not store the callback:', error.message); return json({ statusCode: '5000', statusMessage: 'could not store' }, 500); }
    return json({ statusCode: '0000', statusMessage: 'received' });
});
