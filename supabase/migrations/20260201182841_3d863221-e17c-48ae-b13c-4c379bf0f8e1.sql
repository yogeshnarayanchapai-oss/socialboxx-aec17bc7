-- Add automation settings to connected_pages
ALTER TABLE public.connected_pages 
ADD COLUMN IF NOT EXISTS automation_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_reply_first_message text DEFAULT 'कृपया आफ्नो सम्पर्क नम्बर दिनुहोस्, हजुरलाई सम्पूर्ण जानकारी हामी कलमार्फत दिन्छौं।',
ADD COLUMN IF NOT EXISTS auto_reply_followup text DEFAULT 'धन्यवाद! हामी छिट्टै सम्पर्क गर्नेछौं।',
ADD COLUMN IF NOT EXISTS auto_reply_keywords jsonb DEFAULT '[]'::jsonb;

-- Enable realtime for conversations and messages tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;