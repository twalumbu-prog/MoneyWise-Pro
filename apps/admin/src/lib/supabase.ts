import { createClient } from '@supabase/supabase-js';

// Auth/session client ONLY. The admin tool never reads financial tables directly
// with the anon key — every figure is fetched from the API behind super-admin auth.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://klfeluphcutgppkhaxyl.supabase.co';
// Public anon key (auth/session only) — same publishable key the main web app ships.
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZmVsdXBoY3V0Z3Bwa2hheHlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTQwNDUsImV4cCI6MjA4MDE3MDA0NX0.8h15ZYRJlQDiG_m7N03f0WoamR4bq7CMROT62sg3qZ4';

if (!supabaseUrl || !supabaseKey) {
    // eslint-disable-next-line no-console
    console.error('[Admin] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// Clear an expired / corrupt persisted session BEFORE the client initializes. A stale
// token otherwise triggers a background token-recovery on init that can stall and then
// block the next auth call (e.g. signInWithPassword) — the "sign-in button spins
// forever" bug. Dropping a dead session here means the user simply lands on the login
// form and a fresh sign-in starts from a clean state.
try {
    const ref = (supabaseUrl.match(/https?:\/\/([^.]+)\./) || [])[1] || 'klfeluphcutgppkhaxyl';
    const authKey = `sb-${ref}-auth-token`;
    const raw = localStorage.getItem(authKey);
    if (raw) {
        const parsed = JSON.parse(raw);
        const session = parsed?.currentSession ?? parsed;
        const expSec = Number(session?.expires_at);
        if (!expSec || expSec * 1000 < Date.now()) {
            localStorage.removeItem(authKey);
        }
    }
} catch {
    /* unparseable session — leave it; the auth-context failsafe still bounds loading */
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});
