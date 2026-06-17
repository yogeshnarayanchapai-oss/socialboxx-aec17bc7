
CREATE TABLE IF NOT EXISTS public.manual_followup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by uuid,
  status text NOT NULL DEFAULT 'running',
  age_hours integer NOT NULL,
  message_text text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  pending_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mfj_org_status ON public.manual_followup_jobs(organization_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_followup_jobs TO authenticated;
GRANT ALL ON public.manual_followup_jobs TO service_role;

ALTER TABLE public.manual_followup_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view manual followup jobs"
  ON public.manual_followup_jobs FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can insert manual followup jobs"
  ON public.manual_followup_jobs FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can update manual followup jobs"
  ON public.manual_followup_jobs FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS manual_followup_count integer NOT NULL DEFAULT 0;
