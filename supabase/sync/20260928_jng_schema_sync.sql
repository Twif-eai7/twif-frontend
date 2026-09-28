-- Twif schema sync with the JNG code migrated on 2026-09-28.
-- Run the whole file once in Supabase -> SQL Editor. Safe to re-run: objects that
-- already exist are skipped. Anything that genuinely failed is listed by the final SELECT.

CREATE TEMP TABLE IF NOT EXISTS _sync_log (step text, stmt text, error text);
TRUNCATE _sync_log;


-- ── add_buyer_contacts_table.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS buyer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text,
  email text not null,
  created_by text,
  created_by_member_id uuid references organization_members(id),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_buyer_contacts_table.sql#1', 'CREATE TABLE IF NOT EXISTS buyer_contacts ( id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS buyer_contacts_organization_id_idx ON buyer_contacts (organization_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_buyer_contacts_table.sql#2', 'CREATE INDEX IF NOT EXISTS buyer_contacts_organization_id_idx ON buyer_contacts (organization_id)', SQLERRM);
END $__w__$;


-- ── add_vendor_contacts_table.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text,
  email text not null,
  created_by text,
  created_by_member_id uuid references organization_members(id),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_vendor_contacts_table.sql#3', 'CREATE TABLE IF NOT EXISTS vendor_contacts ( id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name tex', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS vendor_contacts_organization_id_idx ON vendor_contacts (organization_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_vendor_contacts_table.sql#4', 'CREATE INDEX IF NOT EXISTS vendor_contacts_organization_id_idx ON vendor_contacts (organization_id)', SQLERRM);
END $__w__$;


-- ── 20260729_add_line_item_id_to_po_comments.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE po_comments ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id) ON DELETE CASCADE$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260729_add_line_item_id_to_po_comments.sql#5', 'ALTER TABLE po_comments ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id) ON DELETE CASCADE', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS po_comments_line_item_id_idx ON po_comments(line_item_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260729_add_line_item_id_to_po_comments.sql#6', 'CREATE INDEX IF NOT EXISTS po_comments_line_item_id_idx ON po_comments(line_item_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260729_add_line_item_id_to_po_comments.sql#7', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260730_create_inspection_reports.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE SEQUENCE IF NOT EXISTS inspection_report_no_seq$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#8', 'CREATE SEQUENCE IF NOT EXISTS inspection_report_no_seq', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_reports (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_item_id                    uuid NOT NULL REFERENCES po_line_items(id),
  report_no                          text UNIQUE NOT NULL DEFAULT
    ('IRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('inspection_report_no_seq')::text, 5, '0')),

  inspector_name                     text,
  inspection_type                    text CHECK (inspection_type IN ('inline', 'midline', 'final')),
  arrival_time                       text,
  start_time                         text,
  complete_time                      text,
  contact                            text,
  inspection_date                    date,

  ship_via                           text,
  inspected_qty                      numeric,
  accepted_quantity                  numeric,
  carton_available                   numeric,
  inspection_result                  text CHECK (inspection_result IN ('accepted', 'rejected')),

  packaging_appearance               jsonb NOT NULL DEFAULT '{}'::jsonb,  
  packaging_measurement_findings     jsonb NOT NULL DEFAULT '{}'::jsonb,  
  barcode_results                    jsonb NOT NULL DEFAULT '{}'::jsonb,  
  onsite_tests                       jsonb NOT NULL DEFAULT '{}'::jsonb,  

  workmanship_inspection_level       text,
  workmanship_sample_size            text,
  aql_critical                       numeric,
  aql_major                          numeric,
  aql_minor                          numeric,
  workmanship_remarks                text,

  remarks                            jsonb NOT NULL DEFAULT '[]'::jsonb,   
  attachments                        jsonb NOT NULL DEFAULT '[]'::jsonb,   

  vendor_rep_name                    text,
  vendor_rep_signature               text,   
  quality_process_auditor_name       text,
  quality_process_auditor_signature  text,
  quality_resource_name              text,
  quality_resource_signature         text,

  status                             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at                       timestamptz,   
  created_by                         text,
  created_at                         timestamptz DEFAULT now(),
  updated_at                         timestamptz DEFAULT now(),
  UNIQUE (po_line_item_id, inspection_type)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#9', 'CREATE TABLE IF NOT EXISTS inspection_reports ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_line_item_id uuid NOT NULL REFERENCES po_line_items(id), repor', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_reports_po_line_item_id ON inspection_reports(po_line_item_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#10', 'CREATE INDEX IF NOT EXISTS idx_inspection_reports_po_line_item_id ON inspection_reports(po_line_item_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_defects (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  defect_description text,
  critical_count     integer NOT NULL DEFAULT 0,
  major_count        integer NOT NULL DEFAULT 0,
  minor_count        integer NOT NULL DEFAULT 0,
  remarks            text,
  created_at         timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#11', 'CREATE TABLE IF NOT EXISTS inspection_report_defects ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES inspection_reports(id) ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_defects_report_id ON inspection_report_defects(report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#12', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_defects_report_id ON inspection_report_defects(report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption      text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#13', 'CREATE TABLE IF NOT EXISTS inspection_report_photos ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES inspection_reports(id) O', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_photos_report_id ON inspection_report_photos(report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#14', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_photos_report_id ON inspection_report_photos(report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#15', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260803_inspection_report_audit_log.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  po_line_item_id   uuid NOT NULL REFERENCES po_line_items(id),
  inspection_type   text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  round             integer NOT NULL DEFAULT 1,
  event_type        text NOT NULL CHECK (event_type IN ('draft_saved', 'submitted', 'edited', 'reinspection_started')),
  actor_name        text,
  reason            text,   
  created_at        timestamptz DEFAULT now(),
  CHECK (event_type NOT IN ('edited', 'reinspection_started') OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#16', 'CREATE TABLE IF NOT EXISTS inspection_report_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES inspection_reports(id) ON ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_po_line_item_id ON inspection_report_logs(po_line_item_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#17', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_po_line_item_id ON inspection_report_logs(po_line_item_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_report_id ON inspection_report_logs(report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#18', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_report_id ON inspection_report_logs(report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS round integer NOT NULL DEFAULT 1$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#19', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS round integer NOT NULL DEFAULT 1', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DO $$
DECLARE
  old_uq_name text;
BEGIN
  -- Find whatever Postgres actually named the original
  -- UNIQUE(po_line_item_id, inspection_type) constraint, rather than
  -- assuming its default auto-generated name.
  SELECT con.conname INTO old_uq_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'inspection_reports'
    AND con.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM unnest(con.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    ) = ARRAY['inspection_type', 'po_line_item_id']::text[];

  IF old_uq_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inspection_reports DROP CONSTRAINT %I', old_uq_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'inspection_reports'::regclass
      AND conname = 'inspection_reports_po_line_item_id_inspection_type_round_key'
  ) THEN
    ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_po_line_item_id_inspection_type_round_key
      UNIQUE (po_line_item_id, inspection_type, round);
  END IF;
END $$$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#20', 'DO $$ DECLARE old_uq_name text; BEGIN -- Find whatever Postgres actually named the original -- UNIQUE(po_line_item_id, inspection_type) constraint, rather than ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#21', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260804_add_inspection_level_to_purchase_orders.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS inspection_level text
    CHECK (inspection_level IN ('G-I', 'G-II', 'G-III', 'S-1', 'S-2', 'S-3', 'S-4'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_inspection_level_to_purchase_orders.sql#22', 'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS inspection_level text CHECK (inspection_level IN (''G-I'', ''G-II'', ''G-III'', ''S-1'', ''S-2'', ''S-3'', ''S-4''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_inspection_level_to_purchase_orders.sql#23', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260804_add_last_edited_tracking.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS updated_by text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_last_edited_tracking.sql#24', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS updated_by text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS last_step text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_last_edited_tracking.sql#25', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS last_step text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_last_edited_tracking.sql#26', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260804_disable_rls_inspection_report_photos.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_report_photos DISABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_disable_rls_inspection_report_photos.sql#27', 'ALTER TABLE inspection_report_photos DISABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_disable_rls_inspection_report_photos.sql#28', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260804_expand_inspection_result_statuses.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_inspection_result_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_expand_inspection_result_statuses.sql#29', 'ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_inspection_result_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_inspection_result_check
  CHECK (inspection_result IN (
    'making_a_plan', 'plan_ready', 'plan_aborted', 'feedback_inprogress',
    'accepted', 'partially_accepted', 'accepted_with_deviations', 'rejected', 'resubmit', 'on_hold'
  ))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_expand_inspection_result_statuses.sql#30', 'ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_inspection_result_check CHECK (inspection_result IN ( ''making_a_plan'', ''plan_ready'', ''plan_abor', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_expand_inspection_result_statuses.sql#31', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260804_inspection_reports_bucket_storage_policy.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$DROP POLICY IF EXISTS "inspection_reports_bucket_all" ON storage.objects$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_inspection_reports_bucket_storage_policy.sql#32', 'DROP POLICY IF EXISTS "inspection_reports_bucket_all" ON storage.objects', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "inspection_reports_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'inspection-reports')
  WITH CHECK (bucket_id = 'inspection-reports')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_inspection_reports_bucket_storage_policy.sql#33', 'CREATE POLICY "inspection_reports_bucket_all" ON storage.objects FOR ALL USING (bucket_id = ''inspection-reports'') WITH CHECK (bucket_id = ''inspection-reports'')', SQLERRM);
END $__w__$;


-- ── 20260805_create_inspection_schedules.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           uuid NOT NULL REFERENCES purchase_orders(id),
  inspection_type text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  scheduled_date  date NOT NULL,
  assigned_qa_id  uuid NOT NULL REFERENCES organization_members(id),
  status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes           text,
  created_by      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#34', 'CREATE TABLE IF NOT EXISTS inspection_schedules ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_id uuid NOT NULL REFERENCES purchase_orders(id), inspection_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_schedules_date  ON inspection_schedules(scheduled_date)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#35', 'CREATE INDEX IF NOT EXISTS idx_inspection_schedules_date ON inspection_schedules(scheduled_date)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_schedules_po_id ON inspection_schedules(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#36', 'CREATE INDEX IF NOT EXISTS idx_inspection_schedules_po_id ON inspection_schedules(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#37', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260806_add_requested_status_to_schedules.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES inspection_requests(id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#38', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES inspection_requests(id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ALTER COLUMN assigned_qa_id DROP NOT NULL$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#39', 'ALTER TABLE inspection_schedules ALTER COLUMN assigned_qa_id DROP NOT NULL', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_status_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#40', 'ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_status_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_status_check
  CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#41', 'ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_status_check CHECK (status IN (''requested'', ''scheduled'', ''completed'', ''cancelled''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#42', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260806_create_inspection_requests.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE SEQUENCE IF NOT EXISTS inspection_request_no_seq$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#43', 'CREATE SEQUENCE IF NOT EXISTS inspection_request_no_seq', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no              text UNIQUE NOT NULL DEFAULT
    ('IRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('inspection_request_no_seq')::text, 5, '0')),
  po_id                   uuid NOT NULL REFERENCES purchase_orders(id),
  po_number               text,
  vendor_name             text NOT NULL,
  buyer_name              text NOT NULL,
  vendor_contact_name     text NOT NULL,
  vendor_mobile_no        text NOT NULL,
  vendor_email            text NOT NULL,
  factory_address         text NOT NULL,
  inspection_type         text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  ship_date               date NOT NULL,
  total_sku_count         integer,
  sku_no                  text,
  green_seal_available    boolean,
  total_order_qty         numeric,
  inspection_request_date date NOT NULL,
  policy_acknowledged     boolean NOT NULL DEFAULT false,
  submitted_by            text,
  submitted_by_email      text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#44', 'CREATE TABLE IF NOT EXISTS inspection_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_no text UNIQUE NOT NULL DEFAULT (''IRF-'' || to_char(now()', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_requests_po_id ON inspection_requests(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#45', 'CREATE INDEX IF NOT EXISTS idx_inspection_requests_po_id ON inspection_requests(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_request_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text,
  created_at   timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#46', 'CREATE TABLE IF NOT EXISTS inspection_request_attachments ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES inspection_reques', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_irf_attachments_request_id ON inspection_request_attachments(request_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#47', 'CREATE INDEX IF NOT EXISTS idx_irf_attachments_request_id ON inspection_request_attachments(request_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#48', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260806_irf_attachments_bucket_policy.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$INSERT INTO storage.buckets (id, name, public)
  VALUES ('irf-attachments', 'irf-attachments', true)
  ON CONFLICT (id) DO NOTHING$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_irf_attachments_bucket_policy.sql#49', 'INSERT INTO storage.buckets (id, name, public) VALUES (''irf-attachments'', ''irf-attachments'', true) ON CONFLICT (id) DO NOTHING', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DROP POLICY IF EXISTS "irf_attachments_bucket_all" ON storage.objects$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_irf_attachments_bucket_policy.sql#50', 'DROP POLICY IF EXISTS "irf_attachments_bucket_all" ON storage.objects', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "irf_attachments_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'irf-attachments')
  WITH CHECK (bucket_id = 'irf-attachments')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_irf_attachments_bucket_policy.sql#51', 'CREATE POLICY "irf_attachments_bucket_all" ON storage.objects FOR ALL USING (bucket_id = ''irf-attachments'') WITH CHECK (bucket_id = ''irf-attachments'')', SQLERRM);
END $__w__$;


-- ── 20260808_add_line_item_ids_to_inspection_schedules.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_item_ids uuid[]$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808_add_line_item_ids_to_inspection_schedules.sql#52', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_item_ids uuid[]', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808_add_line_item_ids_to_inspection_schedules.sql#53', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260808b_replace_line_item_ids_with_line_items.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP COLUMN IF EXISTS line_item_ids$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808b_replace_line_item_ids_with_line_items.sql#54', 'ALTER TABLE inspection_schedules DROP COLUMN IF EXISTS line_item_ids', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_items jsonb$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808b_replace_line_item_ids_with_line_items.sql#55', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_items jsonb', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808b_replace_line_item_ids_with_line_items.sql#56', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260811_add_fulfilled_schedule_id_to_inspection_reports.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS fulfilled_schedule_id uuid REFERENCES inspection_schedules(id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#57', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS fulfilled_schedule_id uuid REFERENCES inspection_schedules(id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#58', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260812_add_ppm_inspection_type.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_add_ppm_inspection_type.sql#59', 'ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check
  CHECK (inspection_type IN ('ppm', 'inline', 'midline', 'final'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_add_ppm_inspection_type.sql#60', 'ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check CHECK (inspection_type IN (''ppm'', ''inline'', ''midline'', ''final''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_add_ppm_inspection_type.sql#61', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260812_fulfilled_schedule_id_on_delete_set_null.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_fulfilled_schedule_id_fkey$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_fulfilled_schedule_id_on_delete_set_null.sql#62', 'ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_fulfilled_schedule_id_fkey', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_fulfilled_schedule_id_fkey
  FOREIGN KEY (fulfilled_schedule_id) REFERENCES inspection_schedules(id) ON DELETE SET NULL$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_fulfilled_schedule_id_on_delete_set_null.sql#63', 'ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_fulfilled_schedule_id_fkey FOREIGN KEY (fulfilled_schedule_id) REFERENCES inspection_schedules(', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_fulfilled_schedule_id_on_delete_set_null.sql#64', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260813_add_scheduled_time.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS scheduled_time time$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260813_add_scheduled_time.sql#65', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS scheduled_time time', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260813_add_scheduled_time.sql#66', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260814_create_tech_enhancement_requests.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS tech_enhancement_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id  uuid NOT NULL REFERENCES organization_members(id),
  title                   text NOT NULL,
  description             text NOT NULL,
  priority                text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status                  text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'in_progress', 'done', 'rejected')),
  attachment_url          text,
  resolution_comment      text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_create_tech_enhancement_requests.sql#67', 'CREATE TABLE IF NOT EXISTS tech_enhancement_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_member_id uuid NOT NULL REFERENCES organizati', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_tech_enhancement_requests_member_id ON tech_enhancement_requests(organization_member_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_create_tech_enhancement_requests.sql#68', 'CREATE INDEX IF NOT EXISTS idx_tech_enhancement_requests_member_id ON tech_enhancement_requests(organization_member_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_create_tech_enhancement_requests.sql#69', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260814_tech_enhancement_attachments_bucket_policy.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$INSERT INTO storage.buckets (id, name, public)
  VALUES ('tech-enhancement-attachments', 'tech-enhancement-attachments', true)
  ON CONFLICT (id) DO NOTHING$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_tech_enhancement_attachments_bucket_policy.sql#70', 'INSERT INTO storage.buckets (id, name, public) VALUES (''tech-enhancement-attachments'', ''tech-enhancement-attachments'', true) ON CONFLICT (id) DO NOTHING', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DROP POLICY IF EXISTS "tech_enhancement_attachments_bucket_all" ON storage.objects$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_tech_enhancement_attachments_bucket_policy.sql#71', 'DROP POLICY IF EXISTS "tech_enhancement_attachments_bucket_all" ON storage.objects', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "tech_enhancement_attachments_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'tech-enhancement-attachments')
  WITH CHECK (bucket_id = 'tech-enhancement-attachments')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_tech_enhancement_attachments_bucket_policy.sql#72', 'CREATE POLICY "tech_enhancement_attachments_bucket_all" ON storage.objects FOR ALL USING (bucket_id = ''tech-enhancement-attachments'') WITH CHECK (bucket_id = ''t', SQLERRM);
END $__w__$;


-- ── 20260815_create_tech_enhancement_request_votes.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS tech_enhancement_request_votes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid NOT NULL REFERENCES tech_enhancement_requests(id) ON DELETE CASCADE,
  organization_member_id  uuid NOT NULL REFERENCES organization_members(id),
  created_at              timestamptz DEFAULT now(),
  UNIQUE (request_id, organization_member_id)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260815_create_tech_enhancement_request_votes.sql#73', 'CREATE TABLE IF NOT EXISTS tech_enhancement_request_votes ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES tech_enhancement_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_ter_votes_request_id ON tech_enhancement_request_votes(request_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260815_create_tech_enhancement_request_votes.sql#74', 'CREATE INDEX IF NOT EXISTS idx_ter_votes_request_id ON tech_enhancement_request_votes(request_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260815_create_tech_enhancement_request_votes.sql#75', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260816_simplify_tech_enhancement_request_status.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#76', 'ALTER TABLE tech_enhancement_requests DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$UPDATE tech_enhancement_requests SET status = 'accepted'  WHERE status IN ('in_review', 'in_progress')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#77', 'UPDATE tech_enhancement_requests SET status = ''accepted'' WHERE status IN (''in_review'', ''in_progress'')', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$UPDATE tech_enhancement_requests SET status = 'submitted' WHERE status = 'rejected'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#78', 'UPDATE tech_enhancement_requests SET status = ''submitted'' WHERE status = ''rejected''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  ADD CONSTRAINT tech_enhancement_requests_status_check
  CHECK (status IN ('submitted', 'accepted', 'done'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#79', 'ALTER TABLE tech_enhancement_requests ADD CONSTRAINT tech_enhancement_requests_status_check CHECK (status IN (''submitted'', ''accepted'', ''done''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#80', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260817_add_declined_status.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260817_add_declined_status.sql#81', 'ALTER TABLE tech_enhancement_requests DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  ADD CONSTRAINT tech_enhancement_requests_status_check
  CHECK (status IN ('submitted', 'accepted', 'done', 'declined'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260817_add_declined_status.sql#82', 'ALTER TABLE tech_enhancement_requests ADD CONSTRAINT tech_enhancement_requests_status_check CHECK (status IN (''submitted'', ''accepted'', ''done'', ''declined''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260817_add_declined_status.sql#83', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260818_add_available_quantity_to_inspection_reports.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS available_quantity numeric$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260818_add_available_quantity_to_inspection_reports.sql#84', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS available_quantity numeric', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260818_add_available_quantity_to_inspection_reports.sql#85', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260819_add_created_by_email_to_inspection_schedules.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS created_by_email text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_created_by_email_to_inspection_schedules.sql#86', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS created_by_email text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_created_by_email_to_inspection_schedules.sql#87', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260819_add_step_key_to_inspection_report_photos.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_report_photos ADD COLUMN IF NOT EXISTS step_key text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_step_key_to_inspection_report_photos.sql#88', 'ALTER TABLE inspection_report_photos ADD COLUMN IF NOT EXISTS step_key text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_step_key_to_inspection_report_photos.sql#89', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260824_extend_otif_exceptions_for_cancellations.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE otif_exceptions
  ADD COLUMN IF NOT EXISTS exception_type text NOT NULL DEFAULT 'otif_date_change'
    CHECK (exception_type IN ('otif_date_change', 'quantity_cancellation')),
  ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id),
  ADD COLUMN IF NOT EXISTS requested_quantity numeric$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#90', 'ALTER TABLE otif_exceptions ADD COLUMN IF NOT EXISTS exception_type text NOT NULL DEFAULT ''otif_date_change'' CHECK (exception_type IN (''otif_date_change'', ''quan', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE UNIQUE INDEX IF NOT EXISTS uq_otif_exceptions_one_pending_cancellation
  ON otif_exceptions(line_item_id)
  WHERE exception_type = 'quantity_cancellation' AND status = 'pending'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#91', 'CREATE UNIQUE INDEX IF NOT EXISTS uq_otif_exceptions_one_pending_cancellation ON otif_exceptions(line_item_id) WHERE exception_type = ''quantity_cancellation'' AN', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION apply_line_item_cancellation(p_line_item_id uuid, p_amount numeric)
RETURNS void AS $$
  UPDATE po_line_items
  SET cancelled_quantity = coalesce(cancelled_quantity, 0) + p_amount,
      balance_quantity   = greatest(0, coalesce(balance_quantity, 0) - p_amount)
  WHERE id = p_line_item_id;
$$ LANGUAGE sql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#92', 'CREATE OR REPLACE FUNCTION apply_line_item_cancellation(p_line_item_id uuid, p_amount numeric) RETURNS void AS $$ UPDATE po_line_items SET cancelled_quantity = ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#93', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260827_add_last_edited_tracking_to_inspection_schedules.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260827_add_last_edited_tracking_to_inspection_schedules.sql#94', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by_email text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260827_add_last_edited_tracking_to_inspection_schedules.sql#95', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by_email text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260827_add_last_edited_tracking_to_inspection_schedules.sql#96', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260905_create_inspection_rework_requests.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_rework_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id               uuid NOT NULL REFERENCES purchase_orders(id),
  items               jsonb NOT NULL, 
  reason              text NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by        text,
  requested_by_email  text,
  
  
  
  requested_by_member_id uuid REFERENCES organization_members(id),
  requested_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_by         text,
  reviewed_by_email   text,
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz NOT NULL DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#97', 'CREATE TABLE IF NOT EXISTS inspection_rework_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_id uuid NOT NULL REFERENCES purchase_orders(id), items', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_po_id ON inspection_rework_requests(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#98', 'CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_po_id ON inspection_rework_requests(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_status ON inspection_rework_requests(status)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#99', 'CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_status ON inspection_rework_requests(status)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_new_round integer;
  v_new_report_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    v_new_round := (v_item->>'round')::integer + 1;

    INSERT INTO inspection_reports (po_line_item_id, inspection_type, round, status, created_by)
    VALUES ((v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by)
    RETURNING id INTO v_new_report_id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#100', 'CREATE OR REPLACE FUNCTION approve_inspection_rework( p_request_id uuid, p_reviewed_by text, p_reviewed_by_email text ) RETURNS void AS $$ DECLARE v_request ins', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#101', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260907_add_pilot_run_inspection_type.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_add_pilot_run_inspection_type.sql#102', 'ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check
  CHECK (inspection_type IN ('ppm', 'pilot_run', 'inline', 'midline', 'final'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_add_pilot_run_inspection_type.sql#103', 'ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check CHECK (inspection_type IN (''ppm'', ''pilot_run'', ''inline'', ''midline'', ''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_add_pilot_run_inspection_type.sql#104', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260907_create_po_comment_photos.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS po_comment_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES po_comments(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#105', 'CREATE TABLE IF NOT EXISTS po_comment_photos ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comment_id uuid NOT NULL REFERENCES po_comments(id) ON DELETE CASC', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS po_comment_photos_comment_id_idx ON po_comment_photos(comment_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#106', 'CREATE INDEX IF NOT EXISTS po_comment_photos_comment_id_idx ON po_comment_photos(comment_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE po_comment_photos DISABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#107', 'ALTER TABLE po_comment_photos DISABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#108', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260908_change_report_no_format.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM inspection_reports
)
UPDATE inspection_reports ir
SET report_no = 'JNGREP' || ordered.rn
FROM ordered
WHERE ir.id = ordered.id$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260908_change_report_no_format.sql#109', 'WITH ordered AS ( SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM inspection_reports ) UPDATE inspection_reports ir SET report_no = ''JNGREP'' |', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$SELECT setval('inspection_report_no_seq', GREATEST((SELECT count(*) FROM inspection_reports), 1), (SELECT count(*) FROM inspection_reports) > 0)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260908_change_report_no_format.sql#110', 'SELECT setval(''inspection_report_no_seq'', (SELECT count(*) FROM inspection_reports))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_reports
  ALTER COLUMN report_no SET DEFAULT ('JNGREP' || nextval('inspection_report_no_seq')::text)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260908_change_report_no_format.sql#111', 'ALTER TABLE inspection_reports ALTER COLUMN report_no SET DEFAULT (''JNGREP'' || nextval(''inspection_report_no_seq'')::text)', SQLERRM);
END $__w__$;


-- ── 20260909_copy_report_data_on_rework_approval.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_old_report inspection_reports;
  v_new_round integer;
  v_new_report_id uuid;
  v_new_schedule_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    v_new_round := (v_item->>'round')::integer + 1;

    SELECT * INTO v_old_report FROM inspection_reports WHERE id = (v_item->>'report_id')::uuid;

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email)
    RETURNING id INTO v_new_schedule_id;

    INSERT INTO inspection_reports (
      po_line_item_id, inspection_type, round, status, created_by, fulfilled_schedule_id,
      inspector_name, arrival_time, start_time, complete_time, contact, inspection_date, ship_via,
      inspected_qty, accepted_quantity, carton_available, available_quantity,
      packaging_appearance, packaging_measurement_findings, barcode_results, onsite_tests,
      workmanship_inspection_level, workmanship_sample_size, aql_critical, aql_major, aql_minor, workmanship_remarks,
      attachments
    )
    VALUES (
      (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by, v_new_schedule_id,
      v_old_report.inspector_name, v_old_report.arrival_time, v_old_report.start_time, v_old_report.complete_time,
      v_old_report.contact, v_old_report.inspection_date, v_old_report.ship_via,
      v_old_report.inspected_qty, v_old_report.accepted_quantity, v_old_report.carton_available, v_old_report.available_quantity,
      coalesce(v_old_report.packaging_appearance, '{}'::jsonb), coalesce(v_old_report.packaging_measurement_findings, '{}'::jsonb),
      coalesce(v_old_report.barcode_results, '{}'::jsonb), coalesce(v_old_report.onsite_tests, '{}'::jsonb),
      v_old_report.workmanship_inspection_level, v_old_report.workmanship_sample_size,
      v_old_report.aql_critical, v_old_report.aql_major, v_old_report.aql_minor, v_old_report.workmanship_remarks,
      coalesce(v_old_report.attachments, '[]'::jsonb)
    )
    RETURNING id INTO v_new_report_id;

    -- Workmanship defect rows and Digitals photos are separate child
    -- tables - duplicated (new rows; photos reference the SAME
    -- storage_path, no file is re-uploaded/duplicated in storage) rather
    -- than moved, so the original round's own defects/photos stay exactly
    -- where they are too.
    INSERT INTO inspection_report_defects (report_id, defect_description, critical_count, major_count, minor_count, remarks)
    SELECT v_new_report_id, defect_description, critical_count, major_count, minor_count, remarks
    FROM inspection_report_defects WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_photos (report_id, storage_path, caption, sort_order)
    SELECT v_new_report_id, storage_path, caption, sort_order
    FROM inspection_report_photos WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260909_copy_report_data_on_rework_approval.sql#112', 'CREATE OR REPLACE FUNCTION approve_inspection_rework( p_request_id uuid, p_reviewed_by text, p_reviewed_by_email text ) RETURNS void AS $$ DECLARE v_request ins', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260909_copy_report_data_on_rework_approval.sql#113', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260917_add_result_to_inspection_report_logs.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_report_logs ADD COLUMN IF NOT EXISTS result text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_add_result_to_inspection_report_logs.sql#114', 'ALTER TABLE inspection_report_logs ADD COLUMN IF NOT EXISTS result text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_add_result_to_inspection_report_logs.sql#115', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260917_create_inspection_report_batches.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE SEQUENCE IF NOT EXISTS inspection_batch_no_seq$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#116', 'CREATE SEQUENCE IF NOT EXISTS inspection_batch_no_seq', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no        text UNIQUE NOT NULL DEFAULT ('TWFCMB' || nextval('inspection_batch_no_seq')::text),
  report_ids_key  text UNIQUE NOT NULL,
  report_ids      uuid[] NOT NULL,
  po_id           uuid REFERENCES purchase_orders(id),
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#117', 'CREATE TABLE IF NOT EXISTS inspection_report_batches ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_no text UNIQUE NOT NULL DEFAULT (''TWFCMB'' || nextval', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_batches_po_id ON inspection_report_batches(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#118', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_batches_po_id ON inspection_report_batches(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_report_batches DISABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#119', 'ALTER TABLE inspection_report_batches DISABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#120', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260917_fix_rework_approval_round_race.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_old_report inspection_reports;
  v_new_round integer;
  v_new_report_id uuid;
  v_new_schedule_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    -- Always derived from the CURRENT max round for this exact SKU/stage,
    -- not the request's own possibly-stale captured round - see this
    -- migration's own header comment for the race this closes.
    SELECT COALESCE(MAX(round), (v_item->>'round')::integer) + 1
    INTO v_new_round
    FROM inspection_reports
    WHERE po_line_item_id = (v_item->>'po_line_item_id')::uuid
      AND inspection_type = v_item->>'inspection_type';

    SELECT * INTO v_old_report FROM inspection_reports WHERE id = (v_item->>'report_id')::uuid;

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email)
    RETURNING id INTO v_new_schedule_id;

    INSERT INTO inspection_reports (
      po_line_item_id, inspection_type, round, status, created_by, fulfilled_schedule_id,
      inspector_name, arrival_time, start_time, complete_time, contact, inspection_date, ship_via,
      inspected_qty, accepted_quantity, carton_available, available_quantity,
      packaging_appearance, packaging_measurement_findings, barcode_results, onsite_tests,
      workmanship_inspection_level, workmanship_sample_size, aql_critical, aql_major, aql_minor, workmanship_remarks,
      attachments
    )
    VALUES (
      (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by, v_new_schedule_id,
      v_old_report.inspector_name, v_old_report.arrival_time, v_old_report.start_time, v_old_report.complete_time,
      v_old_report.contact, v_old_report.inspection_date, v_old_report.ship_via,
      v_old_report.inspected_qty, v_old_report.accepted_quantity, v_old_report.carton_available, v_old_report.available_quantity,
      coalesce(v_old_report.packaging_appearance, '{}'::jsonb), coalesce(v_old_report.packaging_measurement_findings, '{}'::jsonb),
      coalesce(v_old_report.barcode_results, '{}'::jsonb), coalesce(v_old_report.onsite_tests, '{}'::jsonb),
      v_old_report.workmanship_inspection_level, v_old_report.workmanship_sample_size,
      v_old_report.aql_critical, v_old_report.aql_major, v_old_report.aql_minor, v_old_report.workmanship_remarks,
      coalesce(v_old_report.attachments, '[]'::jsonb)
    )
    RETURNING id INTO v_new_report_id;

    -- Workmanship defect rows and Digitals photos are separate child
    -- tables - duplicated (new rows; photos reference the SAME
    -- storage_path, no file is re-uploaded/duplicated in storage) rather
    -- than moved, so the original round's own defects/photos stay exactly
    -- where they are too.
    INSERT INTO inspection_report_defects (report_id, defect_description, critical_count, major_count, minor_count, remarks)
    SELECT v_new_report_id, defect_description, critical_count, major_count, minor_count, remarks
    FROM inspection_report_defects WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_photos (report_id, storage_path, caption, sort_order)
    SELECT v_new_report_id, storage_path, caption, sort_order
    FROM inspection_report_photos WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_fix_rework_approval_round_race.sql#121', 'CREATE OR REPLACE FUNCTION approve_inspection_rework( p_request_id uuid, p_reviewed_by text, p_reviewed_by_email text ) RETURNS void AS $$ DECLARE v_request ins', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_fix_rework_approval_round_race.sql#122', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260918_create_inspection_report_exports.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_exports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_ids_key          text NOT NULL,
  mode                    text NOT NULL,
  url                     text NOT NULL,
  path                    text NOT NULL,
  filename                text NOT NULL,
  is_zip                  boolean NOT NULL DEFAULT false,
  size                    bigint NOT NULL,
  part_count              int NOT NULL DEFAULT 1,
  source_max_updated_at   timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_ids_key, mode)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260918_create_inspection_report_exports.sql#123', 'CREATE TABLE IF NOT EXISTS inspection_report_exports ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_ids_key text NOT NULL, mode text NOT NULL, url text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260918_create_inspection_report_exports.sql#124', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260919_create_inspection_report_result_history.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_result_history (
  id                bigserial PRIMARY KEY,
  report_id         uuid NOT NULL,
  po_line_item_id   uuid,
  inspection_type   text,
  round             integer,
  old_status        text,
  new_status        text,
  old_result        text,
  new_result        text,
  old_submitted_at  timestamptz,
  new_submitted_at  timestamptz,
  changed_by        text,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'trigger'
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#125', 'CREATE TABLE IF NOT EXISTS inspection_report_result_history ( id bigserial PRIMARY KEY, report_id uuid NOT NULL, po_line_item_id uuid, inspection_type text, rou', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_irrh_report ON inspection_report_result_history (report_id, changed_at)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#126', 'CREATE INDEX IF NOT EXISTS idx_irrh_report ON inspection_report_result_history (report_id, changed_at)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_irrh_changed_at ON inspection_report_result_history (changed_at)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#127', 'CREATE INDEX IF NOT EXISTS idx_irrh_changed_at ON inspection_report_result_history (changed_at)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_report_result_history ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#128', 'ALTER TABLE inspection_report_result_history ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION log_inspection_report_result_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO inspection_report_result_history
        (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by)
      VALUES
        (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, NULL, NEW.status, NULL, NEW.inspection_result, NULL, NEW.submitted_at, COALESCE(NEW.updated_by, NEW.created_by));
    ELSE
      INSERT INTO inspection_report_result_history
        (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by)
      VALUES
        (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, OLD.status, NEW.status, OLD.inspection_result, NEW.inspection_result, OLD.submitted_at, NEW.submitted_at, COALESCE(NEW.updated_by, 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- history is best-effort: never block the real write
  END;
  RETURN NEW;
END;
$$$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#129', 'CREATE OR REPLACE FUNCTION log_inspection_report_result_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN BEGIN IF', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_irrh_insert ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#130', 'DROP TRIGGER IF EXISTS trg_irrh_insert ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TRIGGER trg_irrh_insert AFTER INSERT ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION log_inspection_report_result_change()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#131', 'CREATE TRIGGER trg_irrh_insert AFTER INSERT ON inspection_reports FOR EACH ROW EXECUTE FUNCTION log_inspection_report_result_change()', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_irrh_update ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#132', 'DROP TRIGGER IF EXISTS trg_irrh_update ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TRIGGER trg_irrh_update AFTER UPDATE ON inspection_reports
  FOR EACH ROW
  WHEN (OLD.inspection_result IS DISTINCT FROM NEW.inspection_result OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_inspection_report_result_change()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#133', 'CREATE TRIGGER trg_irrh_update AFTER UPDATE ON inspection_reports FOR EACH ROW WHEN (OLD.inspection_result IS DISTINCT FROM NEW.inspection_result OR OLD.status ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$INSERT INTO inspection_report_result_history
  (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by, source)
SELECT r.id, r.po_line_item_id, r.inspection_type, r.round, NULL, r.status, NULL, r.inspection_result, NULL, r.submitted_at, 'baseline', 'baseline'
FROM inspection_reports r
WHERE NOT EXISTS (SELECT 1 FROM inspection_report_result_history h WHERE h.report_id = r.id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#134', 'INSERT INTO inspection_report_result_history (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#135', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260920_create_inspection_plan_aborted_log.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_plan_aborted_log (
  id               bigserial PRIMARY KEY,
  report_id        uuid NOT NULL,
  po_line_item_id  uuid,
  inspection_type  text,
  round            integer,
  result           text NOT NULL DEFAULT 'plan_aborted',
  actor_name       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  source           text NOT NULL DEFAULT 'trigger'
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#136', 'CREATE TABLE IF NOT EXISTS inspection_plan_aborted_log ( id bigserial PRIMARY KEY, report_id uuid NOT NULL, po_line_item_id uuid, inspection_type text, round in', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_ipal_line_item ON inspection_plan_aborted_log (po_line_item_id, created_at)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#137', 'CREATE INDEX IF NOT EXISTS idx_ipal_line_item ON inspection_plan_aborted_log (po_line_item_id, created_at)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_ipal_report ON inspection_plan_aborted_log (report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#138', 'CREATE INDEX IF NOT EXISTS idx_ipal_report ON inspection_plan_aborted_log (report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE inspection_plan_aborted_log ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#139', 'ALTER TABLE inspection_plan_aborted_log ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DROP POLICY IF EXISTS ipal_read ON inspection_plan_aborted_log$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#140', 'DROP POLICY IF EXISTS ipal_read ON inspection_plan_aborted_log', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY ipal_read ON inspection_plan_aborted_log FOR SELECT TO authenticated USING (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#141', 'CREATE POLICY ipal_read ON inspection_plan_aborted_log FOR SELECT TO authenticated USING (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION log_inspection_plan_aborted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.status = 'submitted' AND NEW.inspection_result = 'plan_aborted' THEN
      INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name)
      VALUES (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, COALESCE(NEW.updated_by, NEW.created_by, 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#142', 'CREATE OR REPLACE FUNCTION log_inspection_plan_aborted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN BEGIN IF NEW.sta', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_ipal_insert ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#143', 'DROP TRIGGER IF EXISTS trg_ipal_insert ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TRIGGER trg_ipal_insert AFTER INSERT ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION log_inspection_plan_aborted()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#144', 'CREATE TRIGGER trg_ipal_insert AFTER INSERT ON inspection_reports FOR EACH ROW EXECUTE FUNCTION log_inspection_plan_aborted()', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_ipal_update ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#145', 'DROP TRIGGER IF EXISTS trg_ipal_update ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TRIGGER trg_ipal_update AFTER UPDATE ON inspection_reports
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND NEW.inspection_result = 'plan_aborted'
        AND (OLD.status IS DISTINCT FROM 'submitted' OR OLD.inspection_result IS DISTINCT FROM 'plan_aborted'))
  EXECUTE FUNCTION log_inspection_plan_aborted()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#146', 'CREATE TRIGGER trg_ipal_update AFTER UPDATE ON inspection_reports FOR EACH ROW WHEN (NEW.status = ''submitted'' AND NEW.inspection_result = ''plan_aborted'' AND (OL', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source)
SELECT r.id, r.po_line_item_id, r.inspection_type, r.round, COALESCE(r.updated_by, r.created_by, 'unknown'),
       COALESCE(r.submitted_at, r.updated_at), 'backfill'
FROM inspection_reports r
WHERE r.status = 'submitted' AND r.inspection_result = 'plan_aborted'
  AND NOT EXISTS (SELECT 1 FROM inspection_plan_aborted_log l WHERE l.report_id = r.id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#147', 'INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source) SELECT r.id, r.po_line_item_id, r.i', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source)
SELECT DISTINCT ON (h.report_id) h.report_id, h.po_line_item_id, h.inspection_type, h.round,
       CASE WHEN h.changed_by = 'baseline' THEN 'unknown' ELSE h.changed_by END,
       COALESCE(h.new_submitted_at, h.changed_at), 'backfill'
FROM inspection_report_result_history h
WHERE h.new_status = 'submitted' AND h.new_result = 'plan_aborted'
  AND NOT EXISTS (SELECT 1 FROM inspection_plan_aborted_log l WHERE l.report_id = h.report_id)
ORDER BY h.report_id, h.changed_at$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#148', 'INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source) SELECT DISTINCT ON (h.report_id) h.', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#149', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260921_add_kind_to_link_contacts.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE buyer_supplier_link_contacts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_add_kind_to_link_contacts.sql#150', 'ALTER TABLE buyer_supplier_link_contacts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT ''other''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_add_kind_to_link_contacts.sql#151', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── 20260921_create_buyer_supplier_link_contacts.sql ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS buyer_supplier_link_contacts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_supplier_link_id  uuid NOT NULL,
  name                    text,
  email                   text NOT NULL,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bslc_unique_email UNIQUE (buyer_supplier_link_id, email)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#152', 'CREATE TABLE IF NOT EXISTS buyer_supplier_link_contacts ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_supplier_link_id uuid NOT NULL, name text, email ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_bslc_link ON buyer_supplier_link_contacts (buyer_supplier_link_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#153', 'CREATE INDEX IF NOT EXISTS idx_bslc_link ON buyer_supplier_link_contacts (buyer_supplier_link_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE buyer_supplier_link_contacts ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#154', 'ALTER TABLE buyer_supplier_link_contacts ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#155', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── Tables present in JNG but missing in Twif ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."buyer_contacts" (
  "id" uuid DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "created_by" text,
  "created_by_member_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table buyer_contacts', 'CREATE TABLE IF NOT EXISTS public."buyer_contacts" ( "id" uuid DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "name" text, "email" text NOT NULL, "', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."buyer_fy_targets" (
  "id" uuid DEFAULT gen_random_uuid(),
  "buyer_org_id" uuid NOT NULL,
  "fiscal_year" text NOT NULL,
  "target_value_usd" numeric NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table buyer_fy_targets', 'CREATE TABLE IF NOT EXISTS public."buyer_fy_targets" ( "id" uuid DEFAULT gen_random_uuid(), "buyer_org_id" uuid NOT NULL, "fiscal_year" text NOT NULL, "target_v', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."buyer_supplier_link_contacts" (
  "id" uuid DEFAULT gen_random_uuid(),
  "buyer_supplier_link_id" uuid NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "kind" text DEFAULT 'other',
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table buyer_supplier_link_contacts', 'CREATE TABLE IF NOT EXISTS public."buyer_supplier_link_contacts" ( "id" uuid DEFAULT gen_random_uuid(), "buyer_supplier_link_id" uuid NOT NULL, "name" text, "em', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."inspection_plan_aborted_log" (
  "id" bigint,
  "report_id" uuid NOT NULL,
  "po_line_item_id" uuid,
  "inspection_type" text,
  "round" integer,
  "result" text DEFAULT 'plan_aborted',
  "actor_name" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "source" text DEFAULT 'trigger',
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table inspection_plan_aborted_log', 'CREATE TABLE IF NOT EXISTS public."inspection_plan_aborted_log" ( "id" bigint, "report_id" uuid NOT NULL, "po_line_item_id" uuid, "inspection_type" text, "round', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."inspection_report_batches" (
  "id" uuid DEFAULT gen_random_uuid(),
  "batch_no" text DEFAULT '(''JNGCMB''::text || (nextval(''public.inspection_batch_no_seq''::regclass))::text)',
  "report_ids_key" text NOT NULL,
  "report_ids" uuid[] NOT NULL,
  "po_id" uuid,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table inspection_report_batches', 'CREATE TABLE IF NOT EXISTS public."inspection_report_batches" ( "id" uuid DEFAULT gen_random_uuid(), "batch_no" text DEFAULT ''(''''JNGCMB''''::text || (nextval(''''pu', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."inspection_report_exports" (
  "id" bigint,
  "report_ids_key" text NOT NULL,
  "mode" text NOT NULL,
  "url" text NOT NULL,
  "path" text NOT NULL,
  "filename" text,
  "is_zip" boolean DEFAULT false,
  "size" bigint,
  "part_count" integer DEFAULT 1,
  "source_max_updated_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table inspection_report_exports', 'CREATE TABLE IF NOT EXISTS public."inspection_report_exports" ( "id" bigint, "report_ids_key" text NOT NULL, "mode" text NOT NULL, "url" text NOT NULL, "path" t', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."inspection_report_result_history" (
  "id" bigint,
  "report_id" uuid NOT NULL,
  "po_line_item_id" uuid,
  "inspection_type" text,
  "round" integer,
  "old_status" text,
  "new_status" text,
  "old_result" text,
  "new_result" text,
  "old_submitted_at" timestamp with time zone,
  "new_submitted_at" timestamp with time zone,
  "changed_by" text,
  "changed_at" timestamp with time zone DEFAULT now(),
  "source" text DEFAULT 'trigger',
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table inspection_report_result_history', 'CREATE TABLE IF NOT EXISTS public."inspection_report_result_history" ( "id" bigint, "report_id" uuid NOT NULL, "po_line_item_id" uuid, "inspection_type" text, "', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."inspection_rework_requests" (
  "id" uuid DEFAULT gen_random_uuid(),
  "po_id" uuid NOT NULL,
  "items" jsonb NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending',
  "requested_by" text,
  "requested_by_email" text,
  "requested_by_member_id" uuid,
  "requested_at" timestamp with time zone DEFAULT now(),
  "reviewed_by" text,
  "reviewed_by_email" text,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table inspection_rework_requests', 'CREATE TABLE IF NOT EXISTS public."inspection_rework_requests" ( "id" uuid DEFAULT gen_random_uuid(), "po_id" uuid NOT NULL, "items" jsonb NOT NULL, "reason" te', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."inspection_schedules" (
  "id" uuid DEFAULT gen_random_uuid(),
  "po_id" uuid NOT NULL,
  "inspection_type" text NOT NULL,
  "scheduled_date" date NOT NULL,
  "assigned_qa_id" uuid NOT NULL,
  "status" text DEFAULT 'scheduled',
  "notes" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "line_items" jsonb,
  "scheduled_time" time without time zone,
  "created_by_email" text,
  "updated_by" text,
  "updated_by_email" text,
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table inspection_schedules', 'CREATE TABLE IF NOT EXISTS public."inspection_schedules" ( "id" uuid DEFAULT gen_random_uuid(), "po_id" uuid NOT NULL, "inspection_type" text NOT NULL, "schedul', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."material_options" (
  "id" uuid DEFAULT gen_random_uuid(),
  "category" text NOT NULL,
  "code" text,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL,
  "created_on" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table material_options', 'CREATE TABLE IF NOT EXISTS public."material_options" ( "id" uuid DEFAULT gen_random_uuid(), "category" text NOT NULL, "code" text, "label" text NOT NULL, "sort_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."npd2_admin_audit_log" (
  "id" uuid DEFAULT gen_random_uuid(),
  "actor_member_id" uuid NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table npd2_admin_audit_log', 'CREATE TABLE IF NOT EXISTS public."npd2_admin_audit_log" ( "id" uuid DEFAULT gen_random_uuid(), "actor_member_id" uuid NOT NULL, "action" text NOT NULL, "target', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."npd2_group_guests" (
  "id" uuid DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "token" uuid DEFAULT gen_random_uuid(),
  "invited_by_member_id" uuid,
  "status" text DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now(),
  "removed_at" timestamp with time zone,
  "contact" text,
  "first_seen_at" timestamp with time zone,
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table npd2_group_guests', 'CREATE TABLE IF NOT EXISTS public."npd2_group_guests" ( "id" uuid DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "name" text NOT NULL, "token" uuid DE', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."npd2_org_relationships" (
  "id" uuid DEFAULT gen_random_uuid(),
  "merchant_member_id" uuid NOT NULL,
  "buyer_org_id" uuid,
  "supplier_org_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "created_by_member_id" uuid NOT NULL,
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table npd2_org_relationships', 'CREATE TABLE IF NOT EXISTS public."npd2_org_relationships" ( "id" uuid DEFAULT gen_random_uuid(), "merchant_member_id" uuid NOT NULL, "buyer_org_id" uuid, "supp', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."npd2_plm_admins" (
  "id" uuid DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL,
  "granted_by_member_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table npd2_plm_admins', 'CREATE TABLE IF NOT EXISTS public."npd2_plm_admins" ( "id" uuid DEFAULT gen_random_uuid(), "member_id" uuid NOT NULL, "granted_by_member_id" uuid NOT NULL, "cre', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."npd2_workspace_permissions" (
  "id" uuid DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "capability" text NOT NULL,
  "granted_by_member_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table npd2_workspace_permissions', 'CREATE TABLE IF NOT EXISTS public."npd2_workspace_permissions" ( "id" uuid DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "member_id" uuid NOT NULL, "', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."po_advance_payments" (
  "id" uuid DEFAULT gen_random_uuid(),
  "po_id" uuid NOT NULL,
  "amount" numeric NOT NULL,
  "currency" text DEFAULT 'USD',
  "amount_usd" numeric NOT NULL,
  "payment_date" date NOT NULL,
  "reference_number" text,
  "notes" text,
  "submitted_by" uuid,
  "created_on" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table po_advance_payments', 'CREATE TABLE IF NOT EXISTS public."po_advance_payments" ( "id" uuid DEFAULT gen_random_uuid(), "po_id" uuid NOT NULL, "amount" numeric NOT NULL, "currency" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."po_comment_photos" (
  "id" uuid DEFAULT gen_random_uuid(),
  "comment_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table po_comment_photos', 'CREATE TABLE IF NOT EXISTS public."po_comment_photos" ( "id" uuid DEFAULT gen_random_uuid(), "comment_id" uuid NOT NULL, "storage_path" text NOT NULL, "created_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."po_quality_claims" (
  "id" uuid DEFAULT gen_random_uuid(),
  "po_id" uuid NOT NULL,
  "line_item_id" uuid,
  "claim_type" text NOT NULL,
  "description" text NOT NULL,
  "proof_url" text,
  "status" text DEFAULT 'under_discussion',
  "submitted_by" uuid,
  "created_on" timestamp with time zone DEFAULT now(),
  "closed_by" uuid,
  "closed_at" timestamp with time zone,
  "resolution_note" text,
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table po_quality_claims', 'CREATE TABLE IF NOT EXISTS public."po_quality_claims" ( "id" uuid DEFAULT gen_random_uuid(), "po_id" uuid NOT NULL, "line_item_id" uuid, "claim_type" text NOT N', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."po_shipment_plan_line_items" (
  "id" uuid DEFAULT gen_random_uuid(),
  "plan_id" uuid NOT NULL,
  "po_line_item_id" uuid NOT NULL,
  "quantity" numeric NOT NULL,
  "cbm" numeric DEFAULT 0,
  "created_on" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table po_shipment_plan_line_items', 'CREATE TABLE IF NOT EXISTS public."po_shipment_plan_line_items" ( "id" uuid DEFAULT gen_random_uuid(), "plan_id" uuid NOT NULL, "po_line_item_id" uuid NOT NULL,', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."tech_enhancement_request_votes" (
  "id" uuid DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "organization_member_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table tech_enhancement_request_votes', 'CREATE TABLE IF NOT EXISTS public."tech_enhancement_request_votes" ( "id" uuid DEFAULT gen_random_uuid(), "request_id" uuid NOT NULL, "organization_member_id" u', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."tech_enhancement_requests" (
  "id" uuid DEFAULT gen_random_uuid(),
  "organization_member_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "priority" text DEFAULT 'medium',
  "status" text DEFAULT 'submitted',
  "attachment_url" text,
  "resolution_comment" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table tech_enhancement_requests', 'CREATE TABLE IF NOT EXISTS public."tech_enhancement_requests" ( "id" uuid DEFAULT gen_random_uuid(), "organization_member_id" uuid NOT NULL, "title" text NOT NU', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS public."vendor_contacts" (
  "id" uuid DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "created_by" text,
  "created_by_member_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('table vendor_contacts', 'CREATE TABLE IF NOT EXISTS public."vendor_contacts" ( "id" uuid DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "name" text, "email" text NOT NULL, ', SQLERRM);
END $__w__$;


-- ── Columns present in JNG but missing in Twif ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."inspection_report_logs" ADD COLUMN IF NOT EXISTS "result" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column inspection_report_logs.result', 'ALTER TABLE public."inspection_report_logs" ADD COLUMN IF NOT EXISTS "result" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."inspection_report_photos" ADD COLUMN IF NOT EXISTS "step_key" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column inspection_report_photos.step_key', 'ALTER TABLE public."inspection_report_photos" ADD COLUMN IF NOT EXISTS "step_key" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."inspection_reports" ADD COLUMN IF NOT EXISTS "fulfilled_schedule_id" uuid$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column inspection_reports.fulfilled_schedule_id', 'ALTER TABLE public."inspection_reports" ADD COLUMN IF NOT EXISTS "fulfilled_schedule_id" uuid', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."inspection_reports" ADD COLUMN IF NOT EXISTS "available_quantity" numeric$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column inspection_reports.available_quantity', 'ALTER TABLE public."inspection_reports" ADD COLUMN IF NOT EXISTS "available_quantity" numeric', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "original_price" real$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_catalog_skus.original_price', 'ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "original_price" real', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "original_currency" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_catalog_skus.original_currency', 'ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "original_currency" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "notes" jsonb$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_catalog_skus.notes', 'ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "notes" jsonb', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "spec_images" jsonb$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_catalog_skus.spec_images', 'ALTER TABLE public."npd2_catalog_skus" ADD COLUMN IF NOT EXISTS "spec_images" jsonb', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_catalog_uploads" ADD COLUMN IF NOT EXISTS "worker_execution_name" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_catalog_uploads.worker_execution_name', 'ALTER TABLE public."npd2_catalog_uploads" ADD COLUMN IF NOT EXISTS "worker_execution_name" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "sample_delivered_date" date$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_sample_orders.sample_delivered_date', 'ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "sample_delivered_date" date', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "container_no" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_sample_orders.container_no', 'ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "container_no" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "vessel_no" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_sample_orders.vessel_no', 'ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "vessel_no" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "courier_company" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_sample_orders.courier_company', 'ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "courier_company" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "qa_comments" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_sample_orders.qa_comments', 'ALTER TABLE public."npd2_sample_orders" ADD COLUMN IF NOT EXISTS "qa_comments" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_workspaces" ADD COLUMN IF NOT EXISTS "group_chat_member_ids" uuid[]$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column npd2_workspaces.group_chat_member_ids', 'ALTER TABLE public."npd2_workspaces" ADD COLUMN IF NOT EXISTS "group_chat_member_ids" uuid[]', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."organization_members" ADD COLUMN IF NOT EXISTS "removed_at" timestamp with time zone$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column organization_members.removed_at', 'ALTER TABLE public."organization_members" ADD COLUMN IF NOT EXISTS "removed_at" timestamp with time zone', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."organizations" ADD COLUMN IF NOT EXISTS "admin_notes" jsonb$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column organizations.admin_notes', 'ALTER TABLE public."organizations" ADD COLUMN IF NOT EXISTS "admin_notes" jsonb', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."otif_exceptions" ADD COLUMN IF NOT EXISTS "exception_type" text DEFAULT 'otif_date_change'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column otif_exceptions.exception_type', 'ALTER TABLE public."otif_exceptions" ADD COLUMN IF NOT EXISTS "exception_type" text DEFAULT ''otif_date_change''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."otif_exceptions" ADD COLUMN IF NOT EXISTS "line_item_id" uuid$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column otif_exceptions.line_item_id', 'ALTER TABLE public."otif_exceptions" ADD COLUMN IF NOT EXISTS "line_item_id" uuid', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."otif_exceptions" ADD COLUMN IF NOT EXISTS "requested_quantity" numeric$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column otif_exceptions.requested_quantity', 'ALTER TABLE public."otif_exceptions" ADD COLUMN IF NOT EXISTS "requested_quantity" numeric', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."po_comments" ADD COLUMN IF NOT EXISTS "line_item_id" uuid$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column po_comments.line_item_id', 'ALTER TABLE public."po_comments" ADD COLUMN IF NOT EXISTS "line_item_id" uuid', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "inspection_level" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column purchase_orders.inspection_level', 'ALTER TABLE public."purchase_orders" ADD COLUMN IF NOT EXISTS "inspection_level" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."shipment_invoices" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'not_raised'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column shipment_invoices.status', 'ALTER TABLE public."shipment_invoices" ADD COLUMN IF NOT EXISTS "status" text DEFAULT ''not_raised''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."sku_import_batches" ADD COLUMN IF NOT EXISTS "po_id" uuid$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column sku_import_batches.po_id', 'ALTER TABLE public."sku_import_batches" ADD COLUMN IF NOT EXISTS "po_id" uuid', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."sku_import_batches" ADD COLUMN IF NOT EXISTS "import_type" text DEFAULT 'product_sheet'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column sku_import_batches.import_type', 'ALTER TABLE public."sku_import_batches" ADD COLUMN IF NOT EXISTS "import_type" text DEFAULT ''product_sheet''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "image_url" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column skus.image_url', 'ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "image_url" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "primary_base_material_id" uuid$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column skus.primary_base_material_id', 'ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "primary_base_material_id" uuid', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "secondary_base_material_id" uuid$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column skus.secondary_base_material_id', 'ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "secondary_base_material_id" uuid', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "item_weight_unit" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column skus.item_weight_unit', 'ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "item_weight_unit" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "inner_pack_weight_unit" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column skus.inner_pack_weight_unit', 'ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "inner_pack_weight_unit" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "master_pack_weight_unit" text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column skus.master_pack_weight_unit', 'ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "master_pack_weight_unit" text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "master_pack_cartons" jsonb$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('column skus.master_pack_cartons', 'ALTER TABLE public."skus" ADD COLUMN IF NOT EXISTS "master_pack_cartons" jsonb', SQLERRM);
END $__w__$;


-- ── Unique keys used by upserts ──
DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE UNIQUE INDEX IF NOT EXISTS npd2_workspace_permissions_ws_member_key ON public.npd2_workspace_permissions (workspace_id, member_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('unique npd2_workspace_permissions', 'CREATE UNIQUE INDEX IF NOT EXISTS npd2_workspace_permissions_ws_member_key ON public.npd2_workspace_permissions (workspace_id, member_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE UNIQUE INDEX IF NOT EXISTS npd2_plm_admins_member_key ON public.npd2_plm_admins (member_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('unique npd2_plm_admins', 'CREATE UNIQUE INDEX IF NOT EXISTS npd2_plm_admins_member_key ON public.npd2_plm_admins (member_id)', SQLERRM);
END $__w__$;


-- ── Retry migration statements that failed on the first pass ──
DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = 'add_buyer_contacts_table.sql#1') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = 'add_buyer_contacts_table.sql#1';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS buyer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text,
  email text not null,
  created_by text,
  created_by_member_id uuid references organization_members(id),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_buyer_contacts_table.sql#1', 'CREATE TABLE IF NOT EXISTS buyer_contacts ( id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = 'add_buyer_contacts_table.sql#2') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = 'add_buyer_contacts_table.sql#2';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS buyer_contacts_organization_id_idx ON buyer_contacts (organization_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_buyer_contacts_table.sql#2', 'CREATE INDEX IF NOT EXISTS buyer_contacts_organization_id_idx ON buyer_contacts (organization_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = 'add_vendor_contacts_table.sql#3') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = 'add_vendor_contacts_table.sql#3';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text,
  email text not null,
  created_by text,
  created_by_member_id uuid references organization_members(id),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_vendor_contacts_table.sql#3', 'CREATE TABLE IF NOT EXISTS vendor_contacts ( id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name tex', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = 'add_vendor_contacts_table.sql#4') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = 'add_vendor_contacts_table.sql#4';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS vendor_contacts_organization_id_idx ON vendor_contacts (organization_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('add_vendor_contacts_table.sql#4', 'CREATE INDEX IF NOT EXISTS vendor_contacts_organization_id_idx ON vendor_contacts (organization_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260729_add_line_item_id_to_po_comments.sql#5') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260729_add_line_item_id_to_po_comments.sql#5';
  EXECUTE $__s__$ALTER TABLE po_comments ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id) ON DELETE CASCADE$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260729_add_line_item_id_to_po_comments.sql#5', 'ALTER TABLE po_comments ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id) ON DELETE CASCADE', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260729_add_line_item_id_to_po_comments.sql#6') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260729_add_line_item_id_to_po_comments.sql#6';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS po_comments_line_item_id_idx ON po_comments(line_item_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260729_add_line_item_id_to_po_comments.sql#6', 'CREATE INDEX IF NOT EXISTS po_comments_line_item_id_idx ON po_comments(line_item_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260729_add_line_item_id_to_po_comments.sql#7') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260729_add_line_item_id_to_po_comments.sql#7';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260729_add_line_item_id_to_po_comments.sql#7', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#8') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#8';
  EXECUTE $__s__$CREATE SEQUENCE IF NOT EXISTS inspection_report_no_seq$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#8', 'CREATE SEQUENCE IF NOT EXISTS inspection_report_no_seq', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#9') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#9';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_reports (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_item_id                    uuid NOT NULL REFERENCES po_line_items(id),
  report_no                          text UNIQUE NOT NULL DEFAULT
    ('IRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('inspection_report_no_seq')::text, 5, '0')),

  inspector_name                     text,
  inspection_type                    text CHECK (inspection_type IN ('inline', 'midline', 'final')),
  arrival_time                       text,
  start_time                         text,
  complete_time                      text,
  contact                            text,
  inspection_date                    date,

  ship_via                           text,
  inspected_qty                      numeric,
  accepted_quantity                  numeric,
  carton_available                   numeric,
  inspection_result                  text CHECK (inspection_result IN ('accepted', 'rejected')),

  packaging_appearance               jsonb NOT NULL DEFAULT '{}'::jsonb,  
  packaging_measurement_findings     jsonb NOT NULL DEFAULT '{}'::jsonb,  
  barcode_results                    jsonb NOT NULL DEFAULT '{}'::jsonb,  
  onsite_tests                       jsonb NOT NULL DEFAULT '{}'::jsonb,  

  workmanship_inspection_level       text,
  workmanship_sample_size            text,
  aql_critical                       numeric,
  aql_major                          numeric,
  aql_minor                          numeric,
  workmanship_remarks                text,

  remarks                            jsonb NOT NULL DEFAULT '[]'::jsonb,   
  attachments                        jsonb NOT NULL DEFAULT '[]'::jsonb,   

  vendor_rep_name                    text,
  vendor_rep_signature               text,   
  quality_process_auditor_name       text,
  quality_process_auditor_signature  text,
  quality_resource_name              text,
  quality_resource_signature         text,

  status                             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at                       timestamptz,   
  created_by                         text,
  created_at                         timestamptz DEFAULT now(),
  updated_at                         timestamptz DEFAULT now(),
  UNIQUE (po_line_item_id, inspection_type)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#9', 'CREATE TABLE IF NOT EXISTS inspection_reports ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_line_item_id uuid NOT NULL REFERENCES po_line_items(id), repor', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#10') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#10';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_reports_po_line_item_id ON inspection_reports(po_line_item_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#10', 'CREATE INDEX IF NOT EXISTS idx_inspection_reports_po_line_item_id ON inspection_reports(po_line_item_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#11') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#11';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_defects (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  defect_description text,
  critical_count     integer NOT NULL DEFAULT 0,
  major_count        integer NOT NULL DEFAULT 0,
  minor_count        integer NOT NULL DEFAULT 0,
  remarks            text,
  created_at         timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#11', 'CREATE TABLE IF NOT EXISTS inspection_report_defects ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES inspection_reports(id) ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#12') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#12';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_defects_report_id ON inspection_report_defects(report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#12', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_defects_report_id ON inspection_report_defects(report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#13') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#13';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption      text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#13', 'CREATE TABLE IF NOT EXISTS inspection_report_photos ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES inspection_reports(id) O', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#14') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#14';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_photos_report_id ON inspection_report_photos(report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#14', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_photos_report_id ON inspection_report_photos(report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#15') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260730_create_inspection_reports.sql#15';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260730_create_inspection_reports.sql#15', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#16') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#16';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  po_line_item_id   uuid NOT NULL REFERENCES po_line_items(id),
  inspection_type   text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  round             integer NOT NULL DEFAULT 1,
  event_type        text NOT NULL CHECK (event_type IN ('draft_saved', 'submitted', 'edited', 'reinspection_started')),
  actor_name        text,
  reason            text,   
  created_at        timestamptz DEFAULT now(),
  CHECK (event_type NOT IN ('edited', 'reinspection_started') OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#16', 'CREATE TABLE IF NOT EXISTS inspection_report_logs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES inspection_reports(id) ON ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#17') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#17';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_po_line_item_id ON inspection_report_logs(po_line_item_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#17', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_po_line_item_id ON inspection_report_logs(po_line_item_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#18') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#18';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_report_id ON inspection_report_logs(report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#18', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_report_id ON inspection_report_logs(report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#19') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#19';
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS round integer NOT NULL DEFAULT 1$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#19', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS round integer NOT NULL DEFAULT 1', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#20') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#20';
  EXECUTE $__s__$DO $$
DECLARE
  old_uq_name text;
BEGIN
  -- Find whatever Postgres actually named the original
  -- UNIQUE(po_line_item_id, inspection_type) constraint, rather than
  -- assuming its default auto-generated name.
  SELECT con.conname INTO old_uq_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'inspection_reports'
    AND con.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM unnest(con.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    ) = ARRAY['inspection_type', 'po_line_item_id']::text[];

  IF old_uq_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inspection_reports DROP CONSTRAINT %I', old_uq_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'inspection_reports'::regclass
      AND conname = 'inspection_reports_po_line_item_id_inspection_type_round_key'
  ) THEN
    ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_po_line_item_id_inspection_type_round_key
      UNIQUE (po_line_item_id, inspection_type, round);
  END IF;
END $$$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#20', 'DO $$ DECLARE old_uq_name text; BEGIN -- Find whatever Postgres actually named the original -- UNIQUE(po_line_item_id, inspection_type) constraint, rather than ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#21') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260803_inspection_report_audit_log.sql#21';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260803_inspection_report_audit_log.sql#21', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_add_inspection_level_to_purchase_orders.sql#22') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_add_inspection_level_to_purchase_orders.sql#22';
  EXECUTE $__s__$ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS inspection_level text
    CHECK (inspection_level IN ('G-I', 'G-II', 'G-III', 'S-1', 'S-2', 'S-3', 'S-4'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_inspection_level_to_purchase_orders.sql#22', 'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS inspection_level text CHECK (inspection_level IN (''G-I'', ''G-II'', ''G-III'', ''S-1'', ''S-2'', ''S-3'', ''S-4''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_add_inspection_level_to_purchase_orders.sql#23') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_add_inspection_level_to_purchase_orders.sql#23';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_inspection_level_to_purchase_orders.sql#23', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_add_last_edited_tracking.sql#24') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_add_last_edited_tracking.sql#24';
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS updated_by text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_last_edited_tracking.sql#24', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS updated_by text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_add_last_edited_tracking.sql#25') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_add_last_edited_tracking.sql#25';
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS last_step text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_last_edited_tracking.sql#25', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS last_step text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_add_last_edited_tracking.sql#26') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_add_last_edited_tracking.sql#26';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_add_last_edited_tracking.sql#26', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_disable_rls_inspection_report_photos.sql#27') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_disable_rls_inspection_report_photos.sql#27';
  EXECUTE $__s__$ALTER TABLE inspection_report_photos DISABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_disable_rls_inspection_report_photos.sql#27', 'ALTER TABLE inspection_report_photos DISABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_disable_rls_inspection_report_photos.sql#28') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_disable_rls_inspection_report_photos.sql#28';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_disable_rls_inspection_report_photos.sql#28', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_expand_inspection_result_statuses.sql#29') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_expand_inspection_result_statuses.sql#29';
  EXECUTE $__s__$ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_inspection_result_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_expand_inspection_result_statuses.sql#29', 'ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_inspection_result_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_expand_inspection_result_statuses.sql#30') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_expand_inspection_result_statuses.sql#30';
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_inspection_result_check
  CHECK (inspection_result IN (
    'making_a_plan', 'plan_ready', 'plan_aborted', 'feedback_inprogress',
    'accepted', 'partially_accepted', 'accepted_with_deviations', 'rejected', 'resubmit', 'on_hold'
  ))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_expand_inspection_result_statuses.sql#30', 'ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_inspection_result_check CHECK (inspection_result IN ( ''making_a_plan'', ''plan_ready'', ''plan_abor', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_expand_inspection_result_statuses.sql#31') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_expand_inspection_result_statuses.sql#31';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_expand_inspection_result_statuses.sql#31', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_inspection_reports_bucket_storage_policy.sql#32') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_inspection_reports_bucket_storage_policy.sql#32';
  EXECUTE $__s__$DROP POLICY IF EXISTS "inspection_reports_bucket_all" ON storage.objects$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_inspection_reports_bucket_storage_policy.sql#32', 'DROP POLICY IF EXISTS "inspection_reports_bucket_all" ON storage.objects', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260804_inspection_reports_bucket_storage_policy.sql#33') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260804_inspection_reports_bucket_storage_policy.sql#33';
  EXECUTE $__s__$CREATE POLICY "inspection_reports_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'inspection-reports')
  WITH CHECK (bucket_id = 'inspection-reports')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260804_inspection_reports_bucket_storage_policy.sql#33', 'CREATE POLICY "inspection_reports_bucket_all" ON storage.objects FOR ALL USING (bucket_id = ''inspection-reports'') WITH CHECK (bucket_id = ''inspection-reports'')', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#34') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#34';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           uuid NOT NULL REFERENCES purchase_orders(id),
  inspection_type text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  scheduled_date  date NOT NULL,
  assigned_qa_id  uuid NOT NULL REFERENCES organization_members(id),
  status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes           text,
  created_by      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#34', 'CREATE TABLE IF NOT EXISTS inspection_schedules ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_id uuid NOT NULL REFERENCES purchase_orders(id), inspection_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#35') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#35';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_schedules_date  ON inspection_schedules(scheduled_date)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#35', 'CREATE INDEX IF NOT EXISTS idx_inspection_schedules_date ON inspection_schedules(scheduled_date)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#36') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#36';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_schedules_po_id ON inspection_schedules(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#36', 'CREATE INDEX IF NOT EXISTS idx_inspection_schedules_po_id ON inspection_schedules(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#37') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260805_create_inspection_schedules.sql#37';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260805_create_inspection_schedules.sql#37', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#38') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#38';
  EXECUTE $__s__$ALTER TABLE inspection_schedules
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES inspection_requests(id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#38', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES inspection_requests(id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#39') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#39';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ALTER COLUMN assigned_qa_id DROP NOT NULL$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#39', 'ALTER TABLE inspection_schedules ALTER COLUMN assigned_qa_id DROP NOT NULL', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#40') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#40';
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_status_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#40', 'ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_status_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#41') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#41';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_status_check
  CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#41', 'ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_status_check CHECK (status IN (''requested'', ''scheduled'', ''completed'', ''cancelled''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#42') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_add_requested_status_to_schedules.sql#42';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_add_requested_status_to_schedules.sql#42', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#43') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#43';
  EXECUTE $__s__$CREATE SEQUENCE IF NOT EXISTS inspection_request_no_seq$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#43', 'CREATE SEQUENCE IF NOT EXISTS inspection_request_no_seq', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#44') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#44';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no              text UNIQUE NOT NULL DEFAULT
    ('IRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('inspection_request_no_seq')::text, 5, '0')),
  po_id                   uuid NOT NULL REFERENCES purchase_orders(id),
  po_number               text,
  vendor_name             text NOT NULL,
  buyer_name              text NOT NULL,
  vendor_contact_name     text NOT NULL,
  vendor_mobile_no        text NOT NULL,
  vendor_email            text NOT NULL,
  factory_address         text NOT NULL,
  inspection_type         text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  ship_date               date NOT NULL,
  total_sku_count         integer,
  sku_no                  text,
  green_seal_available    boolean,
  total_order_qty         numeric,
  inspection_request_date date NOT NULL,
  policy_acknowledged     boolean NOT NULL DEFAULT false,
  submitted_by            text,
  submitted_by_email      text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#44', 'CREATE TABLE IF NOT EXISTS inspection_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_no text UNIQUE NOT NULL DEFAULT (''IRF-'' || to_char(now()', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#45') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#45';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_requests_po_id ON inspection_requests(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#45', 'CREATE INDEX IF NOT EXISTS idx_inspection_requests_po_id ON inspection_requests(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#46') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#46';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_request_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text,
  created_at   timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#46', 'CREATE TABLE IF NOT EXISTS inspection_request_attachments ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES inspection_reques', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#47') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#47';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_irf_attachments_request_id ON inspection_request_attachments(request_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#47', 'CREATE INDEX IF NOT EXISTS idx_irf_attachments_request_id ON inspection_request_attachments(request_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#48') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_create_inspection_requests.sql#48';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_create_inspection_requests.sql#48', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_irf_attachments_bucket_policy.sql#49') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_irf_attachments_bucket_policy.sql#49';
  EXECUTE $__s__$INSERT INTO storage.buckets (id, name, public)
  VALUES ('irf-attachments', 'irf-attachments', true)
  ON CONFLICT (id) DO NOTHING$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_irf_attachments_bucket_policy.sql#49', 'INSERT INTO storage.buckets (id, name, public) VALUES (''irf-attachments'', ''irf-attachments'', true) ON CONFLICT (id) DO NOTHING', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_irf_attachments_bucket_policy.sql#50') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_irf_attachments_bucket_policy.sql#50';
  EXECUTE $__s__$DROP POLICY IF EXISTS "irf_attachments_bucket_all" ON storage.objects$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_irf_attachments_bucket_policy.sql#50', 'DROP POLICY IF EXISTS "irf_attachments_bucket_all" ON storage.objects', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260806_irf_attachments_bucket_policy.sql#51') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260806_irf_attachments_bucket_policy.sql#51';
  EXECUTE $__s__$CREATE POLICY "irf_attachments_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'irf-attachments')
  WITH CHECK (bucket_id = 'irf-attachments')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260806_irf_attachments_bucket_policy.sql#51', 'CREATE POLICY "irf_attachments_bucket_all" ON storage.objects FOR ALL USING (bucket_id = ''irf-attachments'') WITH CHECK (bucket_id = ''irf-attachments'')', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260808_add_line_item_ids_to_inspection_schedules.sql#52') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260808_add_line_item_ids_to_inspection_schedules.sql#52';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_item_ids uuid[]$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808_add_line_item_ids_to_inspection_schedules.sql#52', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_item_ids uuid[]', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260808_add_line_item_ids_to_inspection_schedules.sql#53') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260808_add_line_item_ids_to_inspection_schedules.sql#53';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808_add_line_item_ids_to_inspection_schedules.sql#53', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260808b_replace_line_item_ids_with_line_items.sql#54') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260808b_replace_line_item_ids_with_line_items.sql#54';
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP COLUMN IF EXISTS line_item_ids$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808b_replace_line_item_ids_with_line_items.sql#54', 'ALTER TABLE inspection_schedules DROP COLUMN IF EXISTS line_item_ids', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260808b_replace_line_item_ids_with_line_items.sql#55') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260808b_replace_line_item_ids_with_line_items.sql#55';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_items jsonb$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808b_replace_line_item_ids_with_line_items.sql#55', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_items jsonb', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260808b_replace_line_item_ids_with_line_items.sql#56') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260808b_replace_line_item_ids_with_line_items.sql#56';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260808b_replace_line_item_ids_with_line_items.sql#56', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#57') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#57';
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS fulfilled_schedule_id uuid REFERENCES inspection_schedules(id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#57', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS fulfilled_schedule_id uuid REFERENCES inspection_schedules(id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#58') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#58';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260811_add_fulfilled_schedule_id_to_inspection_reports.sql#58', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260812_add_ppm_inspection_type.sql#59') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260812_add_ppm_inspection_type.sql#59';
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_add_ppm_inspection_type.sql#59', 'ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260812_add_ppm_inspection_type.sql#60') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260812_add_ppm_inspection_type.sql#60';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check
  CHECK (inspection_type IN ('ppm', 'inline', 'midline', 'final'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_add_ppm_inspection_type.sql#60', 'ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check CHECK (inspection_type IN (''ppm'', ''inline'', ''midline'', ''final''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260812_add_ppm_inspection_type.sql#61') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260812_add_ppm_inspection_type.sql#61';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_add_ppm_inspection_type.sql#61', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260812_fulfilled_schedule_id_on_delete_set_null.sql#62') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260812_fulfilled_schedule_id_on_delete_set_null.sql#62';
  EXECUTE $__s__$ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_fulfilled_schedule_id_fkey$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_fulfilled_schedule_id_on_delete_set_null.sql#62', 'ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_fulfilled_schedule_id_fkey', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260812_fulfilled_schedule_id_on_delete_set_null.sql#63') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260812_fulfilled_schedule_id_on_delete_set_null.sql#63';
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_fulfilled_schedule_id_fkey
  FOREIGN KEY (fulfilled_schedule_id) REFERENCES inspection_schedules(id) ON DELETE SET NULL$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_fulfilled_schedule_id_on_delete_set_null.sql#63', 'ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_fulfilled_schedule_id_fkey FOREIGN KEY (fulfilled_schedule_id) REFERENCES inspection_schedules(', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260812_fulfilled_schedule_id_on_delete_set_null.sql#64') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260812_fulfilled_schedule_id_on_delete_set_null.sql#64';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260812_fulfilled_schedule_id_on_delete_set_null.sql#64', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260813_add_scheduled_time.sql#65') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260813_add_scheduled_time.sql#65';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS scheduled_time time$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260813_add_scheduled_time.sql#65', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS scheduled_time time', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260813_add_scheduled_time.sql#66') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260813_add_scheduled_time.sql#66';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260813_add_scheduled_time.sql#66', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260814_create_tech_enhancement_requests.sql#67') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260814_create_tech_enhancement_requests.sql#67';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS tech_enhancement_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id  uuid NOT NULL REFERENCES organization_members(id),
  title                   text NOT NULL,
  description             text NOT NULL,
  priority                text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status                  text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'in_progress', 'done', 'rejected')),
  attachment_url          text,
  resolution_comment      text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_create_tech_enhancement_requests.sql#67', 'CREATE TABLE IF NOT EXISTS tech_enhancement_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_member_id uuid NOT NULL REFERENCES organizati', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260814_create_tech_enhancement_requests.sql#68') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260814_create_tech_enhancement_requests.sql#68';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_tech_enhancement_requests_member_id ON tech_enhancement_requests(organization_member_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_create_tech_enhancement_requests.sql#68', 'CREATE INDEX IF NOT EXISTS idx_tech_enhancement_requests_member_id ON tech_enhancement_requests(organization_member_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260814_create_tech_enhancement_requests.sql#69') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260814_create_tech_enhancement_requests.sql#69';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_create_tech_enhancement_requests.sql#69', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260814_tech_enhancement_attachments_bucket_policy.sql#70') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260814_tech_enhancement_attachments_bucket_policy.sql#70';
  EXECUTE $__s__$INSERT INTO storage.buckets (id, name, public)
  VALUES ('tech-enhancement-attachments', 'tech-enhancement-attachments', true)
  ON CONFLICT (id) DO NOTHING$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_tech_enhancement_attachments_bucket_policy.sql#70', 'INSERT INTO storage.buckets (id, name, public) VALUES (''tech-enhancement-attachments'', ''tech-enhancement-attachments'', true) ON CONFLICT (id) DO NOTHING', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260814_tech_enhancement_attachments_bucket_policy.sql#71') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260814_tech_enhancement_attachments_bucket_policy.sql#71';
  EXECUTE $__s__$DROP POLICY IF EXISTS "tech_enhancement_attachments_bucket_all" ON storage.objects$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_tech_enhancement_attachments_bucket_policy.sql#71', 'DROP POLICY IF EXISTS "tech_enhancement_attachments_bucket_all" ON storage.objects', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260814_tech_enhancement_attachments_bucket_policy.sql#72') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260814_tech_enhancement_attachments_bucket_policy.sql#72';
  EXECUTE $__s__$CREATE POLICY "tech_enhancement_attachments_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'tech-enhancement-attachments')
  WITH CHECK (bucket_id = 'tech-enhancement-attachments')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260814_tech_enhancement_attachments_bucket_policy.sql#72', 'CREATE POLICY "tech_enhancement_attachments_bucket_all" ON storage.objects FOR ALL USING (bucket_id = ''tech-enhancement-attachments'') WITH CHECK (bucket_id = ''t', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260815_create_tech_enhancement_request_votes.sql#73') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260815_create_tech_enhancement_request_votes.sql#73';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS tech_enhancement_request_votes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid NOT NULL REFERENCES tech_enhancement_requests(id) ON DELETE CASCADE,
  organization_member_id  uuid NOT NULL REFERENCES organization_members(id),
  created_at              timestamptz DEFAULT now(),
  UNIQUE (request_id, organization_member_id)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260815_create_tech_enhancement_request_votes.sql#73', 'CREATE TABLE IF NOT EXISTS tech_enhancement_request_votes ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES tech_enhancement_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260815_create_tech_enhancement_request_votes.sql#74') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260815_create_tech_enhancement_request_votes.sql#74';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_ter_votes_request_id ON tech_enhancement_request_votes(request_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260815_create_tech_enhancement_request_votes.sql#74', 'CREATE INDEX IF NOT EXISTS idx_ter_votes_request_id ON tech_enhancement_request_votes(request_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260815_create_tech_enhancement_request_votes.sql#75') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260815_create_tech_enhancement_request_votes.sql#75';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260815_create_tech_enhancement_request_votes.sql#75', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#76') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#76';
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#76', 'ALTER TABLE tech_enhancement_requests DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#77') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#77';
  EXECUTE $__s__$UPDATE tech_enhancement_requests SET status = 'accepted'  WHERE status IN ('in_review', 'in_progress')$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#77', 'UPDATE tech_enhancement_requests SET status = ''accepted'' WHERE status IN (''in_review'', ''in_progress'')', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#78') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#78';
  EXECUTE $__s__$UPDATE tech_enhancement_requests SET status = 'submitted' WHERE status = 'rejected'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#78', 'UPDATE tech_enhancement_requests SET status = ''submitted'' WHERE status = ''rejected''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#79') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#79';
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  ADD CONSTRAINT tech_enhancement_requests_status_check
  CHECK (status IN ('submitted', 'accepted', 'done'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#79', 'ALTER TABLE tech_enhancement_requests ADD CONSTRAINT tech_enhancement_requests_status_check CHECK (status IN (''submitted'', ''accepted'', ''done''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#80') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260816_simplify_tech_enhancement_request_status.sql#80';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260816_simplify_tech_enhancement_request_status.sql#80', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260817_add_declined_status.sql#81') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260817_add_declined_status.sql#81';
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260817_add_declined_status.sql#81', 'ALTER TABLE tech_enhancement_requests DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260817_add_declined_status.sql#82') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260817_add_declined_status.sql#82';
  EXECUTE $__s__$ALTER TABLE tech_enhancement_requests
  ADD CONSTRAINT tech_enhancement_requests_status_check
  CHECK (status IN ('submitted', 'accepted', 'done', 'declined'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260817_add_declined_status.sql#82', 'ALTER TABLE tech_enhancement_requests ADD CONSTRAINT tech_enhancement_requests_status_check CHECK (status IN (''submitted'', ''accepted'', ''done'', ''declined''))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260817_add_declined_status.sql#83') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260817_add_declined_status.sql#83';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260817_add_declined_status.sql#83', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260818_add_available_quantity_to_inspection_reports.sql#84') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260818_add_available_quantity_to_inspection_reports.sql#84';
  EXECUTE $__s__$ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS available_quantity numeric$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260818_add_available_quantity_to_inspection_reports.sql#84', 'ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS available_quantity numeric', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260818_add_available_quantity_to_inspection_reports.sql#85') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260818_add_available_quantity_to_inspection_reports.sql#85';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260818_add_available_quantity_to_inspection_reports.sql#85', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260819_add_created_by_email_to_inspection_schedules.sql#86') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260819_add_created_by_email_to_inspection_schedules.sql#86';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS created_by_email text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_created_by_email_to_inspection_schedules.sql#86', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS created_by_email text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260819_add_created_by_email_to_inspection_schedules.sql#87') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260819_add_created_by_email_to_inspection_schedules.sql#87';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_created_by_email_to_inspection_schedules.sql#87', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260819_add_step_key_to_inspection_report_photos.sql#88') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260819_add_step_key_to_inspection_report_photos.sql#88';
  EXECUTE $__s__$ALTER TABLE inspection_report_photos ADD COLUMN IF NOT EXISTS step_key text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_step_key_to_inspection_report_photos.sql#88', 'ALTER TABLE inspection_report_photos ADD COLUMN IF NOT EXISTS step_key text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260819_add_step_key_to_inspection_report_photos.sql#89') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260819_add_step_key_to_inspection_report_photos.sql#89';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260819_add_step_key_to_inspection_report_photos.sql#89', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#90') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#90';
  EXECUTE $__s__$ALTER TABLE otif_exceptions
  ADD COLUMN IF NOT EXISTS exception_type text NOT NULL DEFAULT 'otif_date_change'
    CHECK (exception_type IN ('otif_date_change', 'quantity_cancellation')),
  ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id),
  ADD COLUMN IF NOT EXISTS requested_quantity numeric$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#90', 'ALTER TABLE otif_exceptions ADD COLUMN IF NOT EXISTS exception_type text NOT NULL DEFAULT ''otif_date_change'' CHECK (exception_type IN (''otif_date_change'', ''quan', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#91') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#91';
  EXECUTE $__s__$CREATE UNIQUE INDEX IF NOT EXISTS uq_otif_exceptions_one_pending_cancellation
  ON otif_exceptions(line_item_id)
  WHERE exception_type = 'quantity_cancellation' AND status = 'pending'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#91', 'CREATE UNIQUE INDEX IF NOT EXISTS uq_otif_exceptions_one_pending_cancellation ON otif_exceptions(line_item_id) WHERE exception_type = ''quantity_cancellation'' AN', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#92') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#92';
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION apply_line_item_cancellation(p_line_item_id uuid, p_amount numeric)
RETURNS void AS $$
  UPDATE po_line_items
  SET cancelled_quantity = coalesce(cancelled_quantity, 0) + p_amount,
      balance_quantity   = greatest(0, coalesce(balance_quantity, 0) - p_amount)
  WHERE id = p_line_item_id;
$$ LANGUAGE sql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#92', 'CREATE OR REPLACE FUNCTION apply_line_item_cancellation(p_line_item_id uuid, p_amount numeric) RETURNS void AS $$ UPDATE po_line_items SET cancelled_quantity = ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#93') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260824_extend_otif_exceptions_for_cancellations.sql#93';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260824_extend_otif_exceptions_for_cancellations.sql#93', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260827_add_last_edited_tracking_to_inspection_schedules.sql#94') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260827_add_last_edited_tracking_to_inspection_schedules.sql#94';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260827_add_last_edited_tracking_to_inspection_schedules.sql#94', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260827_add_last_edited_tracking_to_inspection_schedules.sql#95') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260827_add_last_edited_tracking_to_inspection_schedules.sql#95';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by_email text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260827_add_last_edited_tracking_to_inspection_schedules.sql#95', 'ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by_email text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260827_add_last_edited_tracking_to_inspection_schedules.sql#96') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260827_add_last_edited_tracking_to_inspection_schedules.sql#96';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260827_add_last_edited_tracking_to_inspection_schedules.sql#96', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#97') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#97';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_rework_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id               uuid NOT NULL REFERENCES purchase_orders(id),
  items               jsonb NOT NULL, 
  reason              text NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by        text,
  requested_by_email  text,
  
  
  
  requested_by_member_id uuid REFERENCES organization_members(id),
  requested_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_by         text,
  reviewed_by_email   text,
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz NOT NULL DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#97', 'CREATE TABLE IF NOT EXISTS inspection_rework_requests ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_id uuid NOT NULL REFERENCES purchase_orders(id), items', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#98') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#98';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_po_id ON inspection_rework_requests(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#98', 'CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_po_id ON inspection_rework_requests(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#99') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#99';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_status ON inspection_rework_requests(status)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#99', 'CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_status ON inspection_rework_requests(status)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#100') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#100';
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_new_round integer;
  v_new_report_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    v_new_round := (v_item->>'round')::integer + 1;

    INSERT INTO inspection_reports (po_line_item_id, inspection_type, round, status, created_by)
    VALUES ((v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by)
    RETURNING id INTO v_new_report_id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#100', 'CREATE OR REPLACE FUNCTION approve_inspection_rework( p_request_id uuid, p_reviewed_by text, p_reviewed_by_email text ) RETURNS void AS $$ DECLARE v_request ins', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#101') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260905_create_inspection_rework_requests.sql#101';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260905_create_inspection_rework_requests.sql#101', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260907_add_pilot_run_inspection_type.sql#102') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260907_add_pilot_run_inspection_type.sql#102';
  EXECUTE $__s__$ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_add_pilot_run_inspection_type.sql#102', 'ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260907_add_pilot_run_inspection_type.sql#103') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260907_add_pilot_run_inspection_type.sql#103';
  EXECUTE $__s__$ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check
  CHECK (inspection_type IN ('ppm', 'pilot_run', 'inline', 'midline', 'final'))$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_add_pilot_run_inspection_type.sql#103', 'ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check CHECK (inspection_type IN (''ppm'', ''pilot_run'', ''inline'', ''midline'', ''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260907_add_pilot_run_inspection_type.sql#104') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260907_add_pilot_run_inspection_type.sql#104';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_add_pilot_run_inspection_type.sql#104', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#105') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#105';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS po_comment_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES po_comments(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#105', 'CREATE TABLE IF NOT EXISTS po_comment_photos ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comment_id uuid NOT NULL REFERENCES po_comments(id) ON DELETE CASC', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#106') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#106';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS po_comment_photos_comment_id_idx ON po_comment_photos(comment_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#106', 'CREATE INDEX IF NOT EXISTS po_comment_photos_comment_id_idx ON po_comment_photos(comment_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#107') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#107';
  EXECUTE $__s__$ALTER TABLE po_comment_photos DISABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#107', 'ALTER TABLE po_comment_photos DISABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#108') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260907_create_po_comment_photos.sql#108';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260907_create_po_comment_photos.sql#108', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260908_change_report_no_format.sql#109') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260908_change_report_no_format.sql#109';
  EXECUTE $__s__$WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM inspection_reports
)
UPDATE inspection_reports ir
SET report_no = 'JNGREP' || ordered.rn
FROM ordered
WHERE ir.id = ordered.id$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260908_change_report_no_format.sql#109', 'WITH ordered AS ( SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM inspection_reports ) UPDATE inspection_reports ir SET report_no = ''JNGREP'' |', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260908_change_report_no_format.sql#110') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260908_change_report_no_format.sql#110';
  EXECUTE $__s__$SELECT setval('inspection_report_no_seq', GREATEST((SELECT count(*) FROM inspection_reports), 1), (SELECT count(*) FROM inspection_reports) > 0)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260908_change_report_no_format.sql#110', 'SELECT setval(''inspection_report_no_seq'', (SELECT count(*) FROM inspection_reports))', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260908_change_report_no_format.sql#111') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260908_change_report_no_format.sql#111';
  EXECUTE $__s__$ALTER TABLE inspection_reports
  ALTER COLUMN report_no SET DEFAULT ('JNGREP' || nextval('inspection_report_no_seq')::text)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260908_change_report_no_format.sql#111', 'ALTER TABLE inspection_reports ALTER COLUMN report_no SET DEFAULT (''JNGREP'' || nextval(''inspection_report_no_seq'')::text)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260909_copy_report_data_on_rework_approval.sql#112') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260909_copy_report_data_on_rework_approval.sql#112';
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_old_report inspection_reports;
  v_new_round integer;
  v_new_report_id uuid;
  v_new_schedule_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    v_new_round := (v_item->>'round')::integer + 1;

    SELECT * INTO v_old_report FROM inspection_reports WHERE id = (v_item->>'report_id')::uuid;

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email)
    RETURNING id INTO v_new_schedule_id;

    INSERT INTO inspection_reports (
      po_line_item_id, inspection_type, round, status, created_by, fulfilled_schedule_id,
      inspector_name, arrival_time, start_time, complete_time, contact, inspection_date, ship_via,
      inspected_qty, accepted_quantity, carton_available, available_quantity,
      packaging_appearance, packaging_measurement_findings, barcode_results, onsite_tests,
      workmanship_inspection_level, workmanship_sample_size, aql_critical, aql_major, aql_minor, workmanship_remarks,
      attachments
    )
    VALUES (
      (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by, v_new_schedule_id,
      v_old_report.inspector_name, v_old_report.arrival_time, v_old_report.start_time, v_old_report.complete_time,
      v_old_report.contact, v_old_report.inspection_date, v_old_report.ship_via,
      v_old_report.inspected_qty, v_old_report.accepted_quantity, v_old_report.carton_available, v_old_report.available_quantity,
      coalesce(v_old_report.packaging_appearance, '{}'::jsonb), coalesce(v_old_report.packaging_measurement_findings, '{}'::jsonb),
      coalesce(v_old_report.barcode_results, '{}'::jsonb), coalesce(v_old_report.onsite_tests, '{}'::jsonb),
      v_old_report.workmanship_inspection_level, v_old_report.workmanship_sample_size,
      v_old_report.aql_critical, v_old_report.aql_major, v_old_report.aql_minor, v_old_report.workmanship_remarks,
      coalesce(v_old_report.attachments, '[]'::jsonb)
    )
    RETURNING id INTO v_new_report_id;

    -- Workmanship defect rows and Digitals photos are separate child
    -- tables - duplicated (new rows; photos reference the SAME
    -- storage_path, no file is re-uploaded/duplicated in storage) rather
    -- than moved, so the original round's own defects/photos stay exactly
    -- where they are too.
    INSERT INTO inspection_report_defects (report_id, defect_description, critical_count, major_count, minor_count, remarks)
    SELECT v_new_report_id, defect_description, critical_count, major_count, minor_count, remarks
    FROM inspection_report_defects WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_photos (report_id, storage_path, caption, sort_order)
    SELECT v_new_report_id, storage_path, caption, sort_order
    FROM inspection_report_photos WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260909_copy_report_data_on_rework_approval.sql#112', 'CREATE OR REPLACE FUNCTION approve_inspection_rework( p_request_id uuid, p_reviewed_by text, p_reviewed_by_email text ) RETURNS void AS $$ DECLARE v_request ins', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260909_copy_report_data_on_rework_approval.sql#113') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260909_copy_report_data_on_rework_approval.sql#113';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260909_copy_report_data_on_rework_approval.sql#113', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_add_result_to_inspection_report_logs.sql#114') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_add_result_to_inspection_report_logs.sql#114';
  EXECUTE $__s__$ALTER TABLE inspection_report_logs ADD COLUMN IF NOT EXISTS result text$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_add_result_to_inspection_report_logs.sql#114', 'ALTER TABLE inspection_report_logs ADD COLUMN IF NOT EXISTS result text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_add_result_to_inspection_report_logs.sql#115') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_add_result_to_inspection_report_logs.sql#115';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_add_result_to_inspection_report_logs.sql#115', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#116') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#116';
  EXECUTE $__s__$CREATE SEQUENCE IF NOT EXISTS inspection_batch_no_seq$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#116', 'CREATE SEQUENCE IF NOT EXISTS inspection_batch_no_seq', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#117') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#117';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no        text UNIQUE NOT NULL DEFAULT ('TWFCMB' || nextval('inspection_batch_no_seq')::text),
  report_ids_key  text UNIQUE NOT NULL,
  report_ids      uuid[] NOT NULL,
  po_id           uuid REFERENCES purchase_orders(id),
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#117', 'CREATE TABLE IF NOT EXISTS inspection_report_batches ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_no text UNIQUE NOT NULL DEFAULT (''TWFCMB'' || nextval', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#118') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#118';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_inspection_report_batches_po_id ON inspection_report_batches(po_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#118', 'CREATE INDEX IF NOT EXISTS idx_inspection_report_batches_po_id ON inspection_report_batches(po_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#119') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#119';
  EXECUTE $__s__$ALTER TABLE inspection_report_batches DISABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#119', 'ALTER TABLE inspection_report_batches DISABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#120') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_create_inspection_report_batches.sql#120';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_create_inspection_report_batches.sql#120', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_fix_rework_approval_round_race.sql#121') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_fix_rework_approval_round_race.sql#121';
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_old_report inspection_reports;
  v_new_round integer;
  v_new_report_id uuid;
  v_new_schedule_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    -- Always derived from the CURRENT max round for this exact SKU/stage,
    -- not the request's own possibly-stale captured round - see this
    -- migration's own header comment for the race this closes.
    SELECT COALESCE(MAX(round), (v_item->>'round')::integer) + 1
    INTO v_new_round
    FROM inspection_reports
    WHERE po_line_item_id = (v_item->>'po_line_item_id')::uuid
      AND inspection_type = v_item->>'inspection_type';

    SELECT * INTO v_old_report FROM inspection_reports WHERE id = (v_item->>'report_id')::uuid;

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email)
    RETURNING id INTO v_new_schedule_id;

    INSERT INTO inspection_reports (
      po_line_item_id, inspection_type, round, status, created_by, fulfilled_schedule_id,
      inspector_name, arrival_time, start_time, complete_time, contact, inspection_date, ship_via,
      inspected_qty, accepted_quantity, carton_available, available_quantity,
      packaging_appearance, packaging_measurement_findings, barcode_results, onsite_tests,
      workmanship_inspection_level, workmanship_sample_size, aql_critical, aql_major, aql_minor, workmanship_remarks,
      attachments
    )
    VALUES (
      (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by, v_new_schedule_id,
      v_old_report.inspector_name, v_old_report.arrival_time, v_old_report.start_time, v_old_report.complete_time,
      v_old_report.contact, v_old_report.inspection_date, v_old_report.ship_via,
      v_old_report.inspected_qty, v_old_report.accepted_quantity, v_old_report.carton_available, v_old_report.available_quantity,
      coalesce(v_old_report.packaging_appearance, '{}'::jsonb), coalesce(v_old_report.packaging_measurement_findings, '{}'::jsonb),
      coalesce(v_old_report.barcode_results, '{}'::jsonb), coalesce(v_old_report.onsite_tests, '{}'::jsonb),
      v_old_report.workmanship_inspection_level, v_old_report.workmanship_sample_size,
      v_old_report.aql_critical, v_old_report.aql_major, v_old_report.aql_minor, v_old_report.workmanship_remarks,
      coalesce(v_old_report.attachments, '[]'::jsonb)
    )
    RETURNING id INTO v_new_report_id;

    -- Workmanship defect rows and Digitals photos are separate child
    -- tables - duplicated (new rows; photos reference the SAME
    -- storage_path, no file is re-uploaded/duplicated in storage) rather
    -- than moved, so the original round's own defects/photos stay exactly
    -- where they are too.
    INSERT INTO inspection_report_defects (report_id, defect_description, critical_count, major_count, minor_count, remarks)
    SELECT v_new_report_id, defect_description, critical_count, major_count, minor_count, remarks
    FROM inspection_report_defects WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_photos (report_id, storage_path, caption, sort_order)
    SELECT v_new_report_id, storage_path, caption, sort_order
    FROM inspection_report_photos WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_fix_rework_approval_round_race.sql#121', 'CREATE OR REPLACE FUNCTION approve_inspection_rework( p_request_id uuid, p_reviewed_by text, p_reviewed_by_email text ) RETURNS void AS $$ DECLARE v_request ins', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260917_fix_rework_approval_round_race.sql#122') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260917_fix_rework_approval_round_race.sql#122';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260917_fix_rework_approval_round_race.sql#122', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260918_create_inspection_report_exports.sql#123') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260918_create_inspection_report_exports.sql#123';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_exports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_ids_key          text NOT NULL,
  mode                    text NOT NULL,
  url                     text NOT NULL,
  path                    text NOT NULL,
  filename                text NOT NULL,
  is_zip                  boolean NOT NULL DEFAULT false,
  size                    bigint NOT NULL,
  part_count              int NOT NULL DEFAULT 1,
  source_max_updated_at   timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_ids_key, mode)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260918_create_inspection_report_exports.sql#123', 'CREATE TABLE IF NOT EXISTS inspection_report_exports ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_ids_key text NOT NULL, mode text NOT NULL, url text', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260918_create_inspection_report_exports.sql#124') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260918_create_inspection_report_exports.sql#124';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260918_create_inspection_report_exports.sql#124', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#125') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#125';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_report_result_history (
  id                bigserial PRIMARY KEY,
  report_id         uuid NOT NULL,
  po_line_item_id   uuid,
  inspection_type   text,
  round             integer,
  old_status        text,
  new_status        text,
  old_result        text,
  new_result        text,
  old_submitted_at  timestamptz,
  new_submitted_at  timestamptz,
  changed_by        text,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'trigger'
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#125', 'CREATE TABLE IF NOT EXISTS inspection_report_result_history ( id bigserial PRIMARY KEY, report_id uuid NOT NULL, po_line_item_id uuid, inspection_type text, rou', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#126') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#126';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_irrh_report ON inspection_report_result_history (report_id, changed_at)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#126', 'CREATE INDEX IF NOT EXISTS idx_irrh_report ON inspection_report_result_history (report_id, changed_at)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#127') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#127';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_irrh_changed_at ON inspection_report_result_history (changed_at)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#127', 'CREATE INDEX IF NOT EXISTS idx_irrh_changed_at ON inspection_report_result_history (changed_at)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#128') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#128';
  EXECUTE $__s__$ALTER TABLE inspection_report_result_history ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#128', 'ALTER TABLE inspection_report_result_history ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#129') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#129';
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION log_inspection_report_result_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO inspection_report_result_history
        (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by)
      VALUES
        (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, NULL, NEW.status, NULL, NEW.inspection_result, NULL, NEW.submitted_at, COALESCE(NEW.updated_by, NEW.created_by));
    ELSE
      INSERT INTO inspection_report_result_history
        (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by)
      VALUES
        (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, OLD.status, NEW.status, OLD.inspection_result, NEW.inspection_result, OLD.submitted_at, NEW.submitted_at, COALESCE(NEW.updated_by, 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- history is best-effort: never block the real write
  END;
  RETURN NEW;
END;
$$$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#129', 'CREATE OR REPLACE FUNCTION log_inspection_report_result_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN BEGIN IF', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#130') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#130';
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_irrh_insert ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#130', 'DROP TRIGGER IF EXISTS trg_irrh_insert ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#131') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#131';
  EXECUTE $__s__$CREATE TRIGGER trg_irrh_insert AFTER INSERT ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION log_inspection_report_result_change()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#131', 'CREATE TRIGGER trg_irrh_insert AFTER INSERT ON inspection_reports FOR EACH ROW EXECUTE FUNCTION log_inspection_report_result_change()', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#132') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#132';
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_irrh_update ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#132', 'DROP TRIGGER IF EXISTS trg_irrh_update ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#133') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#133';
  EXECUTE $__s__$CREATE TRIGGER trg_irrh_update AFTER UPDATE ON inspection_reports
  FOR EACH ROW
  WHEN (OLD.inspection_result IS DISTINCT FROM NEW.inspection_result OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_inspection_report_result_change()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#133', 'CREATE TRIGGER trg_irrh_update AFTER UPDATE ON inspection_reports FOR EACH ROW WHEN (OLD.inspection_result IS DISTINCT FROM NEW.inspection_result OR OLD.status ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#134') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#134';
  EXECUTE $__s__$INSERT INTO inspection_report_result_history
  (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by, source)
SELECT r.id, r.po_line_item_id, r.inspection_type, r.round, NULL, r.status, NULL, r.inspection_result, NULL, r.submitted_at, 'baseline', 'baseline'
FROM inspection_reports r
WHERE NOT EXISTS (SELECT 1 FROM inspection_report_result_history h WHERE h.report_id = r.id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#134', 'INSERT INTO inspection_report_result_history (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#135') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260919_create_inspection_report_result_history.sql#135';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260919_create_inspection_report_result_history.sql#135', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#136') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#136';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS inspection_plan_aborted_log (
  id               bigserial PRIMARY KEY,
  report_id        uuid NOT NULL,
  po_line_item_id  uuid,
  inspection_type  text,
  round            integer,
  result           text NOT NULL DEFAULT 'plan_aborted',
  actor_name       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  source           text NOT NULL DEFAULT 'trigger'
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#136', 'CREATE TABLE IF NOT EXISTS inspection_plan_aborted_log ( id bigserial PRIMARY KEY, report_id uuid NOT NULL, po_line_item_id uuid, inspection_type text, round in', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#137') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#137';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_ipal_line_item ON inspection_plan_aborted_log (po_line_item_id, created_at)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#137', 'CREATE INDEX IF NOT EXISTS idx_ipal_line_item ON inspection_plan_aborted_log (po_line_item_id, created_at)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#138') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#138';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_ipal_report ON inspection_plan_aborted_log (report_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#138', 'CREATE INDEX IF NOT EXISTS idx_ipal_report ON inspection_plan_aborted_log (report_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#139') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#139';
  EXECUTE $__s__$ALTER TABLE inspection_plan_aborted_log ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#139', 'ALTER TABLE inspection_plan_aborted_log ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#140') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#140';
  EXECUTE $__s__$DROP POLICY IF EXISTS ipal_read ON inspection_plan_aborted_log$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#140', 'DROP POLICY IF EXISTS ipal_read ON inspection_plan_aborted_log', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#141') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#141';
  EXECUTE $__s__$CREATE POLICY ipal_read ON inspection_plan_aborted_log FOR SELECT TO authenticated USING (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#141', 'CREATE POLICY ipal_read ON inspection_plan_aborted_log FOR SELECT TO authenticated USING (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#142') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#142';
  EXECUTE $__s__$CREATE OR REPLACE FUNCTION log_inspection_plan_aborted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.status = 'submitted' AND NEW.inspection_result = 'plan_aborted' THEN
      INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name)
      VALUES (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, COALESCE(NEW.updated_by, NEW.created_by, 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#142', 'CREATE OR REPLACE FUNCTION log_inspection_plan_aborted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN BEGIN IF NEW.sta', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#143') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#143';
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_ipal_insert ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#143', 'DROP TRIGGER IF EXISTS trg_ipal_insert ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#144') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#144';
  EXECUTE $__s__$CREATE TRIGGER trg_ipal_insert AFTER INSERT ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION log_inspection_plan_aborted()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#144', 'CREATE TRIGGER trg_ipal_insert AFTER INSERT ON inspection_reports FOR EACH ROW EXECUTE FUNCTION log_inspection_plan_aborted()', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#145') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#145';
  EXECUTE $__s__$DROP TRIGGER IF EXISTS trg_ipal_update ON inspection_reports$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#145', 'DROP TRIGGER IF EXISTS trg_ipal_update ON inspection_reports', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#146') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#146';
  EXECUTE $__s__$CREATE TRIGGER trg_ipal_update AFTER UPDATE ON inspection_reports
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND NEW.inspection_result = 'plan_aborted'
        AND (OLD.status IS DISTINCT FROM 'submitted' OR OLD.inspection_result IS DISTINCT FROM 'plan_aborted'))
  EXECUTE FUNCTION log_inspection_plan_aborted()$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#146', 'CREATE TRIGGER trg_ipal_update AFTER UPDATE ON inspection_reports FOR EACH ROW WHEN (NEW.status = ''submitted'' AND NEW.inspection_result = ''plan_aborted'' AND (OL', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#147') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#147';
  EXECUTE $__s__$INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source)
SELECT r.id, r.po_line_item_id, r.inspection_type, r.round, COALESCE(r.updated_by, r.created_by, 'unknown'),
       COALESCE(r.submitted_at, r.updated_at), 'backfill'
FROM inspection_reports r
WHERE r.status = 'submitted' AND r.inspection_result = 'plan_aborted'
  AND NOT EXISTS (SELECT 1 FROM inspection_plan_aborted_log l WHERE l.report_id = r.id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#147', 'INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source) SELECT r.id, r.po_line_item_id, r.i', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#148') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#148';
  EXECUTE $__s__$INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source)
SELECT DISTINCT ON (h.report_id) h.report_id, h.po_line_item_id, h.inspection_type, h.round,
       CASE WHEN h.changed_by = 'baseline' THEN 'unknown' ELSE h.changed_by END,
       COALESCE(h.new_submitted_at, h.changed_at), 'backfill'
FROM inspection_report_result_history h
WHERE h.new_status = 'submitted' AND h.new_result = 'plan_aborted'
  AND NOT EXISTS (SELECT 1 FROM inspection_plan_aborted_log l WHERE l.report_id = h.report_id)
ORDER BY h.report_id, h.changed_at$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#148', 'INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source) SELECT DISTINCT ON (h.report_id) h.', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#149') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260920_create_inspection_plan_aborted_log.sql#149';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260920_create_inspection_plan_aborted_log.sql#149', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260921_add_kind_to_link_contacts.sql#150') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260921_add_kind_to_link_contacts.sql#150';
  EXECUTE $__s__$ALTER TABLE buyer_supplier_link_contacts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_add_kind_to_link_contacts.sql#150', 'ALTER TABLE buyer_supplier_link_contacts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT ''other''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260921_add_kind_to_link_contacts.sql#151') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260921_add_kind_to_link_contacts.sql#151';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_add_kind_to_link_contacts.sql#151', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#152') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#152';
  EXECUTE $__s__$CREATE TABLE IF NOT EXISTS buyer_supplier_link_contacts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_supplier_link_id  uuid NOT NULL,
  name                    text,
  email                   text NOT NULL,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bslc_unique_email UNIQUE (buyer_supplier_link_id, email)
)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#152', 'CREATE TABLE IF NOT EXISTS buyer_supplier_link_contacts ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_supplier_link_id uuid NOT NULL, name text, email ', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#153') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#153';
  EXECUTE $__s__$CREATE INDEX IF NOT EXISTS idx_bslc_link ON buyer_supplier_link_contacts (buyer_supplier_link_id)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#153', 'CREATE INDEX IF NOT EXISTS idx_bslc_link ON buyer_supplier_link_contacts (buyer_supplier_link_id)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#154') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#154';
  EXECUTE $__s__$ALTER TABLE buyer_supplier_link_contacts ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#154', 'ALTER TABLE buyer_supplier_link_contacts ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#155') THEN RETURN; END IF;
  DELETE FROM _sync_log WHERE step = '20260921_create_buyer_supplier_link_contacts.sql#155';
  EXECUTE $__s__$NOTIFY pgrst, 'reload schema'$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('20260921_create_buyer_supplier_link_contacts.sql#155', 'NOTIFY pgrst, ''reload schema''', SQLERRM);
END $__w__$;


-- ── Row level security for the generated tables ──
DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."buyer_fy_targets" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls buyer_fy_targets', 'ALTER TABLE public."buyer_fy_targets" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_buyer_fy_targets" ON public."buyer_fy_targets" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls buyer_fy_targets', 'CREATE POLICY "authenticated_all_buyer_fy_targets" ON public."buyer_fy_targets" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."material_options" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls material_options', 'ALTER TABLE public."material_options" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_material_options" ON public."material_options" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls material_options', 'CREATE POLICY "authenticated_all_material_options" ON public."material_options" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_admin_audit_log" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_admin_audit_log', 'ALTER TABLE public."npd2_admin_audit_log" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_npd2_admin_audit_log" ON public."npd2_admin_audit_log" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_admin_audit_log', 'CREATE POLICY "authenticated_all_npd2_admin_audit_log" ON public."npd2_admin_audit_log" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_group_guests" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_group_guests', 'ALTER TABLE public."npd2_group_guests" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_npd2_group_guests" ON public."npd2_group_guests" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_group_guests', 'CREATE POLICY "authenticated_all_npd2_group_guests" ON public."npd2_group_guests" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_org_relationships" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_org_relationships', 'ALTER TABLE public."npd2_org_relationships" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_npd2_org_relationships" ON public."npd2_org_relationships" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_org_relationships', 'CREATE POLICY "authenticated_all_npd2_org_relationships" ON public."npd2_org_relationships" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_plm_admins" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_plm_admins', 'ALTER TABLE public."npd2_plm_admins" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_npd2_plm_admins" ON public."npd2_plm_admins" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_plm_admins', 'CREATE POLICY "authenticated_all_npd2_plm_admins" ON public."npd2_plm_admins" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."npd2_workspace_permissions" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_workspace_permissions', 'ALTER TABLE public."npd2_workspace_permissions" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_npd2_workspace_permissions" ON public."npd2_workspace_permissions" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls npd2_workspace_permissions', 'CREATE POLICY "authenticated_all_npd2_workspace_permissions" ON public."npd2_workspace_permissions" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."po_advance_payments" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls po_advance_payments', 'ALTER TABLE public."po_advance_payments" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_po_advance_payments" ON public."po_advance_payments" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls po_advance_payments', 'CREATE POLICY "authenticated_all_po_advance_payments" ON public."po_advance_payments" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."po_quality_claims" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls po_quality_claims', 'ALTER TABLE public."po_quality_claims" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_po_quality_claims" ON public."po_quality_claims" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls po_quality_claims', 'CREATE POLICY "authenticated_all_po_quality_claims" ON public."po_quality_claims" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$ALTER TABLE public."po_shipment_plan_line_items" ENABLE ROW LEVEL SECURITY$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls po_shipment_plan_line_items', 'ALTER TABLE public."po_shipment_plan_line_items" ENABLE ROW LEVEL SECURITY', SQLERRM);
END $__w__$;

DO $__w__$ BEGIN
  EXECUTE $__s__$CREATE POLICY "authenticated_all_po_shipment_plan_line_items" ON public."po_shipment_plan_line_items" FOR ALL TO authenticated USING (true) WITH CHECK (true)$__s__$;
EXCEPTION
  WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR unique_violation THEN NULL;
  WHEN others THEN INSERT INTO _sync_log VALUES ('rls po_shipment_plan_line_items', 'CREATE POLICY "authenticated_all_po_shipment_plan_line_items" ON public."po_shipment_plan_line_items" FOR ALL TO authenticated USING (true) WITH CHECK (true)', SQLERRM);
END $__w__$;


NOTIFY pgrst, 'reload schema';

SELECT * FROM _sync_log;
