-- A voucher can be held for a checkout that is being paid right now. Held = reserved_until is in the future. It is released by itself when the hold
-- runs out (an abandoned or failed payment), and marked USED when the payment succeeds. Additive: nothing changes for vouchers that were never held.
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS reserved_ref TEXT;
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reserved_ref ON public.reward_redemptions (reserved_ref) WHERE reserved_ref IS NOT NULL;
