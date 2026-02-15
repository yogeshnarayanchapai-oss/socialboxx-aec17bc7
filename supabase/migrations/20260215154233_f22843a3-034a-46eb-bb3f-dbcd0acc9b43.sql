-- Allow service role to delete messages (for soft-delete restore cleanup)
CREATE POLICY "Service can delete messages"
ON public.messages
FOR DELETE
USING (true);