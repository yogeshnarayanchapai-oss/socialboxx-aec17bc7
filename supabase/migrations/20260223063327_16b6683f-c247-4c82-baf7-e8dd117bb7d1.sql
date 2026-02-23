
-- Table to store group-based and ungrouped access scopes for team members
CREATE TABLE public.team_access_scopes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  scope_type text NOT NULL, -- 'group' or 'ungrouped'
  group_id uuid REFERENCES public.page_groups(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'view',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope_type, group_id)
);

ALTER TABLE public.team_access_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage access scopes"
  ON public.team_access_scopes FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Users can view own org access scopes"
  ON public.team_access_scopes FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

-- Function to sync page access when pages change groups
CREATE OR REPLACE FUNCTION public.sync_team_page_access_on_page_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When a page's group_id changes, sync access for all scoped team members
  
  -- Handle group-based scopes: add access for members who have scope for the new group
  IF NEW.group_id IS NOT NULL THEN
    INSERT INTO public.team_page_access (user_id, organization_id, page_id, access_level, granted_by)
    SELECT s.user_id, s.organization_id, NEW.id, s.access_level, NULL
    FROM public.team_access_scopes s
    WHERE s.scope_type = 'group' AND s.group_id = NEW.group_id AND s.organization_id = NEW.organization_id
    ON CONFLICT (user_id, page_id, organization_id) DO UPDATE SET access_level = EXCLUDED.access_level;
  END IF;

  -- Handle ungrouped scopes: add access for members who have ungrouped scope
  IF NEW.group_id IS NULL THEN
    INSERT INTO public.team_page_access (user_id, organization_id, page_id, access_level, granted_by)
    SELECT s.user_id, s.organization_id, NEW.id, s.access_level, NULL
    FROM public.team_access_scopes s
    WHERE s.scope_type = 'ungrouped' AND s.organization_id = NEW.organization_id
    ON CONFLICT (user_id, page_id, organization_id) DO UPDATE SET access_level = EXCLUDED.access_level;
  END IF;

  -- If page was moved OUT of a group, remove access granted by that group scope
  IF TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id AND OLD.group_id IS NOT NULL THEN
    DELETE FROM public.team_page_access tpa
    WHERE tpa.page_id = NEW.id
    AND EXISTS (
      SELECT 1 FROM public.team_access_scopes s
      WHERE s.user_id = tpa.user_id AND s.scope_type = 'group' AND s.group_id = OLD.group_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_access_scopes s
      WHERE s.user_id = tpa.user_id AND (
        (s.scope_type = 'group' AND s.group_id = NEW.group_id)
        OR (s.scope_type = 'ungrouped' AND NEW.group_id IS NULL)
      )
    );
  END IF;

  -- If page moved from ungrouped to a group, remove access from ungrouped scope
  IF TG_OP = 'UPDATE' AND OLD.group_id IS NULL AND NEW.group_id IS NOT NULL THEN
    DELETE FROM public.team_page_access tpa
    WHERE tpa.page_id = NEW.id
    AND EXISTS (
      SELECT 1 FROM public.team_access_scopes s
      WHERE s.user_id = tpa.user_id AND s.scope_type = 'ungrouped'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_access_scopes s
      WHERE s.user_id = tpa.user_id AND s.scope_type = 'group' AND s.group_id = NEW.group_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Add unique constraint to team_page_access for ON CONFLICT
DO $$ BEGIN
  ALTER TABLE public.team_page_access ADD CONSTRAINT team_page_access_unique_user_page_org UNIQUE (user_id, page_id, organization_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Trigger on connected_pages for INSERT and UPDATE
CREATE TRIGGER sync_team_access_on_page_change
  AFTER INSERT OR UPDATE OF group_id ON public.connected_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_team_page_access_on_page_change();
