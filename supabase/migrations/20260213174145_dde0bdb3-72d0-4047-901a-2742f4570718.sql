
-- Add AI follow-up settings to connected_pages (JSON config for up to 5 follow-up steps)
ALTER TABLE public.connected_pages 
ADD COLUMN IF NOT EXISTS ai_followup_settings jsonb DEFAULT '{"enabled":false,"steps":[]}'::jsonb;

-- Add follow-up tracking columns to conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS ai_followup_step integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_followup_next_at timestamp with time zone DEFAULT NULL;

-- Index for efficient follow-up queries
CREATE INDEX IF NOT EXISTS idx_conversations_followup 
ON public.conversations (ai_followup_next_at) 
WHERE ai_followup_next_at IS NOT NULL AND ai_followup_step IS NOT NULL;
