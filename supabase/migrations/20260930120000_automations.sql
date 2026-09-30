-- Automations: rules the user (via the Intelligence assistant) sets up once and
-- the system then runs the same way every time.
--
-- v1 trigger:  WALLET_DEPOSIT  — money lands in one of the org's wallets.
-- v1 actions:  FORWARD_PAYMENT — pay the deposit on to a bank account.
--              SEND_POP_EMAIL  — email a Proof of Transfer once it is confirmed.
--
-- trigger_config / actions are jsonb so new triggers and actions are added in
-- code (services/automation.service.ts) without another migration.
--
-- Access model matches investment_targets: RLS on, no policies. Only the API
-- (service role) reads or writes these tables.

CREATE TABLE IF NOT EXISTS public.automations (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by      UUID        NOT NULL,
    name            TEXT        NOT NULL,
    description     TEXT,
    status          TEXT        NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
    trigger_type    TEXT        NOT NULL DEFAULT 'WALLET_DEPOSIT'
        CHECK (trigger_type IN ('WALLET_DEPOSIT')),
    -- { wallet_id, min_amount?, entry_types? }
    trigger_config  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- ordered list: [{ type: 'FORWARD_PAYMENT', ... }, { type: 'SEND_POP_EMAIL', to }]
    actions         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- Only deposits recorded after this instant are picked up, so creating an
    -- automation never sweeps up money that arrived before it existed.
    watch_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_org
    ON public.automations (organization_id, status);

CREATE TABLE IF NOT EXISTS public.automation_runs (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    automation_id     UUID        NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
    organization_id   UUID        NOT NULL,
    source            TEXT        NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'MANUAL')),
    -- Identifies what fired the run (the cashbook entry id). The partial unique
    -- index below is the exactly-once guarantee: a deposit can only ever be
    -- claimed by one run, no matter how many ticks race for it.
    trigger_ref       TEXT,
    trigger_summary   TEXT,
    amount            NUMERIC(15, 2),
    forwarded_amount  NUMERIC(15, 2),
    status            TEXT        NOT NULL DEFAULT 'RUNNING'
        CHECK (status IN ('RUNNING', 'AWAITING_CONFIRMATION', 'COMPLETED', 'FAILED', 'SKIPPED')),
    attempts          INTEGER     NOT NULL DEFAULT 1,
    steps             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    error             TEXT,
    requisition_id    UUID,
    pop_sent_at       TIMESTAMPTZ,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_runs_trigger
    ON public.automation_runs (automation_id, trigger_ref)
    WHERE trigger_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
    ON public.automation_runs (automation_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_runs_open
    ON public.automation_runs (status)
    WHERE status IN ('RUNNING', 'AWAITING_CONFIRMATION', 'FAILED');

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
