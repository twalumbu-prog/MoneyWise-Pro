-- Drop and recreate the requisitions type check constraint to include 'PAYROLL'
ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_type_check;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_type_check 
    CHECK (((type)::text = ANY (ARRAY['EXPENSE'::text, 'ADVANCE'::text, 'LOAN'::text, 'PAYROLL'::text])));

-- Add payroll-specific columns to public.line_items
ALTER TABLE public.line_items 
    ADD COLUMN employee_id text,
    ADD COLUMN employee_name text,
    ADD COLUMN payment_method text,
    ADD COLUMN recipient_account text,
    ADD COLUMN recipient_bank_code text,
    ADD COLUMN verified_name text,
    ADD COLUMN is_valid boolean DEFAULT true,
    ADD COLUMN error_message text;

-- Add line_item_id to disbursements to map individual employee payouts
ALTER TABLE public.disbursements 
    ADD COLUMN line_item_id uuid REFERENCES public.line_items(id) ON DELETE SET NULL;
