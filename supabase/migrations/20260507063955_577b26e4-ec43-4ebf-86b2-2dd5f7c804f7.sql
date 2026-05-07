
UPDATE public.conversations c
   SET status = 'replied', ai_fail_reason = NULL, updated_at = now()
 WHERE c.status = 'unreplied'
   AND EXISTS (
     SELECT 1 FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.sender_type = 'page'
        AND m.created_at >= c.last_message_at
   );
