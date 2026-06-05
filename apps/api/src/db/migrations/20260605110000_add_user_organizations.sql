-- Create user_organizations table if it does not exist
CREATE TABLE IF NOT EXISTS public.user_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('REQUESTOR', 'AUTHORISER', 'ACCOUNTANT', 'CASHIER', 'ADMIN')),
    employee_id VARCHAR(50),
    status VARCHAR(50) NOT NULL CHECK (status IN ('ACTIVE', 'INVITED', 'DISABLED', 'PENDING_APPROVAL')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, organization_id)
);

-- Backfill memberships from existing users table
INSERT INTO public.user_organizations (user_id, organization_id, role, employee_id, status, created_at, updated_at)
SELECT id, organization_id, role, employee_id, status, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
FROM public.users
WHERE organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Update trigger function handle_new_user to automatically insert memberships on auth signups
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into public.users
  INSERT INTO public.users (id, email, name, role, organization_id, employee_id, username, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', 'Unknown User'),
    COALESCE(new.raw_user_meta_data->>'role', 'REQUESTOR'),
    (new.raw_user_meta_data->>'organization_id')::uuid,
    COALESCE(new.raw_user_meta_data->>'employee_id', 'EMP-' || cast(extract(epoch from now()) as text)),
    new.raw_user_meta_data->>'username',
    CASE 
      WHEN (new.raw_app_meta_data->>'provider' = 'email' AND new.email_confirmed_at IS NULL) THEN 'INVITED'
      ELSE COALESCE(new.raw_user_meta_data->>'status', 'ACTIVE')
    END
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      organization_id = EXCLUDED.organization_id,
      username = EXCLUDED.username,
      status = EXCLUDED.status;

  -- Insert into public.user_organizations
  IF (new.raw_user_meta_data->>'organization_id') IS NOT NULL THEN
    INSERT INTO public.user_organizations (user_id, organization_id, role, employee_id, status)
    VALUES (
      new.id,
      (new.raw_user_meta_data->>'organization_id')::uuid,
      COALESCE(new.raw_user_meta_data->>'role', 'REQUESTOR'),
      COALESCE(new.raw_user_meta_data->>'employee_id', 'EMP-' || cast(extract(epoch from now()) as text)),
      CASE 
        WHEN (new.raw_app_meta_data->>'provider' = 'email' AND new.email_confirmed_at IS NULL) THEN 'INVITED'
        ELSE COALESCE(new.raw_user_meta_data->>'status', 'ACTIVE')
      END
    )
    ON CONFLICT (user_id, organization_id) DO UPDATE
    SET role = EXCLUDED.role,
        employee_id = EXCLUDED.employee_id,
        status = EXCLUDED.status;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
