-- Add unique constraint for upsert to work properly
ALTER TABLE public.api_integrations 
ADD CONSTRAINT api_integrations_org_page_unique UNIQUE (organization_id, page_id);