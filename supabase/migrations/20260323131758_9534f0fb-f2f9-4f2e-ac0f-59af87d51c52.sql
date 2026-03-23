CREATE TABLE public.page_ai_prompt_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.connected_pages(id) ON DELETE CASCADE,
  compiled_prompt text NOT NULL DEFAULT '',
  script_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (page_id)
);

ALTER TABLE public.page_ai_prompt_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage prompt cache"
ON public.page_ai_prompt_cache
FOR ALL
TO public
USING (true)
WITH CHECK (true);
