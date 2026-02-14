
-- 1. Add deleted_at column to conversations for soft delete
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- 2. Add ai_comment_reply_enabled to connected_pages
ALTER TABLE public.connected_pages ADD COLUMN IF NOT EXISTS ai_comment_reply_enabled boolean DEFAULT false;

-- 3. Create followup_logs table
CREATE TABLE public.followup_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  page_id uuid NOT NULL REFERENCES public.connected_pages(id),
  followup_type text NOT NULL DEFAULT 'automation', -- 'automation' or 'ai'
  step_number integer NOT NULL DEFAULT 1,
  message_text text,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.followup_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for followup_logs
CREATE POLICY "Authenticated users can view followup logs"
  ON public.followup_logs FOR SELECT USING (true);

CREATE POLICY "Service can insert followup logs"
  ON public.followup_logs FOR INSERT WITH CHECK (true);

-- Index for efficient today's count queries
CREATE INDEX idx_followup_logs_sent_at ON public.followup_logs(sent_at);
CREATE INDEX idx_followup_logs_page_id ON public.followup_logs(page_id);

-- 4. Add automation follow-up tracking columns to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS auto_followup_step integer DEFAULT NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS auto_followup_next_at timestamp with time zone DEFAULT NULL;
