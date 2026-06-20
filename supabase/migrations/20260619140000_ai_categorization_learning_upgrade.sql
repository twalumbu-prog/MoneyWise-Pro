-- =====================================================================
-- AI Categorization Learning Upgrade
-- Makes transaction memory (a) per-organization, (b) authoritative on
-- user corrections, and (c) actually able to overwrite a stale mapping.
--
-- Root issues this fixes:
--   * ai_transaction_memory had NO organization_id -> one org's learning
--     bled into every other org (multi-tenant correctness + isolation bug).
--   * increment_memory_usage() never updated system_account_id ON CONFLICT,
--     so once a signature existed its account could never be corrected.
--   * match_ai_memory() was global (not org-scoped).
-- =====================================================================

-- 1. Per-org scoping + verification metadata -------------------------------
ALTER TABLE public.ai_transaction_memory
  ADD COLUMN IF NOT EXISTS organization_id   UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_user_verified  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_corrected_at TIMESTAMPTZ;

-- Replace the GLOBAL unique(description_signature) with a PER-ORG unique key.
-- (Legacy rows keep organization_id = NULL; they become inert because every
--  lookup is now org-scoped. NULLs are distinct in a unique index, so they
--  never collide with new per-org rows.)
ALTER TABLE public.ai_transaction_memory
  DROP CONSTRAINT IF EXISTS ai_transaction_memory_description_signature_key;
DROP INDEX IF EXISTS public.ai_transaction_memory_description_signature_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_memory_org_signature
  ON public.ai_transaction_memory (organization_id, description_signature);

CREATE INDEX IF NOT EXISTS idx_ai_memory_org
  ON public.ai_transaction_memory (organization_id);

-- 2. Authoritative learn function ------------------------------------------
-- Replaces increment_memory_usage. Key behaviours:
--   * Upsert keyed on (organization_id, description_signature).
--   * An AUTHORITATIVE write (a user confirmation/correction) OVERWRITES the
--     mapping, raises confidence, marks the row user-verified, and stamps
--     last_corrected_at -> this is why corrections finally "stick".
--   * A non-authoritative write (the AI auto-learning a high-confidence
--     prediction) only bumps usage_count and will NOT clobber a row a human
--     has already verified.
DROP FUNCTION IF EXISTS public.increment_memory_usage(text, uuid, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.learn_transaction_memory(
  p_org_id        UUID,
  p_signature     TEXT,
  p_account_id    UUID,
  p_confidence    NUMERIC,
  p_intent        JSONB,
  p_authoritative BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ai_transaction_memory AS m
    (organization_id, description_signature, system_account_id, intent,
     confidence, usage_count, is_user_verified, last_corrected_at)
  VALUES
    (p_org_id, p_signature, p_account_id, p_intent,
     LEAST(p_confidence, 1.0), 1, p_authoritative,
     CASE WHEN p_authoritative THEN NOW() ELSE NULL END)
  ON CONFLICT (organization_id, description_signature) DO UPDATE SET
    usage_count       = m.usage_count + 1,
    last_used_at      = NOW(),
    system_account_id = CASE WHEN p_authoritative OR NOT m.is_user_verified
                             THEN p_account_id ELSE m.system_account_id END,
    confidence        = CASE WHEN p_authoritative OR NOT m.is_user_verified
                             THEN GREATEST(m.confidence, LEAST(p_confidence, 1.0))
                             ELSE m.confidence END,
    intent            = CASE WHEN p_authoritative OR NOT m.is_user_verified
                             THEN p_intent ELSE m.intent END,
    is_user_verified  = m.is_user_verified OR p_authoritative,
    last_corrected_at = CASE WHEN p_authoritative
                             THEN NOW() ELSE m.last_corrected_at END;
END;
$$ LANGUAGE plpgsql;

-- 3. Org-scoped vector similarity search -----------------------------------
-- New return columns (usage_count, is_user_verified) let the app weight a
-- match by how often / how authoritatively it has been confirmed.
DROP FUNCTION IF EXISTS public.match_ai_memory(vector, float, int);

CREATE OR REPLACE FUNCTION public.match_ai_memory(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int,
  p_org_id        uuid DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  system_account_id uuid,
  confidence       float,
  usage_count      int,
  is_user_verified boolean,
  similarity       float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.system_account_id,
    m.confidence::float,
    m.usage_count,
    m.is_user_verified,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.ai_transaction_memory m
  WHERE m.embedding IS NOT NULL
    AND (p_org_id IS NULL OR m.organization_id = p_org_id)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
