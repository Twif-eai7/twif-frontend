ALTER TABLE inspection_report_photos ADD COLUMN IF NOT EXISTS step_key text;

NOTIFY pgrst, 'reload schema';
