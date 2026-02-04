-- Users
-- Users (Extends Supabase Auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('REQUESTOR', 'AUTHORISER', 'ACCOUNTANT', 'CASHIER', 'ADMIN')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Requisitions
CREATE TABLE requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requestor_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'DISBURSED', 'RECEIVED', 'COMPLETED', 'REJECTED')),
  reference_number VARCHAR(50) UNIQUE,
  estimated_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  actual_total DECIMAL(10, 2),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Line Items
CREATE TABLE line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2),
  unit_price DECIMAL(10, 2),
  estimated_amount DECIMAL(10, 2) NOT NULL,
  actual_amount DECIMAL(10, 2),
  ai_suggested_account_id UUID, -- Placeholder for COA reference
  ai_confidence DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disbursements
CREATE TABLE disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id),
  cashier_id UUID NOT NULL REFERENCES users(id),
  total_prepared DECIMAL(10, 2) NOT NULL,
  denominations JSONB, -- e.g., {"50": 2, "20": 5}
  cashier_signature TEXT, -- Digital signature or reference
  requestor_signature TEXT,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Receipts
CREATE TABLE receipts (
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
CREATE TABLE vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID REFERENCES requisitions(id),
  created_by UUID NOT NULL REFERENCES users(id),
  reference_number VARCHAR(50) UNIQUE,
  total_debit DECIMAL(10, 2) NOT NULL,
  total_credit DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('DRAFT', 'POSTED')),
  posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voucher Lines
CREATE TABLE voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id), -- Reference to COA
  description TEXT,
  debit DECIMAL(10, 2) DEFAULT 0,
  credit DECIMAL(10, 2) DEFAULT 0
);

-- Cashbook
CREATE TABLE cashbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES vouchers(id),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  debit DECIMAL(10, 2) DEFAULT 0,
  credit DECIMAL(10, 2) DEFAULT 0,
  balance_after DECIMAL(10, 2) NOT NULL,
  actual_amount DECIMAL(10, 2), -- Added for Expense Tracking phase
  receipt_url TEXT,             -- Added for Expense Tracking phase
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id),
  changes JSONB, -- {before: ..., after: ...}
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chart of Accounts (Simple version for MVP)
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- ASSET, LIABILITY, EXPENSE, INCOME, EQUITY
  is_active BOOLEAN DEFAULT TRUE
);
