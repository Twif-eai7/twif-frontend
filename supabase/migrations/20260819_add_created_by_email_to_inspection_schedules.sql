ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS created_by_email text;

NOTIFY pgrst, 'reload schema';
