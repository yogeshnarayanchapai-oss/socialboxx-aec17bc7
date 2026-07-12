LOCK TABLE public.leads IN ACCESS EXCLUSIVE MODE;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        organization_id,
        conversation_id,
        right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10),
        ((created_at AT TIME ZONE 'Asia/Kathmandu')::date)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.leads
  WHERE conversation_id IS NOT NULL
    AND organization_id IS NOT NULL
    AND length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) >= 10
)
DELETE FROM public.leads l
USING ranked r
WHERE l.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS leads_one_phone_per_conversation_per_nepal_day
ON public.leads (
  organization_id,
  conversation_id,
  (right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)),
  (((created_at AT TIME ZONE 'Asia/Kathmandu')::date))
)
WHERE conversation_id IS NOT NULL
  AND organization_id IS NOT NULL
  AND length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) >= 10;