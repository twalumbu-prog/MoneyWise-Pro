-- Add department column to requisitions table
ALTER TABLE requisitions
ADD COLUMN IF NOT EXISTS department TEXT;

-- Add check constraint for allowed department values
ALTER TABLE requisitions
DROP CONSTRAINT IF EXISTS requisitions_department_check;

ALTER TABLE requisitions
ADD CONSTRAINT requisitions_department_check 
CHECK (department IN (
    'Finance', 
    'Admin', 
    'HR', 
    'IT', 
    'Education', 
    'Transportation', 
    'Stocks', 
    'Maintenance', 
    'Catering'
));
