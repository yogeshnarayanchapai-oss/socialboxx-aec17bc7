CREATE OR REPLACE FUNCTION public.log_activity(
  _organization_id uuid,
  _action text,
  _entity_type text,
  _entity_id uuid,
  _entity_label text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  -- Skip system / automated actions (no authenticated user)
  IF _uid IS NULL OR _organization_id IS NULL THEN
    RETURN;
  END IF;
  SELECT email INTO _email FROM public.profiles WHERE user_id = _uid LIMIT 1;
  INSERT INTO public.activity_logs(organization_id, user_id, user_email, action, entity_type, entity_id, entity_label, metadata)
  VALUES (_organization_id, _uid, _email, _action, _entity_type, _entity_id, _entity_label, COALESCE(_metadata, '{}'::jsonb));
END;
$$;