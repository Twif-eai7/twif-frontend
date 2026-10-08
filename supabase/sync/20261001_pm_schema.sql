-- ═══════════════════════════════════════════════════════════════════════════
-- PM (Project Management) Schema — Phase 1
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS throughout).
--
-- Structure:
--   PART A — Create all 16 tables + indexes
--   PART B — Enable RLS on every table
--   PART C — service_role bypass policies (no cross-table refs, safe anywhere)
--   PART D — authenticated member-read policies (all tables exist by now)
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- PART A — TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. pm_projects ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_projects (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  text NOT NULL,
  description            text,
  type                   text NOT NULL DEFAULT 'general',
  status                 text NOT NULL DEFAULT 'active',
  buyer_org_id           uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  merchant_org_id        uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  supplier_org_id        uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  buyer_supplier_link_id uuid REFERENCES public.buyer_supplier_links(id) ON DELETE SET NULL,
  created_by_member_id   uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  due_date               date,
  color                  text NOT NULL DEFAULT '#4d68f0',
  emoji                  text NOT NULL DEFAULT '📋',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── 2. pm_project_members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_project_members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  member_id             uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  role                  text NOT NULL DEFAULT 'editor',
  invited_by_member_id  uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, member_id)
);

-- ── 3. pm_boards ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_boards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'Main Board',
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 4. pm_columns ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    uuid NOT NULL REFERENCES public.pm_boards(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  color       text NOT NULL DEFAULT '#94a3b8',
  wip_limit   integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 5. pm_tasks ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_tasks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  board_id               uuid NOT NULL REFERENCES public.pm_boards(id) ON DELETE CASCADE,
  column_id              uuid NOT NULL REFERENCES public.pm_columns(id) ON DELETE CASCADE,
  title                  text NOT NULL,
  description            text,
  priority               text NOT NULL DEFAULT 'normal',
  position               numeric NOT NULL DEFAULT 0,
  due_date               timestamptz,
  estimate_hours         numeric,
  labels                 text[] NOT NULL DEFAULT '{}',
  linked_po_id           uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  linked_workspace_id    uuid REFERENCES public.npd2_workspaces(id) ON DELETE SET NULL,
  linked_inspection_id   uuid,
  linked_pct_stage       text,
  recurrence_rule        text,
  recurrence_parent_id   uuid REFERENCES public.pm_tasks(id) ON DELETE SET NULL,
  created_by_member_id   uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  deleted_at             timestamptz
);

CREATE INDEX IF NOT EXISTS pm_tasks_project_col_idx ON public.pm_tasks(project_id, column_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pm_tasks_board_idx       ON public.pm_tasks(board_id)               WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pm_tasks_due_date_idx    ON public.pm_tasks(due_date)               WHERE deleted_at IS NULL;

-- ── 6. pm_task_assignees ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_task_assignees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id               uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  member_id             uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  assigned_by_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, member_id)
);

CREATE INDEX IF NOT EXISTS pm_task_assignees_task_idx   ON public.pm_task_assignees(task_id);
CREATE INDEX IF NOT EXISTS pm_task_assignees_member_idx ON public.pm_task_assignees(member_id);

-- ── 7. pm_checklists ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_checklists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  title       text NOT NULL,
  checked     boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_checklists_task_idx ON public.pm_checklists(task_id);

-- ── 8. pm_comments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  author_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  body             text NOT NULL,
  attachments      jsonb NOT NULL DEFAULT '[]',
  mentions         uuid[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS pm_comments_task_idx ON public.pm_comments(task_id) WHERE deleted_at IS NULL;

-- ── 9. pm_task_attachments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_task_attachments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  uploader_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  file_name          text NOT NULL,
  file_url           text NOT NULL,
  storage_path       text NOT NULL,
  file_size          integer,
  mime_type          text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ── 10. pm_activity_log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_activity_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  task_id         uuid REFERENCES public.pm_tasks(id) ON DELETE SET NULL,
  actor_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  action          text NOT NULL,
  meta            jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_activity_log_task_idx    ON public.pm_activity_log(task_id,    created_at DESC);
CREATE INDEX IF NOT EXISTS pm_activity_log_project_idx ON public.pm_activity_log(project_id, created_at DESC);

-- ── 11. pm_task_reminders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_task_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  offset_minutes  integer NOT NULL,
  channel         text NOT NULL DEFAULT 'both',
  sent_at         timestamptz,
  snoozed_until   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, member_id, offset_minutes)
);

CREATE INDEX IF NOT EXISTS pm_task_reminders_unsent_idx ON public.pm_task_reminders(sent_at, task_id) WHERE sent_at IS NULL;

-- ── 12. pm_notifications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  task_id       uuid REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  type          text NOT NULL,
  title         text NOT NULL,
  body          text,
  read          boolean NOT NULL DEFAULT false,
  snoozed_until timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_notifications_member_idx ON public.pm_notifications(member_id, read, created_at DESC);

-- ── 13. pm_notification_preferences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_notification_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE UNIQUE,
  preferences jsonb NOT NULL DEFAULT '{
    "email_1_day_before":   true,
    "email_1_hour_before":  true,
    "inapp_30_min_before":  true,
    "browser_push":         false,
    "on_assigned":          true,
    "on_mentioned":         true,
    "on_status_changed":    true,
    "daily_digest":         false
  }',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 14. pm_task_dependencies ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_task_dependencies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocking_task_id     uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  blocked_task_id      uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  created_by_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocking_task_id, blocked_task_id)
);

-- ── 15. pm_time_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_time_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  member_id    uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  logged_hours numeric NOT NULL,
  note         text,
  logged_at    date NOT NULL DEFAULT CURRENT_DATE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 16. pm_saved_filters ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pm_saved_filters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  member_id   uuid REFERENCES public.organization_members(id) ON DELETE CASCADE,
  name        text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- PART B — ENABLE RLS ON ALL TABLES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pm_projects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_project_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_boards                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_columns                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_tasks                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_assignees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_checklists                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_comments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_attachments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_activity_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_reminders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_dependencies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_time_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_saved_filters             ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART C — SERVICE_ROLE BYPASS POLICIES (no cross-table refs)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_projects' AND policyname='pm_projects_service_all') THEN
    CREATE POLICY pm_projects_service_all ON public.pm_projects FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_project_members' AND policyname='pm_project_members_service_all') THEN
    CREATE POLICY pm_project_members_service_all ON public.pm_project_members FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_boards' AND policyname='pm_boards_service_all') THEN
    CREATE POLICY pm_boards_service_all ON public.pm_boards FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_columns' AND policyname='pm_columns_service_all') THEN
    CREATE POLICY pm_columns_service_all ON public.pm_columns FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_tasks' AND policyname='pm_tasks_service_all') THEN
    CREATE POLICY pm_tasks_service_all ON public.pm_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_task_assignees' AND policyname='pm_task_assignees_service_all') THEN
    CREATE POLICY pm_task_assignees_service_all ON public.pm_task_assignees FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_checklists' AND policyname='pm_checklists_service_all') THEN
    CREATE POLICY pm_checklists_service_all ON public.pm_checklists FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_comments' AND policyname='pm_comments_service_all') THEN
    CREATE POLICY pm_comments_service_all ON public.pm_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_task_attachments' AND policyname='pm_task_attachments_service_all') THEN
    CREATE POLICY pm_task_attachments_service_all ON public.pm_task_attachments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_activity_log' AND policyname='pm_activity_log_service_all') THEN
    CREATE POLICY pm_activity_log_service_all ON public.pm_activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_task_reminders' AND policyname='pm_task_reminders_service_all') THEN
    CREATE POLICY pm_task_reminders_service_all ON public.pm_task_reminders FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_notifications' AND policyname='pm_notifications_service_all') THEN
    CREATE POLICY pm_notifications_service_all ON public.pm_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_notification_preferences' AND policyname='pm_notification_preferences_service_all') THEN
    CREATE POLICY pm_notification_preferences_service_all ON public.pm_notification_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_task_dependencies' AND policyname='pm_task_dependencies_service_all') THEN
    CREATE POLICY pm_task_dependencies_service_all ON public.pm_task_dependencies FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_time_logs' AND policyname='pm_time_logs_service_all') THEN
    CREATE POLICY pm_time_logs_service_all ON public.pm_time_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_saved_filters' AND policyname='pm_saved_filters_service_all') THEN
    CREATE POLICY pm_saved_filters_service_all ON public.pm_saved_filters FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART D — AUTHENTICATED MEMBER-READ POLICIES
-- All tables exist by this point — no forward-reference errors.
-- ═══════════════════════════════════════════════════════════════════════════

-- pm_projects: visible to project members OR merchant admin/tech
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_projects' AND policyname='pm_projects_member_read') THEN
    CREATE POLICY pm_projects_member_read ON public.pm_projects
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.pm_project_members ppm
          JOIN public.organization_members om ON om.id = ppm.member_id
          WHERE ppm.project_id = pm_projects.id
            AND om.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.organization_members om
          JOIN public.organizations o ON o.id = om.organization_id
          WHERE om.user_id = auth.uid()
            AND o.type = 'merchant'
            AND om.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;

-- pm_project_members: visible to other members of the same project
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_project_members' AND policyname='pm_project_members_member_read') THEN
    CREATE POLICY pm_project_members_member_read ON public.pm_project_members
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.pm_project_members ppm2
          JOIN public.organization_members om ON om.id = ppm2.member_id
          WHERE ppm2.project_id = pm_project_members.project_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- pm_boards: visible to project members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_boards' AND policyname='pm_boards_member_read') THEN
    CREATE POLICY pm_boards_member_read ON public.pm_boards
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.pm_project_members ppm
          JOIN public.organization_members om ON om.id = ppm.member_id
          WHERE ppm.project_id = pm_boards.project_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- pm_columns: visible to project members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_columns' AND policyname='pm_columns_member_read') THEN
    CREATE POLICY pm_columns_member_read ON public.pm_columns
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.pm_project_members ppm
          JOIN public.organization_members om ON om.id = ppm.member_id
          WHERE ppm.project_id = pm_columns.project_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- pm_tasks: visible to project members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_tasks' AND policyname='pm_tasks_member_read') THEN
    CREATE POLICY pm_tasks_member_read ON public.pm_tasks
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.pm_project_members ppm
          JOIN public.organization_members om ON om.id = ppm.member_id
          WHERE ppm.project_id = pm_tasks.project_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- pm_task_assignees: visible to project members (via task → project)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_task_assignees' AND policyname='pm_task_assignees_member_read') THEN
    CREATE POLICY pm_task_assignees_member_read ON public.pm_task_assignees
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.pm_tasks t
          JOIN public.pm_project_members ppm ON ppm.project_id = t.project_id
          JOIN public.organization_members om ON om.id = ppm.member_id
          WHERE t.id = pm_task_assignees.task_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- pm_notifications: each member sees only their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pm_notifications' AND policyname='pm_notifications_own') THEN
    CREATE POLICY pm_notifications_own ON public.pm_notifications
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.id = pm_notifications.member_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;


-- ── Reload PostgREST schema cache ────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
