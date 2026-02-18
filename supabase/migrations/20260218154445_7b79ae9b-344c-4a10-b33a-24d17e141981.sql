-- Add ai_fail_reason column to store why AI failed
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_fail_reason text;
