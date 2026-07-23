-- 1) Remove any lingering blank-phone leads
DELETE FROM public.leads WHERE phone IS NULL OR btrim(phone) = '';

-- 2) Enforce phone presence at the database level so no code path can create phone-less leads
ALTER TABLE public.leads
  ADD CONSTRAINT leads_phone_not_blank
  CHECK (phone IS NOT NULL AND btrim(phone) <> '') NOT VALID;

ALTER TABLE public.leads VALIDATE CONSTRAINT leads_phone_not_blank;