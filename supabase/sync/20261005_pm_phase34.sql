-- Phase 3/4 extras — safe to re-run.
-- Enables Realtime on PM notifications so the in-app toast can pop immediately.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
