-- Fix log_activity to fall back to auth.users.email when profile is missing,
-- and backfill missing emails for existing logs.

CREATE OR REPLACE FUNCTION public.log_activity(
  _organization_id uuid,
  _action text,
  _entity_type text,
  _entity_id uuid,
  _entity_label text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
BEGIN
  -- Skip system / automated actions (no authenticated user)
  IF _uid IS NULL OR _organization_id IS NULL THEN
    RETURN;
  END IF;

  SELECT email, full_name INTO _email, _name
  FROM public.profiles WHERE user_id = _uid LIMIT 1;

  -- Fallback to auth.users if profile row is missing
  IF _email IS NULL THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid LIMIT 1;
  END IF;

  INSERT INTO public.activity_logs(
    organization_id, user_id, user_email, action, entity_type, entity_id, entity_label, metadata
  )
  VALUES (
    _organization_id, _uid, COALESCE(_email, _name), _action, _entity_type, _entity_id, _entity_label, COALESCE(_metadata, '{}'::jsonb)
  );
END;
$function$;

-- Backfill missing user_email in existing logs
UPDATE public.activity_logs al
SET user_email = COALESCE(p.email, p.full_name, u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE al.user_id = u.id
  AND (al.user_email IS NULL OR al.user_email = '');

-- Ensure profiles exist for any auth user missing one (so future logs have email)
INSERT INTO public.profiles (user_id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', NULL)
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;