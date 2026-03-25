
CREATE TABLE public.retry_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running',
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  new_msg_fail integer NOT NULL DEFAULT 0,
  followup_fail integer NOT NULL DEFAULT 0,
  unavailable_cleared integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.retry_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org retry jobs"
  ON public.retry_jobs FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
