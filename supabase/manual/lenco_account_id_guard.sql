-- Lenco account ids are UUIDs. Two organizations were linked with their TILL NUMBER instead
-- (2612745, 2620631), which made every Lenco call for them fail with "Invalid accountId".
-- These constraints stop that being saved again — the wallet pool and the organization row.
--
-- Run in the Supabase SQL editor (production). Safe to run more than once.
-- NOT VALID = enforced for every new/updated row, without re-checking old rows (the two bad
-- links are repaired by the API's self-heal; step 2 then confirms nothing is left).

-- 1. Enforce for new data.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_pool_provider_account_id_is_uuid') THEN
        ALTER TABLE public.wallet_pool
            ADD CONSTRAINT wallet_pool_provider_account_id_is_uuid
            CHECK (provider_account_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_lenco_subaccount_id_is_uuid') THEN
        ALTER TABLE public.organizations
            ADD CONSTRAINT organizations_lenco_subaccount_id_is_uuid
            CHECK (lenco_subaccount_id IS NULL OR lenco_subaccount_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') NOT VALID;
    END IF;
END $$;

-- 2. Anything still wrong in existing data (expect zero rows once the two repairs have run):
SELECT 'organizations' AS source, id::text, name AS label, lenco_subaccount_id AS value
FROM public.organizations
WHERE lenco_subaccount_id IS NOT NULL
  AND lenco_subaccount_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
UNION ALL
SELECT 'wallet_pool', id::text, status, provider_account_id
FROM public.wallet_pool
WHERE provider_account_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3. When step 2 returns no rows, fully validate (also checks the old rows):
-- ALTER TABLE public.wallet_pool VALIDATE CONSTRAINT wallet_pool_provider_account_id_is_uuid;
-- ALTER TABLE public.organizations VALIDATE CONSTRAINT organizations_lenco_subaccount_id_is_uuid;
