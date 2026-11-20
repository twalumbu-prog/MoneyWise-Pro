-- Blue Opus share offers become INVITE-ONLY, and offers can't be taken until a lawyer has approved the agreement wording.
-- A private company must not advertise its shares to the public, so only people Blue Opus has personally invited can see the offer. Each invite is a
-- one-time code tied to a name; redeeming it gives that one account access. Blue Opus (a platform super-admin) creates, lists and revokes invites.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.share_invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT NOT NULL UNIQUE,                 -- e.g. BO-7K2M9QX4, typed or opened from a link
    name         TEXT NOT NULL,                        -- who it is for
    email        TEXT,
    phone        TEXT,
    note         TEXT,
    created_by   UUID,
    expires_at   TIMESTAMPTZ,                          -- null = does not expire
    redeemed_by  UUID,                                 -- the account that used it (one account per invite)
    redeemed_at  TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_share_invites_redeemed_by ON public.share_invites (redeemed_by) WHERE redeemed_by IS NOT NULL;
ALTER TABLE public.share_invites ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.share_invites TO service_role;

-- What the investor declared when signing, and which invite they came in on.
ALTER TABLE public.share_offers ADD COLUMN IF NOT EXISTS declarations JSONB;
ALTER TABLE public.share_offers ADD COLUMN IF NOT EXISTS invite_id UUID;

-- The round: invite-only, and no offers until a lawyer has approved this agreement version (set legalApprovedVersion to the version once approved).
UPDATE public.app_settings
SET value = value || '{"inviteOnly": true, "legalApprovedVersion": null, "maxInvestors": null}'::jsonb, updated_at = NOW()
WHERE key = 'blue_opus_round' AND NOT (value ? 'inviteOnly');

NOTIFY pgrst, 'reload schema';
