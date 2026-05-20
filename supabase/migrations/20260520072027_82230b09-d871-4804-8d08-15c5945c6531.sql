
-- AI reply cache to avoid re-calling AI for identical/common questions
CREATE TABLE IF NOT EXISTS public.ai_reply_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL,
  message_hash text NOT NULL,
  message_sample text NOT NULL,
  reply text NOT NULL,
  hit_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_id, message_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_cache_lookup
  ON public.ai_reply_cache(page_id, message_hash);

CREATE INDEX IF NOT EXISTS idx_ai_reply_cache_last_used
  ON public.ai_reply_cache(last_used_at);

ALTER TABLE public.ai_reply_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage ai reply cache"
  ON public.ai_reply_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Bump default debounce so more messages batch into one AI call
ALTER TABLE public.connected_pages
  ALTER COLUMN ai_debounce_seconds SET DEFAULT 60;

UPDATE public.connected_pages
  SET ai_debounce_seconds = 60
  WHERE ai_debounce_seconds < 30;
