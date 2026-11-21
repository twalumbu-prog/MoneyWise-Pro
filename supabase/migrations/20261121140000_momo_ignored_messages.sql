-- momo_ignored_messages — messages the phone sent that the parser did not turn into a transaction or a balance check,
-- with the reason, so the parser can be tuned from real wording. Only messages that already passed the phone-side filter
-- (a provider sender / an amount) arrive here. One-time codes are stored without their text. Pruned after 30 days.

CREATE TABLE IF NOT EXISTS public.momo_ignored_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('ANDROID_SMS', 'ANDROID_NOTIFICATION', 'IOS_SHORTCUT', 'PASTE')),
    raw_text TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS momo_ignored_user_idx ON public.momo_ignored_messages (user_id, created_at DESC);

ALTER TABLE public.momo_ignored_messages ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload config';
