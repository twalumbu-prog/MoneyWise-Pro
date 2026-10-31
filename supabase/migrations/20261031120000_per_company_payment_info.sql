-- Bank / mobile-money details were stored once per person (users.payment_info), so a person's personal account and every
-- business they belong to all showed the same bank account. They now live on the membership (user_organizations), one set per company.
-- Keep in step with the inline migration in apps/api/src/index.ts.
ALTER TABLE public.user_organizations ADD COLUMN IF NOT EXISTS payment_info JSONB DEFAULT NULL;

-- Carry the existing details over to ONE company only (the person's active one) so they are not copied everywhere again.
UPDATE public.user_organizations uo
SET payment_info = u.payment_info
FROM public.users u
WHERE u.id = uo.user_id
  AND uo.organization_id = u.organization_id
  AND uo.payment_info IS NULL
  AND u.payment_info IS NOT NULL;
