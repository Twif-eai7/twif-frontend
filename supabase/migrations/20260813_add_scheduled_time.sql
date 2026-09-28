-- Adds an optional scheduled_time to inspection_schedules -- until now
-- scheduling only had a date (scheduled_date), no time of day. Nullable:
-- every existing row has no time, and picking one stays optional going
-- forward too (a QA/date pairing without a set time is still valid).

ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS scheduled_time time;

NOTIFY pgrst, 'reload schema';
