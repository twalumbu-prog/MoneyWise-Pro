-- Create Organizations Table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add organization_id to users
ALTER TABLE users 
ADD COLUMN organization_id UUID REFERENCES organizations(id),
ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'DISABLED'));

-- Add organization_id to requisitions
ALTER TABLE requisitions
ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Add organization_id to accounts (Chart of Accounts)
ALTER TABLE accounts 
ADD COLUMN organization_id UUID REFERENCES organizations(id),
ADD COLUMN subtype VARCHAR(100); -- e.g. 'Fixed Asset', 'Cash', 'Credit Card'

-- Add organization_id to vouchers
ALTER TABLE vouchers
ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Add organization_id to disbursements
ALTER TABLE disbursements
ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Create RLS Policies (Placeholder - Implementation depends on Supabase/Postgres config)
-- For now, application-level logic will enforce organization_id filtering
