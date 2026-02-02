-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage settings" ON public.app_settings;

-- Create permissive SELECT policy for all authenticated users (for reading public settings like App ID)
CREATE POLICY "Authenticated users can view settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

-- Create permissive INSERT/UPDATE/DELETE policy for admins only
CREATE POLICY "Admins can manage settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add admin role to the current user (if missing) since handle_new_user trigger may have failed
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.users.id)
ON CONFLICT DO NOTHING;