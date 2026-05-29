ALTER TABLE public.connected_pages ALTER COLUMN ai_debounce_seconds SET DEFAULT 5;
UPDATE public.connected_pages SET ai_debounce_seconds = 5;