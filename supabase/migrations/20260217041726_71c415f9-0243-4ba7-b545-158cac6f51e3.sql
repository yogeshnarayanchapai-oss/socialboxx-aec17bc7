
-- Add ai_media_assets column to store photos, audio, video URLs for AI to send to customers
ALTER TABLE public.connected_pages 
ADD COLUMN IF NOT EXISTS ai_media_assets jsonb DEFAULT '[]'::jsonb;

-- Structure: [{ "type": "image"|"audio"|"video", "url": "...", "label": "...", "created_at": "..." }]
COMMENT ON COLUMN public.connected_pages.ai_media_assets IS 'Media assets (photos, audio, videos) that AI can send to customers when requested';
