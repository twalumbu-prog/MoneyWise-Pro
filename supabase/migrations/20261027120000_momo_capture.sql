-- Mobile money capture: MTN / Airtel / Zamtel transaction messages picked up on the phone (Android SMS +
-- notification listener, iOS Shortcuts automation, or pasted by hand) and turned into external-account entries.
--
-- momo_capture_settings — one row per user: auto-post vs review, where entries are booked, and the hashed
--   capture token that background senders (Android native service, iOS Shortcut) authenticate with. The token
--   can ONLY ingest messages for its owner; it is not a session and reads nothing.
-- momo_captures — every accepted message, parsed. PENDING until confirmed (or auto-posted), MATCHED when the same
--   movement is already in the ledger via Lenco, so it is never booked twice.

CREATE TABLE IF NOT EXISTS public.momo_capture_settings (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    auto_post BOOLEAN NOT NULL DEFAULT false,
    destination TEXT NOT NULL DEFAULT 'PROVIDER' CHECK (destination IN ('PROVIDER', 'CASH')),
    token_hash TEXT UNIQUE,
    token_created_at TIMESTAMPTZ,
    last_capture_at TIMESTAMPTZ,
    last_capture_source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.momo_captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('ANDROID_SMS', 'ANDROID_NOTIFICATION', 'IOS_SHORTCUT', 'PASTE')),
    provider TEXT NOT NULL CHECK (provider IN ('MTN', 'AIRTEL', 'ZAMTEL', 'OTHER')),
    sender TEXT,
    raw_text TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    fee NUMERIC(14, 2),
    balance_after NUMERIC(14, 2),
    counterparty TEXT,
    provider_reference TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    -- provider reference when the message has one, else a hash of the normalised text: the same message arriving
    -- by SMS AND by notification (or re-sent by the Shortcut) collapses to one row.
    dedupe_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'POSTED', 'MATCHED', 'DISMISSED')),
    cashbook_entry_id UUID REFERENCES public.cashbook_entries(id) ON DELETE SET NULL,
    matched_entry_id UUID REFERENCES public.cashbook_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS momo_captures_user_status_idx ON public.momo_captures (user_id, status, occurred_at DESC);

-- API / service-role only, like every other table the web client doesn't read directly.
ALTER TABLE public.momo_capture_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.momo_captures ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload config';
