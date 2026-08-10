-- Add user_id to payroll_staff for mapping to team members
ALTER TABLE payroll_staff
ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create payroll_config table
CREATE TABLE payroll_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  basic_pay_configured BOOLEAN DEFAULT true,
  allowance_types JSONB DEFAULT '[]'::jsonb,
  deduction_types JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE payroll_config ENABLE ROW LEVEL SECURITY;

-- Policies for payroll_config
CREATE POLICY "Users can view their organization's payroll_config"
  ON payroll_config
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can insert payroll_config"
  ON payroll_config
  FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid() AND role IN ('ADMIN', 'ACCOUNTANT')
  ));

CREATE POLICY "Admins can update payroll_config"
  ON payroll_config
  FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid() AND role IN ('ADMIN', 'ACCOUNTANT')
  ));

-- Trigger for updated_at
CREATE TRIGGER update_payroll_config_modtime
  BEFORE UPDATE ON payroll_config
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();
