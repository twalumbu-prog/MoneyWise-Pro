-- Add requisition type and specific fields for Loans and Advances
ALTER TABLE requisitions
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'EXPENSE',
ADD COLUMN IF NOT EXISTS staff_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS loan_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS repayment_period INTEGER,
ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5, 2) DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS monthly_deduction DECIMAL(10, 2);

-- Add check constraint for requisition types
ALTER TABLE requisitions
DROP CONSTRAINT IF EXISTS requisitions_type_check;

ALTER TABLE requisitions
ADD CONSTRAINT requisitions_type_check 
CHECK (type IN ('EXPENSE', 'ADVANCE', 'LOAN'));
