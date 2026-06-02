-- 1. Create organization_wallets table
CREATE TABLE IF NOT EXISTS public.organization_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    qb_account_id VARCHAR(255),
    qb_account_name VARCHAR(255),
    is_main BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

-- Enable RLS
ALTER TABLE public.organization_wallets ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to do everything within their organization
CREATE POLICY "Manage wallets of own organization" ON public.organization_wallets
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.organization_wallets TO service_role;
GRANT ALL ON public.organization_wallets TO postgres;

-- 2. Add wallet_id to requisitions
ALTER TABLE public.requisitions 
ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.organization_wallets(id) ON DELETE SET NULL;

-- 3. Add wallet_id to cashbook_entries
ALTER TABLE public.cashbook_entries 
ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.organization_wallets(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_organization_wallets_org_id ON public.organization_wallets(organization_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_wallet_id ON public.requisitions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_wallet_id ON public.cashbook_entries(wallet_id);

-- 4. Backfill/Seed default Main Wallets for all existing organizations
DO $$
DECLARE
    org_record RECORD;
    new_wallet_id UUID;
BEGIN
    FOR org_record IN SELECT id FROM public.organizations LOOP
        -- Check if Main Wallet already exists for this org
        SELECT id INTO new_wallet_id 
        FROM public.organization_wallets 
        WHERE organization_id = org_record.id AND is_main = true;
        
        -- If not, insert it
        IF new_wallet_id IS NULL THEN
            INSERT INTO public.organization_wallets (organization_id, name, is_main)
            VALUES (org_record.id, 'Main Wallet', true)
            RETURNING id INTO new_wallet_id;
        END IF;

        -- Update existing MONEYWISE_WALLET cashbook entries to point to this Main Wallet
        UPDATE public.cashbook_entries
        SET wallet_id = new_wallet_id
        WHERE organization_id = org_record.id 
          AND (account_type = 'MONEYWISE_WALLET' OR account_type = 'WALLET')
          AND wallet_id IS NULL;

        -- Update existing requisitions that were processed using MoneyWise Wallet
        UPDATE public.requisitions r
        SET wallet_id = new_wallet_id
        WHERE r.organization_id = org_record.id 
          AND (r.payment_method = 'WALLET' OR r.payment_method = 'MONEYWISE_WALLET' OR EXISTS (
              SELECT 1 FROM public.cashbook_entries ce 
              WHERE ce.requisition_id = r.id AND ce.account_type = 'MONEYWISE_WALLET'
          ))
          AND r.wallet_id IS NULL;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload config';
