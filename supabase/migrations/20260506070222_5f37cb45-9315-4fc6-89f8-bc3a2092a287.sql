UPDATE public.conversations
SET status = 'ai_failed',
    last_message_preview = NULL
WHERE ai_fail_reason ILIKE '%outside of allowed window%'
  AND status = 'replied';