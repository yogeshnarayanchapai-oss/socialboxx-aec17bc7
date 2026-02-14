
-- Add AI instructions and comment hint columns to connected_pages
ALTER TABLE public.connected_pages 
ADD COLUMN IF NOT EXISTS ai_instructions text DEFAULT '',
ADD COLUMN IF NOT EXISTS ai_comment_hint text DEFAULT '';
