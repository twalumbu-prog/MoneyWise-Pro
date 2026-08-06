-- scheduled_items: recurring financial commitments (bills, subscriptions, etc.)
CREATE TABLE IF NOT EXISTS public.scheduled_items (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID        NOT NULL,
    created_by      UUID        NOT NULL,
    title           TEXT        NOT NULL,
    amount          NUMERIC(15, 2) NOT NULL,
    category        TEXT        NOT NULL DEFAULT 'GENERAL_EXPENSES'
        CHECK (category IN ('BILLS', 'SUBSCRIPTIONS', 'INVESTMENTS', 'LOAN_REPAYMENTS', 'GENERAL_EXPENSES')),
    cadence         TEXT        NOT NULL DEFAULT 'MONTHLY'
        CHECK (cadence IN ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY')),
    due_day         INTEGER     CHECK (due_day BETWEEN 1 AND 31), -- day-of-month anchor for monthly/quarterly
    next_due_date   DATE        NOT NULL,
    description     TEXT,
    status          TEXT        NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- scheduled_item_runs: one row per triggered occurrence
CREATE TABLE IF NOT EXISTS public.scheduled_item_runs (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    scheduled_item_id   UUID        NOT NULL REFERENCES public.scheduled_items(id) ON DELETE CASCADE,
    organization_id     UUID        NOT NULL,
    due_date            DATE        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'UPCOMING'
        CHECK (status IN ('UPCOMING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    requisition_id      UUID,           -- populated once "run now" fires
    triggered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (scheduled_item_id, due_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_items_org
    ON public.scheduled_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_items_next_due
    ON public.scheduled_items (next_due_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_item_runs_item
    ON public.scheduled_item_runs (scheduled_item_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_item_runs_org
    ON public.scheduled_item_runs (organization_id, due_date DESC);

-- RLS (service-role API handles auth; permissive policies like the rest of the app)
ALTER TABLE public.scheduled_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_item_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_items' AND policyname = 'service_role_all_scheduled_items'
  ) THEN
    CREATE POLICY service_role_all_scheduled_items ON public.scheduled_items USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_item_runs' AND policyname = 'service_role_all_scheduled_item_runs'
  ) THEN
    CREATE POLICY service_role_all_scheduled_item_runs ON public.scheduled_item_runs USING (true) WITH CHECK (true);
  END IF;
END $$;
