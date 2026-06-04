-- Create Supabase roles if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END
$$;

-- Auth schema and users stub for local development foreign keys
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email VARCHAR(255)
);

-- Storage schema and tables stub for local development
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  public BOOLEAN DEFAULT false,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT,
  owner UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB
);

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  tax_id VARCHAR(100),
  website VARCHAR(255),
  lenco_subaccount_id VARCHAR(255),
  payment_test_mode BOOLEAN DEFAULT FALSE,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization Wallets
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

-- Users (Extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('REQUESTOR', 'AUTHORISER', 'ACCOUNTANT', 'CASHIER', 'ADMIN')),
  organization_id UUID REFERENCES organizations(id),
  status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'DISABLED')),
  payment_info JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chart of Accounts (accounts table)
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- ASSET, LIABILITY, EXPENSE, INCOME, EQUITY
  category VARCHAR(50),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  organization_id UUID REFERENCES organizations(id),
  qb_account_id VARCHAR(100),
  subtype VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Requisitions
CREATE TABLE IF NOT EXISTS requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requestor_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'DISBURSED', 'RECEIVED', 'COMPLETED', 'REJECTED')),
  reference_number VARCHAR(50) UNIQUE,
  estimated_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  actual_total DECIMAL(10, 2),
  description TEXT,
  organization_id UUID REFERENCES organizations(id),
  wallet_id UUID REFERENCES organization_wallets(id) ON DELETE SET NULL,
  qb_expense_id VARCHAR(100),
  qb_sync_status VARCHAR(20) DEFAULT 'PENDING',
  qb_sync_error TEXT,
  qb_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Line Items
CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2),
  unit_price DECIMAL(10, 2),
  estimated_amount DECIMAL(10, 2) NOT NULL,
  actual_amount DECIMAL(10, 2),
  ai_suggested_account_id UUID, -- Placeholder for COA reference
  ai_confidence DECIMAL(3, 2),
  qb_account_id VARCHAR(100),
  qb_account_name TEXT,
  ai_extracted_amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disbursements
CREATE TABLE IF NOT EXISTS disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id),
  cashier_id UUID NOT NULL REFERENCES users(id),
  total_prepared DECIMAL(10, 2) NOT NULL,
  denominations JSONB, -- e.g., {"50": 2, "20": 5}
  cashier_signature TEXT, -- Digital signature or reference
  requestor_signature TEXT,
  organization_id UUID REFERENCES organizations(id),
  recipient_account VARCHAR(50),
  recipient_bank_code VARCHAR(50),
  recipient_account_name VARCHAR(255),
  external_reference VARCHAR(255),
  returned_denominations JSONB,
  actual_change_amount NUMERIC DEFAULT 0,
  confirmed_denominations JSONB,
  confirmed_change_amount NUMERIC DEFAULT 0,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  discrepancy_amount NUMERIC DEFAULT 0,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id),
  line_item_id UUID REFERENCES line_items(id),
  file_url TEXT NOT NULL,
  ocr_text TEXT,
  ocr_data JSONB, -- Structured OCR data
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vouchers
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID REFERENCES requisitions(id),
  created_by UUID NOT NULL REFERENCES users(id),
  posted_by UUID REFERENCES users(id),
  reference_number VARCHAR(50) UNIQUE,
  date DATE,
  amount DECIMAL(10, 2) DEFAULT 0,
  description TEXT,
  total_debit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_credit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'POSTED_TO_QB')),
  payment_account_id VARCHAR(255),
  payment_account_name TEXT,
  organization_id UUID REFERENCES organizations(id),
  posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voucher Lines
CREATE TABLE IF NOT EXISTS voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id), -- Reference to COA
  description TEXT,
  debit DECIMAL(10, 2) DEFAULT 0,
  credit DECIMAL(10, 2) DEFAULT 0
);

-- Cashbook Entries
CREATE TABLE IF NOT EXISTS cashbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES vouchers(id),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  debit DECIMAL(10, 2) DEFAULT 0,
  credit DECIMAL(10, 2) DEFAULT 0,
  balance_after DECIMAL(10, 2) NOT NULL,
  actual_amount DECIMAL(10, 2), -- Added for Expense Tracking phase
  receipt_url TEXT,             -- Added for Expense Tracking phase
  entry_type VARCHAR(50) CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE', 'CLOSING_BALANCE', 'INFLOW', 'EXPENSE')),
  account_type VARCHAR(50) DEFAULT 'CASH',
  requisition_id UUID REFERENCES requisitions(id),
  created_by UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  wallet_id UUID REFERENCES organization_wallets(id) ON DELETE SET NULL,
  external_reference TEXT,
  qb_sync_status VARCHAR(20) DEFAULT 'PENDING',
  qb_sync_error TEXT,
  qb_sync_at TIMESTAMP WITH TIME ZONE,
  qb_expense_id VARCHAR(100),
  qb_deposit_id VARCHAR(100),
  status TEXT DEFAULT 'COMPLETED',
  account_id UUID REFERENCES accounts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cash Inflows
CREATE TABLE IF NOT EXISTS cash_inflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashbook_entry_id UUID NOT NULL REFERENCES cashbook_entries(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  contact_details TEXT,
  denominations JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id),
  changes JSONB, -- {before: ..., after: ...}
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product Sales
CREATE TABLE IF NOT EXISTS public.product_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  reference VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage product sales of own organization" ON public.product_sales;
CREATE POLICY "Manage product sales of own organization" ON public.product_sales
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

