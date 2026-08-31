-- Create external_wallets table
CREATE TABLE IF NOT EXISTS public.external_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  provider_type VARCHAR(50) NOT NULL, -- 'BANK' | 'MOBILE_MONEY' | 'CUSTOM'
  provider_name VARCHAR(255),          -- e.g., 'Zanaco', 'MTN Mobile Money'
  qb_account_id VARCHAR(255),         -- Optional QuickBooks mapping
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

ALTER TABLE public.external_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users access to organization external wallets"
  ON public.external_wallets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload config';
