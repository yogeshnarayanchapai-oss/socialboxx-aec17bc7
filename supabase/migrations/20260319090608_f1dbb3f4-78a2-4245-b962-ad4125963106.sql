
-- Backfill missed leads: Create leads from conversations where customer sent phone number but no lead was created
INSERT INTO public.leads (phone, full_name, conversation_id, page_id, source, organization_id, status, last_message, remark)
SELECT DISTINCT ON (c.id)
  CASE 
    WHEN LENGTH(REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')) > 10 
      AND REGEXP_REPLACE(m.content, '[^0-9]', '', 'g') LIKE '977%'
    THEN SUBSTRING(REGEXP_REPLACE(m.content, '[^0-9]', '', 'g') FROM 4)
    ELSE REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')
  END as phone,
  c.participant_name as full_name,
  c.id as conversation_id,
  c.page_id,
  cp.page_name as source,
  c.organization_id,
  'new' as status,
  m.content as last_message,
  'Backfill - Phone provided' as remark
FROM conversations c
JOIN messages m ON m.conversation_id = c.id AND m.sender_type = 'customer'
JOIN connected_pages cp ON cp.id = c.page_id
WHERE c.deleted_at IS NULL
  AND NOT (c.tags @> ARRAY['lead-created'])
  AND LENGTH(REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')) >= 10
  AND LENGTH(REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')) <= 15
  AND LENGTH(m.content) <= 20
  AND REGEXP_REPLACE(m.content, '[^0-9]', '', 'g') ~ '^(977)?9'
  AND NOT EXISTS (
    SELECT 1 FROM leads l 
    WHERE l.organization_id = c.organization_id 
    AND (
      l.phone = REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')
      OR l.phone = CASE 
        WHEN REGEXP_REPLACE(m.content, '[^0-9]', '', 'g') LIKE '977%'
        THEN SUBSTRING(REGEXP_REPLACE(m.content, '[^0-9]', '', 'g') FROM 4)
        ELSE REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')
      END
    )
  )
ORDER BY c.id, m.created_at DESC;

-- Tag those conversations as lead-created
UPDATE conversations 
SET tags = array_append(COALESCE(tags, ARRAY[]::text[]), 'lead-created'),
    ai_followup_step = NULL,
    ai_followup_next_at = NULL
WHERE id IN (
  SELECT DISTINCT c.id
  FROM conversations c
  JOIN messages m ON m.conversation_id = c.id AND m.sender_type = 'customer'
  WHERE c.deleted_at IS NULL
    AND NOT (c.tags @> ARRAY['lead-created'])
    AND LENGTH(REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')) >= 10
    AND LENGTH(REGEXP_REPLACE(m.content, '[^0-9]', '', 'g')) <= 15
    AND LENGTH(m.content) <= 20
    AND REGEXP_REPLACE(m.content, '[^0-9]', '', 'g') ~ '^(977)?9'
);
