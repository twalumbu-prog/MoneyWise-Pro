-- Reusable KYC profile: everything an investment company asks for, saved once per person and reused for
-- every new company ("one-click" applications). RLS on with no policies: only the API (service role) touches it.
-- Keep in step with the inline migration in apps/api/src/index.ts.
CREATE TABLE IF NOT EXISTS public.investor_kyc_profiles (
    user_id    UUID PRIMARY KEY,
    applicant  JSONB NOT NULL DEFAULT '{}'::jsonb,
    id_type    TEXT,
    documents  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investor_kyc_profiles ENABLE ROW LEVEL SECURITY;
