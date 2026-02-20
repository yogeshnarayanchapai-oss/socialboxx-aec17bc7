
-- 1. Add api_synced column to leads for tracking API sync status
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS api_synced boolean NOT NULL DEFAULT false;

-- 2. Add first message template columns to connected_pages
ALTER TABLE public.connected_pages ADD COLUMN IF NOT EXISTS first_msg_template_enabled boolean DEFAULT false;
ALTER TABLE public.connected_pages ADD COLUMN IF NOT EXISTS first_msg_template jsonb DEFAULT '{"messages":[]}'::jsonb;

-- 3. Create page_groups table
CREATE TABLE IF NOT EXISTS public.page_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  organization_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.page_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org groups" ON public.page_groups
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org admins can manage groups" ON public.page_groups
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin'::app_role);

-- 4. Add group_id column to connected_pages
ALTER TABLE public.connected_pages ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.page_groups(id) ON DELETE SET NULL;
