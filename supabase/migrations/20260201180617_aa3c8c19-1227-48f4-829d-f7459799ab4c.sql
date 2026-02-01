-- Add unique constraints for upsert to work
ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_external_conversation_id_key UNIQUE (external_conversation_id);

ALTER TABLE public.messages 
ADD CONSTRAINT messages_external_message_id_key UNIQUE (external_message_id);

-- Add INSERT policy for conversations (currently missing)
CREATE POLICY "Service role can insert conversations"
ON public.conversations FOR INSERT
WITH CHECK (true);

-- Add DELETE policy for conversations cleanup
CREATE POLICY "Service role can delete conversations"
ON public.conversations FOR DELETE
USING (true);