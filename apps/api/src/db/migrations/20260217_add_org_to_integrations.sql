
-- Add organization_id to integrations table
ALTER TABLE integrations 
ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Make provider unique per organization, not globally unique
ALTER TABLE integrations DROP CONSTRAINT integrations_provider_key;
ALTER TABLE integrations ADD CONSTRAINT integrations_provider_org_key UNIQUE (provider, organization_id);

-- Optional: Populate organization_id for existing rows based on a default or manual logic?
-- For now, we leave it null or delete existing rows to force reconnection.
-- Safest is to truncate integrations to force clean start.
TRUNCATE TABLE integrations;
