-- Add UNIQUE constraints to prevent Lenco API credentials from being shared across multiple organizations
-- This ensures that LencoPay deposits route correctly to the intended organization and Lenco subaccount.

ALTER TABLE public.organizations
ADD CONSTRAINT lenco_public_key_unique UNIQUE (lenco_public_key),
ADD CONSTRAINT lenco_secret_key_unique UNIQUE (lenco_secret_key),
ADD CONSTRAINT lenco_subaccount_id_unique UNIQUE (lenco_subaccount_id);
