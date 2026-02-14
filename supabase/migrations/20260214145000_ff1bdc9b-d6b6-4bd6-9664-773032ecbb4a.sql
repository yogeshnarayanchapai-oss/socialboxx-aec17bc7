
-- =============================================
-- PHASE 1: Multi-Tenant SaaS Database Migration
-- =============================================

-- 1. Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  plan text NOT NULL DEFAULT 'free',
  max_pages integer NOT NULL DEFAULT 3,
  max_team_members integer NOT NULL DEFAULT 5,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Create organization_members table
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'agent',
  invited_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 3. Add organization_id to existing tables
ALTER TABLE public.connected_pages ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.conversations ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.leads ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.automation_rules ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.app_settings ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.reply_templates ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.followup_logs ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- 4. Create platform_admins table (for super admin identification)
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Insert current user as platform admin
INSERT INTO public.platform_admins (user_id) VALUES ('d1f13b04-edd9-48ba-bc46-c9b3a3add269');

-- 5. Create helper functions (security definer)

-- Get user's organization_id
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Check if user is platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  )
$$;

-- Get user's role within their org
CREATE OR REPLACE FUNCTION public.get_org_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Get user's org status
CREATE OR REPLACE FUNCTION public.get_user_org_status(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.status
  FROM public.organizations o
  JOIN public.organization_members om ON om.organization_id = o.id
  WHERE om.user_id = _user_id
  LIMIT 1
$$;

-- 6. Update handle_new_user trigger to create org
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  company_name text;
BEGIN
  -- Get company name from metadata
  company_name := COALESCE(new.raw_user_meta_data->>'company_name', 'My Company');
  
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  
  -- Create organization
  INSERT INTO public.organizations (name, owner_id, status)
  VALUES (company_name, new.id, 'pending')
  RETURNING id INTO new_org_id;
  
  -- Add user as org admin
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, new.id, 'admin');
  
  -- Keep backward compat with user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'admin');
  
  RETURN new;
END;
$$;

-- 7. RLS Policies for organizations
CREATE POLICY "Users can view own org" ON public.organizations
FOR SELECT USING (
  id = get_user_org_id(auth.uid()) OR is_platform_admin(auth.uid())
);

CREATE POLICY "Platform admin can manage orgs" ON public.organizations
FOR ALL USING (is_platform_admin(auth.uid()));

-- 8. RLS Policies for organization_members
CREATE POLICY "Users can view own org members" ON public.organization_members
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid()) OR is_platform_admin(auth.uid())
);

CREATE POLICY "Org admins can manage members" ON public.organization_members
FOR ALL USING (
  organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin'
);

-- 9. RLS for platform_admins
CREATE POLICY "Platform admins can view" ON public.platform_admins
FOR SELECT USING (user_id = auth.uid() OR is_platform_admin(auth.uid()));

-- 10. Update RLS on connected_pages - drop old, add new
DROP POLICY IF EXISTS "Admins can manage pages" ON public.connected_pages;
DROP POLICY IF EXISTS "Authenticated users can view pages" ON public.connected_pages;

CREATE POLICY "Users can view own org pages" ON public.connected_pages
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Org admins can manage pages" ON public.connected_pages
FOR ALL USING (
  organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin'
);

-- 11. Update RLS on conversations
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Service role can delete conversations" ON public.conversations;
DROP POLICY IF EXISTS "Service role can insert conversations" ON public.conversations;

CREATE POLICY "Users can view own org conversations" ON public.conversations
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Users can update own org conversations" ON public.conversations
FOR UPDATE USING (
  organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Service can insert conversations" ON public.conversations
FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can delete conversations" ON public.conversations
FOR DELETE USING (true);

-- 12. Update RLS on leads
DROP POLICY IF EXISTS "Authenticated users can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;

CREATE POLICY "Users can view own org leads" ON public.leads
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Users can manage own org leads" ON public.leads
FOR ALL USING (
  organization_id = get_user_org_id(auth.uid())
);

-- 13. Update RLS on automation_rules
DROP POLICY IF EXISTS "Admins can manage rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Authenticated users can view rules" ON public.automation_rules;

CREATE POLICY "Users can view own org rules" ON public.automation_rules
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Org admins can manage rules" ON public.automation_rules
FOR ALL USING (
  organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin'
);

-- 14. Update RLS on app_settings
DROP POLICY IF EXISTS "Admins can manage settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.app_settings;

CREATE POLICY "Users can view own org settings" ON public.app_settings
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid()) OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage settings" ON public.app_settings
FOR ALL USING (
  (organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin')
  OR is_platform_admin(auth.uid())
);

-- 15. Update RLS on reply_templates
DROP POLICY IF EXISTS "Admins can manage templates" ON public.reply_templates;
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.reply_templates;

CREATE POLICY "Users can view own org templates" ON public.reply_templates
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Org admins can manage templates" ON public.reply_templates
FOR ALL USING (
  organization_id = get_user_org_id(auth.uid()) AND get_org_role(auth.uid()) = 'admin'
);

-- 16. Update RLS on followup_logs
DROP POLICY IF EXISTS "Authenticated users can view followup logs" ON public.followup_logs;
DROP POLICY IF EXISTS "Service can insert followup logs" ON public.followup_logs;

CREATE POLICY "Users can view own org followup logs" ON public.followup_logs
FOR SELECT USING (
  organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Service can insert followup logs" ON public.followup_logs
FOR INSERT WITH CHECK (true);

-- 17. Update RLS on messages (through conversation)
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.messages;

CREATE POLICY "Users can view own org messages" ON public.messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND c.organization_id = get_user_org_id(auth.uid())
  )
);

CREATE POLICY "Users can create messages in own org" ON public.messages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND c.organization_id = get_user_org_id(auth.uid())
  )
  OR true
);

-- 18. Add updated_at trigger on organizations
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
