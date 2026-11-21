-- Personal onboarding M3 (docs/personal-onboarding-plan.md): verified phone number and a person's avatar.
--
-- users.phone              the person's verified number, E.164 (+260971234567)
-- users.phone_verified_at  when the one-time code was confirmed
-- phone_verifications      the code in flight: one row per user, only the SHA-256 of the code is kept,
--                          5 wrong tries lock it for 10 minutes. API (service role) only.
-- user-avatars bucket      public-read pictures; the API uploads with the service role.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.phone_verifications (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ
);

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_verifications FROM anon, authenticated;
GRANT ALL ON public.phone_verifications TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-avatars', 'user-avatars', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read user-avatars" ON storage.objects;
CREATE POLICY "Public read user-avatars" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'user-avatars');
