-- Activity logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_org_created ON public.activity_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view activity logs"
ON public.activity_logs FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_platform_admin(auth.uid()));

-- Helper to write a log entry (security definer so triggers can insert)
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
  IF _organization_id IS NULL THEN
    RETURN;
  END IF;
  IF _uid IS NOT NULL THEN
    SELECT email INTO _email FROM public.profiles WHERE user_id = _uid LIMIT 1;
  END IF;
  INSERT INTO public.activity_logs(organization_id, user_id, user_email, action, entity_type, entity_id, entity_label, metadata)
  VALUES (_organization_id, _uid, _email, _action, _entity_type, _entity_id, _entity_label, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

-- Trigger: leads
CREATE OR REPLACE FUNCTION public.trg_log_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.log_activity(OLD.organization_id, 'lead.delete', 'lead', OLD.id,
      COALESCE(OLD.full_name, OLD.phone, 'Lead'),
      jsonb_build_object('phone', OLD.phone, 'status', OLD.status));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.full_name IS DISTINCT FROM NEW.full_name
       OR OLD.phone IS DISTINCT FROM NEW.phone
       OR OLD.remark IS DISTINCT FROM NEW.remark
       OR OLD.notes IS DISTINCT FROM NEW.notes
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
       OR OLD.followup_due_date IS DISTINCT FROM NEW.followup_due_date THEN
      PERFORM public.log_activity(NEW.organization_id, 'lead.update', 'lead', NEW.id,
        COALESCE(NEW.full_name, NEW.phone, 'Lead'),
        jsonb_build_object(
          'changes', jsonb_strip_nulls(jsonb_build_object(
            'status', CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN jsonb_build_array(OLD.status, NEW.status) END,
            'full_name', CASE WHEN OLD.full_name IS DISTINCT FROM NEW.full_name THEN jsonb_build_array(OLD.full_name, NEW.full_name) END,
            'phone', CASE WHEN OLD.phone IS DISTINCT FROM NEW.phone THEN jsonb_build_array(OLD.phone, NEW.phone) END,
            'remark', CASE WHEN OLD.remark IS DISTINCT FROM NEW.remark THEN jsonb_build_array(OLD.remark, NEW.remark) END,
            'notes', CASE WHEN OLD.notes IS DISTINCT FROM NEW.notes THEN jsonb_build_array(OLD.notes, NEW.notes) END,
            'assigned_to', CASE WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN jsonb_build_array(OLD.assigned_to, NEW.assigned_to) END
          ))
        ));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity(NEW.organization_id, 'lead.create', 'lead', NEW.id,
      COALESCE(NEW.full_name, NEW.phone, 'Lead'),
      jsonb_build_object('source', NEW.source, 'status', NEW.status));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS leads_activity_log ON public.leads;
CREATE TRIGGER leads_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_log_leads();

-- Trigger: messages (delete only)
CREATE OR REPLACE FUNCTION public.trg_log_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
  _participant text;
BEGIN
  SELECT organization_id, participant_name INTO _org, _participant
    FROM public.conversations WHERE id = OLD.conversation_id;
  IF _org IS NULL THEN RETURN OLD; END IF;
  PERFORM public.log_activity(_org, 'message.delete', 'message', OLD.id,
    COALESCE(_participant, 'Conversation'),
    jsonb_build_object(
      'conversation_id', OLD.conversation_id,
      'sender_type', OLD.sender_type,
      'preview', LEFT(COALESCE(OLD.content, ''), 200)
    ));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS messages_activity_log ON public.messages;
CREATE TRIGGER messages_activity_log
AFTER DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.trg_log_messages();

-- Trigger: conversations (delete)
CREATE OR REPLACE FUNCTION public.trg_log_conversations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.log_activity(OLD.organization_id, 'conversation.delete', 'conversation', OLD.id,
      COALESCE(OLD.participant_name, 'Conversation'),
      jsonb_build_object('status', OLD.status));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public.log_activity(NEW.organization_id, 'conversation.soft_delete', 'conversation', NEW.id,
      COALESCE(NEW.participant_name, 'Conversation'),
      jsonb_build_object('status', NEW.status));
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS conversations_activity_log ON public.conversations;
CREATE TRIGGER conversations_activity_log
AFTER UPDATE OR DELETE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.trg_log_conversations();