
CREATE TABLE public.api_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  page_id UUID NOT NULL REFERENCES public.connected_pages(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(organization_id, page_id)
);

ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org api keys"
ON public.api_integrations FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org admins can manage api keys"
ON public.api_integrations FOR ALL
USING (organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin'::app_role);
