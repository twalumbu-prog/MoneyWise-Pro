
import { supabase } from '../lib/supabase';

// Mock auth context or use service role for verification
// Actually we can use service role key if available in env, otherwise we might need to query public if RLS allows or use a known user token.
// But `apps/api/src/lib/supabase.ts` exports a client.
// Let's check `apps/api/src/lib/supabase.ts`.
// It uses `process.env.SUPABASE_SERVICE_ROLE_KEY`.

const checkRequisitions = async () => {
    // We need to make sure we use the service role client if we want to bypass RLS, 
    // or we assume RLS allows reading if we can't sign in.
    // The `supabase` client exported in api/lib/supabase might be admin if initialized with service key.

    // Let's try to query directly.
    const { data, error } = await supabase
        .from('requisitions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching:', error);
    } else {
        console.log('Recent requisitions:', JSON.stringify(data, null, 2));
    }
};

checkRequisitions();
