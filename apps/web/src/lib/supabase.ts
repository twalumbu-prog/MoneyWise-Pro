import { createClient } from '@supabase/supabase-js';
import { Database } from 'shared/dist/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://klfeluphcutgppkhaxyl.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZmVsdXBoY3V0Z3Bwa2hheHlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTQwNDUsImV4cCI6MjA4MDE3MDA0NX0.8h15ZYRJlQDiG_m7N03f0WoamR4bq7CMROT62sg3qZ4';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase URL or Key');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
