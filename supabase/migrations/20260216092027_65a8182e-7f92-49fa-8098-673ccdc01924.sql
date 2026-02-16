
-- Create junction table for multi-page API keys
CREATE TABLE public.api_integration_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.api_integrations(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.connected_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(integration_id, page_id)
);

ALTER TABLE public.api_integration_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org integration pages"
ON public.api_integration_pages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.api_integrations ai 
  WHERE ai.id = api_integration_pages.integration_id 
  AND ai.organization_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Org admins can manage integration pages"
ON public.api_integration_pages FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.api_integrations ai 
  WHERE ai.id = api_integration_pages.integration_id 
  AND ai.organization_id = get_user_org_id(auth.uid())
  AND get_org_role(auth.uid()) = 'admin'
));

-- Migrate existing single-page entries to junction table
INSERT INTO public.api_integration_pages (integration_id, page_id)
SELECT id, page_id FROM public.api_integrations WHERE page_id IS NOT NULL;

-- Make page_id nullable for backward compat
ALTER TABLE public.api_integrations ALTER COLUMN page_id DROP NOT NULL;

-- Drop unique constraint on org+page so multiple keys can exist
ALTER TABLE public.api_integrations DROP CONSTRAINT IF EXISTS api_integrations_organization_id_page_id_key;

-- Add label column for identifying combined keys
ALTER TABLE public.api_integrations ADD COLUMN label TEXT;
