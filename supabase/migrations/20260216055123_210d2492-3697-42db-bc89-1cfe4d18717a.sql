
-- Table for page-level access per team member
CREATE TABLE public.team_page_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  page_id uuid NOT NULL REFERENCES public.connected_pages(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'edit')),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_id)
);

ALTER TABLE public.team_page_access ENABLE ROW LEVEL SECURITY;

-- Org members can view their org's access records
CREATE POLICY "Users can view own org page access"
  ON public.team_page_access FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

-- Org admins can manage page access
CREATE POLICY "Org admins can manage page access"
  ON public.team_page_access FOR ALL
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND get_org_role(auth.uid()) = 'admin'::app_role
  );

-- Trigger for updated_at
CREATE TRIGGER update_team_page_access_updated_at
  BEFORE UPDATE ON public.team_page_access
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
