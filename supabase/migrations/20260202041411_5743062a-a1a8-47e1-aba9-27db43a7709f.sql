-- Create storage bucket for automation media
INSERT INTO storage.buckets (id, name, public)
VALUES ('automation-media', 'automation-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload automation media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'automation-media' AND auth.role() = 'authenticated');

-- Allow public read access
CREATE POLICY "Public can view automation media"
ON storage.objects FOR SELECT
USING (bucket_id = 'automation-media');

-- Allow users to delete their own uploads
CREATE POLICY "Authenticated users can delete automation media"
ON storage.objects FOR DELETE
USING (bucket_id = 'automation-media' AND auth.role() = 'authenticated');