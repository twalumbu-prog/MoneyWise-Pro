import { createClient } from '@supabase/supabase-js';
import { Database } from 'shared';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ahatvfmvhecakpxtpnay.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYXR2Zm12aGVjYWtweHRwbmF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQzOTMsImV4cCI6MjEwNDE3MDM5M30.ithDfGCcfpg-43qrEgWdJnaGg9wMXux3ZGGlXEKt1Oo';

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
