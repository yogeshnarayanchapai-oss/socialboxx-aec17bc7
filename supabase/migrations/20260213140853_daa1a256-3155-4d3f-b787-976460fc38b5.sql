
-- Add AI settings columns to connected_pages
ALTER TABLE public.connected_pages
  ADD COLUMN IF NOT EXISTS ai_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS auto_reply_messages jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_followup_messages jsonb DEFAULT '[]'::jsonb;

-- Comment explaining the structure:
-- auto_reply_messages: array of up to 3 message objects [{text, media}]
-- auto_followup_messages: array of up to 3 followup message objects [{text, media}]
-- ai_description: business description text for AI to learn about this page
