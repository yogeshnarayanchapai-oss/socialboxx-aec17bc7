
-- Make organization_id NOT NULL on connected_pages to prevent null values at DB level
-- First update any existing null records
UPDATE public.connected_pages 
SET organization_id = (
  SELECT om.organization_id 
  FROM organization_members om 
  WHERE om.user_id = connected_pages.connected_by 
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Now add NOT NULL constraint
ALTER TABLE public.connected_pages 
ALTER COLUMN organization_id SET NOT NULL;
