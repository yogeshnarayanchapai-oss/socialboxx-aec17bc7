
CREATE OR REPLACE FUNCTION public.auto_release_ai_processing_on_page_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'page' THEN
    UPDATE public.conversations
       SET status = 'replied',
           ai_fail_reason = NULL,
           last_message_preview = COALESCE(LEFT(NEW.content, 100), last_message_preview),
           last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at),
           updated_at = now()
     WHERE id = NEW.conversation_id
       AND status IN ('ai_processing', 'unreplied');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_release_ai_processing ON public.messages;
CREATE TRIGGER trg_auto_release_ai_processing
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.auto_release_ai_processing_on_page_reply();

-- Heal currently-stuck conversations: any ai_processing where the most recent message is from page
UPDATE public.conversations c
   SET status = 'replied', ai_fail_reason = NULL, updated_at = now()
 WHERE c.status = 'ai_processing'
   AND EXISTS (
     SELECT 1 FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.sender_type = 'page'
        AND m.created_at >= c.last_message_at - interval '1 minute'
   );
