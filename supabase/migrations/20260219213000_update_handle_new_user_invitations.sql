
-- Update handle_new_user trigger to handle invitation metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
