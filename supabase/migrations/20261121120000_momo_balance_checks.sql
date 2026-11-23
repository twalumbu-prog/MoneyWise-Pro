-- momo_balance_checks — balance-enquiry replies ("Your MoMo balance is ZMW 105.00") captured from the phone.
-- Each one is compared with the provider account's balance in MoneyWise; when they differ the person gets a
-- one-tap adjustment in Review captured. Nothing is ever adjusted silently: a gap usually means a missed message.

CREATE TABLE IF NOT EXISTS public.momo_balance_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('ANDROID_SMS', 'ANDROID_NOTIFICATION', 'IOS_SHORTCUT', 'PASTE')),
    provider TEXT NOT NULL CHECK (provider IN ('MTN', 'AIRTEL', 'ZAMTEL', 'OTHER')),
    raw_text TEXT NOT NULL,
    balance NUMERIC(14, 2) NOT NULL,                 -- what the phone / provider says
    observed_at TIMESTAMPTZ NOT NULL,
    ledger_balance NUMERIC(14, 2),                   -- the provider account in MoneyWise when last compared
    pending_net NUMERIC(14, 2),                      -- captured-but-unbooked movements counted as already there
    difference NUMERIC(14, 2),                       -- balance - (ledger_balance + pending_net)
    dedupe_key TEXT NOT NULL,
    -- OPEN = differs, waiting for a decision; IN_SYNC = matches; ADJUSTED = adjustment booked;
    -- DISMISSED = ignored by the person; SUPERSEDED = a newer check replaced it; NO_ACCOUNT = capture books to Cash.
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_SYNC', 'ADJUSTED', 'DISMISSED', 'SUPERSEDED', 'NO_ACCOUNT')),
    adjustment_entry_id UUID REFERENCES public.cashbook_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS momo_balance_checks_user_status_idx ON public.momo_balance_checks (user_id, status, observed_at DESC);

-- API / service-role only, like every other table the web client doesn't read directly.
ALTER TABLE public.momo_balance_checks ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload config';
