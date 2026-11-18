-- The latest quality check of each document on a person's MoneyWise ID: a score out of 100, whether it is usable, and what to fix.
-- The loan application reads this to say which documents still need replacing. Keep in step with the inline migration in apps/api/src/index.ts.
CREATE TABLE IF NOT EXISTS public.kyc_document_checks (
    user_id    UUID NOT NULL,
    slot       TEXT NOT NULL,                      -- id_front, id_back, photo, proof_of_residence
    path       TEXT NOT NULL,                      -- the file that was checked; a newer upload is a different path and needs a new check
    score      INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    level      TEXT NOT NULL CHECK (level IN ('good','ok','poor')),
    usable     BOOLEAN NOT NULL,
    issues     JSONB NOT NULL DEFAULT '[]'::jsonb,
    details    JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, slot)
);
ALTER TABLE public.kyc_document_checks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.kyc_document_checks TO service_role;
NOTIFY pgrst, 'reload config';
