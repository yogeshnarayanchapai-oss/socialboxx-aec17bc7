-- Add source column to leads table for page name
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);