
-- Add comment_auto_reply column to connected_pages
ALTER TABLE public.connected_pages 
ADD COLUMN IF NOT EXISTS comment_auto_reply text DEFAULT '';
