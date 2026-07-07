-- Track when a team-member invitation expires, so we can enforce our own
-- 12-hour window independent of Supabase's own invite-link expiry setting.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
