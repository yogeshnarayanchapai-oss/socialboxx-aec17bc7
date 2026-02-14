
-- Re-create the trigger on auth.users to auto-create profile + org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id uuid;
  company_name text;
BEGIN
  -- Get company name from metadata
  company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Company');
  
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- Create organization
  INSERT INTO public.organizations (name, owner_id, status)
  VALUES (company_name, NEW.id, 'pending')
  RETURNING id INTO new_org_id;
  
  -- Add user as org admin
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin');
  
  -- Keep backward compat with user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Fix existing users who have no org/profile
-- User: rameshprasadchapai66@gmail.com (7799e247-2b15-46ed-a5a5-8822038258ad)
INSERT INTO public.profiles (user_id, full_name)
VALUES ('7799e247-2b15-46ed-a5a5-8822038258ad', 'Ramesh')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  org1_id uuid;
  org2_id uuid;
BEGIN
  INSERT INTO public.organizations (name, owner_id, status)
  VALUES ('My Company', '7799e247-2b15-46ed-a5a5-8822038258ad', 'pending')
  RETURNING id INTO org1_id;
  
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (org1_id, '7799e247-2b15-46ed-a5a5-8822038258ad', 'admin');

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('7799e247-2b15-46ed-a5a5-8822038258ad', 'admin')
  ON CONFLICT DO NOTHING;

  -- User: chapaiyogesh34@gmail.com (709a6354-a959-4e12-9f23-42d87143c261)
  INSERT INTO public.profiles (user_id, full_name)
  VALUES ('709a6354-a959-4e12-9f23-42d87143c261', 'Yogesh')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (name, owner_id, status)
  VALUES ('My Company', '709a6354-a959-4e12-9f23-42d87143c261', 'pending')
  RETURNING id INTO org2_id;
  
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (org2_id, '709a6354-a959-4e12-9f23-42d87143c261', 'admin');

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('709a6354-a959-4e12-9f23-42d87143c261', 'admin')
  ON CONFLICT DO NOTHING;
END $$;
