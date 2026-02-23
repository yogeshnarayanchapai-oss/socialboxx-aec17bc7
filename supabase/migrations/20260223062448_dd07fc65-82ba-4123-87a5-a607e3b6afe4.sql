
-- Add scope_type and group_id to api_integrations
ALTER TABLE public.api_integrations
  ADD COLUMN scope_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN group_id uuid REFERENCES public.page_groups(id) ON DELETE SET NULL;

-- Add constraint: group_id required when scope_type = 'group'
COMMENT ON COLUMN public.api_integrations.scope_type IS 'group | ungrouped | custom';
