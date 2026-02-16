-- Fix missing organization_id for existing users
-- This ensures all users belong to an organization, preventing 500 errors on user management

DO $$
DECLARE
    org_id UUID;
BEGIN
    -- Get the ID of the default organization
    SELECT id INTO org_id FROM organizations WHERE name = 'Mew 3 Apartments' LIMIT 1;

    -- If the organization doesn't exist (e.g. fresh install), create it
    IF org_id IS NULL THEN
        INSERT INTO organizations (name, slug) 
        VALUES ('Mew 3 Apartments', 'mew-3-apartments-default') 
        RETURNING id INTO org_id;
    END IF;

    -- Update any users who are missing an organization_id
    UPDATE users 
    SET organization_id = org_id 
    WHERE organization_id IS NULL;
END $$;
