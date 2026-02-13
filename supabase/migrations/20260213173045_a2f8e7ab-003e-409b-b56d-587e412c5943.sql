
-- Add product column to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS product text;

-- Add product_name and product_description to connected_pages
ALTER TABLE public.connected_pages ADD COLUMN IF NOT EXISTS product_name text DEFAULT '';
ALTER TABLE public.connected_pages ADD COLUMN IF NOT EXISTS product_description text DEFAULT '';
