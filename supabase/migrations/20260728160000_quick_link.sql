-- Quick Link — a friendly, amount-first payment link.
--
-- Adds:
--   * organizations.public_username — a clean, auto-generated slug (e.g.
--     "blueopus") separate from the existing timestamp-suffixed `slug`
--     column, used for the human-readable /pay/:username URL.
--   * quick_link_purposes — per-org, usage-ranked list of payment-purpose
--     tags shown as tap targets on the Quick Link confirm screen. Presets
--     are seeded lazily by the API the first time an org's list is empty.
--   * quick_link_payments — one row per Quick Link payment attempt, used by
--     the post-payment (fire-and-forget) purpose-learning + classification
--     hook in the Lenco webhook controller.
--   * increment_quick_link_purpose_usage — upsert-and-increment RPC,
--     mirroring the learn_transaction_memory() idiom from
--     20260619140000_ai_categorization_learning_upgrade.sql.

-- 1. Friendly per-org username ------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_username TEXT UNIQUE;

-- 2. Ranked purpose tags -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quick_link_purposes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    bucket          TEXT NOT NULL DEFAULT 'OTHER'
                        CHECK (bucket IN ('REVENUE', 'ASSET', 'LIABILITY', 'OTHER')),
    is_default      BOOLEAN NOT NULL DEFAULT false,
    usage_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uniq_quick_link_purpose_label UNIQUE (organization_id, label)
);

CREATE INDEX IF NOT EXISTS idx_quick_link_purposes_org_rank
  ON public.quick_link_purposes (organization_id, usage_count DESC, is_default DESC, created_at ASC);

ALTER TABLE public.quick_link_purposes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quick_link_purposes' AND policyname = 'Admins manage quick link purposes') THEN
        DROP POLICY "Admins manage quick link purposes" ON public.quick_link_purposes;
    END IF;
END $$;

CREATE POLICY "Admins manage quick link purposes" ON public.quick_link_purposes
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.organization_id = quick_link_purposes.organization_id
    )
);

-- 3. Per-payment purpose tracking (drives post-payment learning) --------------
CREATE TABLE IF NOT EXISTS public.quick_link_payments (
    reference       TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    wallet_id       UUID REFERENCES public.organization_wallets(id) ON DELETE SET NULL,
    purpose_label   TEXT NOT NULL,
    is_custom       BOOLEAN NOT NULL DEFAULT false,
    processed       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_link_payments_org ON public.quick_link_payments (organization_id);
CREATE INDEX IF NOT EXISTS idx_quick_link_payments_pending ON public.quick_link_payments (processed) WHERE processed = false;

ALTER TABLE public.quick_link_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quick_link_payments' AND policyname = 'Admins view quick link payments') THEN
        DROP POLICY "Admins view quick link payments" ON public.quick_link_payments;
    END IF;
END $$;

CREATE POLICY "Admins view quick link payments" ON public.quick_link_payments
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.organization_id = quick_link_payments.organization_id
    )
);

-- 4. Upsert-and-increment usage RPC --------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_quick_link_purpose_usage(
  p_org_id UUID,
  p_label  TEXT,
  p_bucket TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.quick_link_purposes AS q
    (organization_id, label, bucket, is_default, usage_count)
  VALUES
    (p_org_id, p_label, COALESCE(p_bucket, 'OTHER'), false, 1)
  ON CONFLICT (organization_id, label) DO UPDATE SET
    usage_count = q.usage_count + 1,
    updated_at  = NOW(),
    bucket      = CASE WHEN NOT q.is_default AND p_bucket IS NOT NULL THEN p_bucket ELSE q.bucket END;
END;
$$ LANGUAGE plpgsql;
