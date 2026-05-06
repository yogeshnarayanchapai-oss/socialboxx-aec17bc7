UPDATE public.conversations
SET status = 'replied',
    last_message_preview = '⚠️ Outside 24h reply window',
    ai_fail_reason = 'Outside of allowed window (24h policy) - cannot reply'
WHERE (ai_fail_reason ILIKE '%outside of allowed window%'
       OR ai_fail_reason ILIKE '%2018278%')
  AND status IN ('ai_failed', 'ai_processing', 'unreplied');