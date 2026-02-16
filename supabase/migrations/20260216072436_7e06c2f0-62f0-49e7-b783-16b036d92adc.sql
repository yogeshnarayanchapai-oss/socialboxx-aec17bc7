
-- Create storage bucket for branding logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view branding assets
CREATE POLICY "Public can view branding assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

-- Allow org admins to upload branding assets
CREATE POLICY "Org admins can upload branding assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

-- Allow org admins to update branding assets
CREATE POLICY "Org admins can update branding assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

-- Allow org admins to delete branding assets
CREATE POLICY "Org admins can delete branding assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'branding' AND auth.uid() IS NOT NULL);
