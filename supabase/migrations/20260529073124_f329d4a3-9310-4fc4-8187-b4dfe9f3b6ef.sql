CREATE UNIQUE INDEX IF NOT EXISTS leads_org_conv_phone_unique
ON public.leads (organization_id, conversation_id, (regexp_replace(phone, '\D', '', 'g')))
WHERE phone IS NOT NULL AND conversation_id IS NOT NULL;