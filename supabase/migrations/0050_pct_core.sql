-- PCT (Production Control Tower) core tables
-- Migration order: headers → lines → po_stage_* (per po_line_item) → other child tables → FKs
--
-- Stage workflow (10 stages, mandatory checks, alert checks) is stored per po_line_items row.
-- pct_lines links PLM workspace handoff → po_line_items after Sample PO.

-- 1. PO headers (groups SKU lines under a commercial PO number)
CREATE TABLE IF NOT EXISTS pct_po_headers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number          TEXT,
  purchase_order_id  UUID REFERENCES purchase_orders(id),
  buyer_org_id       UUID NOT NULL,
  supplier_org_id    UUID NOT NULL,
  merchant_member_id UUID,
  status             TEXT NOT NULL DEFAULT 'open',  -- open | locked | closed
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (po_number, buyer_org_id, supplier_org_id)
);

-- 2. PCT lines (one row per PLM workspace / SKU — handoff from PLM)
CREATE TABLE IF NOT EXISTS pct_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL UNIQUE,
  catalog_sku_id      UUID,
  sample_order_id     UUID,
  pct_po_header_id    UUID REFERENCES pct_po_headers(id),
  purchase_order_id   UUID REFERENCES purchase_orders(id),
  production_sku_id   UUID,
  po_line_item_id     UUID,  -- FK added after po_line_items exists in same DB

  po_number           TEXT,
  sku_code            TEXT NOT NULL,
  buyer_ref           TEXT,
  vendor_name         TEXT,
  buyer_org_id        UUID NOT NULL,
  supplier_org_id     UUID NOT NULL,
  owner_member_id     UUID,

  current_stage_id    TEXT NOT NULL DEFAULT 'po',
  stage_status        TEXT NOT NULL DEFAULT 'active',
  line_status         TEXT NOT NULL DEFAULT 'active',  -- active | paused | closed | archived
  risk                TEXT NOT NULL DEFAULT 'Low',
  claim               TEXT,
  exf_date            DATE,
  delay_days          INT,
  owner_display       TEXT DEFAULT 'Merchant',

  plm_snapshot        JSONB NOT NULL DEFAULT '{}',
  source              TEXT NOT NULL DEFAULT 'plm_approve_to_sample',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pct_lines_po_number      ON pct_lines(po_number);
CREATE INDEX IF NOT EXISTS idx_pct_lines_stage          ON pct_lines(current_stage_id, stage_status);
CREATE INDEX IF NOT EXISTS idx_pct_lines_buyer          ON pct_lines(buyer_org_id);
CREATE INDEX IF NOT EXISTS idx_pct_lines_supplier       ON pct_lines(supplier_org_id);
CREATE INDEX IF NOT EXISTS idx_pct_lines_workspace      ON pct_lines(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pct_lines_po_line_item   ON pct_lines(po_line_item_id);

-- 3. Stage workflow per po_line_items (Stage 1 checks live here)
CREATE TABLE IF NOT EXISTS po_stage_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_item_id UUID NOT NULL REFERENCES po_line_items(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | active | completed
  completed_at    TIMESTAMPTZ,
  completed_by    UUID,
  UNIQUE (po_line_item_id, stage_id)
);

CREATE TABLE IF NOT EXISTS po_stage_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_item_id UUID NOT NULL REFERENCES po_line_items(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL,
  check_index     INT NOT NULL,
  label           TEXT NOT NULL,
  done            BOOLEAN NOT NULL DEFAULT false,
  done_by         TEXT,
  done_at         TIMESTAMPTZ,
  UNIQUE (po_line_item_id, stage_id, check_index)
);

CREATE TABLE IF NOT EXISTS po_stage_alert_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_item_id UUID NOT NULL REFERENCES po_line_items(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL,
  alert_index     INT NOT NULL,
  check_index     INT NOT NULL,
  label           TEXT NOT NULL,
  requires_file   BOOLEAN NOT NULL DEFAULT false,
  done            BOOLEAN NOT NULL DEFAULT false,
  done_by         TEXT,
  done_at         TIMESTAMPTZ,
  file_name       TEXT,
  file_url        TEXT,
  UNIQUE (po_line_item_id, stage_id, alert_index, check_index)
);

CREATE INDEX IF NOT EXISTS idx_po_stage_progress_line ON po_stage_progress(po_line_item_id);
CREATE INDEX IF NOT EXISTS idx_po_stage_checks_line   ON po_stage_checks(po_line_item_id);
CREATE INDEX IF NOT EXISTS idx_po_stage_alerts_line   ON po_stage_alert_checks(po_line_item_id);

-- 4. Other PCT child tables
CREATE TABLE IF NOT EXISTS pct_exception_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number   TEXT NOT NULL,
  card_index  INT NOT NULL,
  point_index INT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT false,
  done_by     TEXT,
  done_at     TIMESTAMPTZ,
  UNIQUE (po_number, card_index, point_index)
);

CREATE TABLE IF NOT EXISTS pct_tab_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_key     TEXT NOT NULL,
  po_number   TEXT NOT NULL,
  check_index INT NOT NULL,
  label       TEXT,
  done        BOOLEAN NOT NULL DEFAULT false,
  done_by     TEXT,
  done_at     TIMESTAMPTZ,
  UNIQUE (tab_key, po_number, check_index)
);

CREATE TABLE IF NOT EXISTS pct_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pct_line_id     UUID REFERENCES pct_lines(id) ON DELETE CASCADE,
  po_line_item_id UUID REFERENCES po_line_items(id) ON DELETE CASCADE,
  stage_id        TEXT,
  alert_index     INT,
  check_index     INT,
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  public_url      TEXT,
  uploaded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pct_attachments_line_ref CHECK (pct_line_id IS NOT NULL OR po_line_item_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pct_attachments_pct_line ON pct_attachments(pct_line_id);
CREATE INDEX IF NOT EXISTS idx_pct_attachments_po_line  ON pct_attachments(po_line_item_id);

CREATE TABLE IF NOT EXISTS pct_inline_inspections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pct_line_id     UUID REFERENCES pct_lines(id) ON DELETE CASCADE,
  po_line_item_id UUID REFERENCES po_line_items(id) ON DELETE CASCADE,
  attachment_id   UUID REFERENCES pct_attachments(id) ON DELETE SET NULL,
  file_name       TEXT NOT NULL,
  file_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pct_inline_line_ref CHECK (pct_line_id IS NOT NULL OR po_line_item_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS pct_activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pct_line_id     UUID REFERENCES pct_lines(id) ON DELETE SET NULL,
  po_line_item_id UUID REFERENCES po_line_items(id) ON DELETE SET NULL,
  po_number       TEXT,
  sku_code        TEXT,
  role            TEXT NOT NULL,
  actor_name      TEXT,
  body            TEXT NOT NULL,
  system_kind     TEXT,
  attachment      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pct_activity_pct_line ON pct_activity(pct_line_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pct_activity_po_line  ON pct_activity(po_line_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pct_activity_po       ON pct_activity(po_number, created_at DESC);

CREATE TABLE IF NOT EXISTS pct_handoff_failures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID,
  event_type    TEXT,
  error_message TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Foreign keys to npd2 + po_line_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pct_lines_workspace') THEN
    ALTER TABLE pct_lines
      ADD CONSTRAINT fk_pct_lines_workspace
        FOREIGN KEY (workspace_id) REFERENCES npd2_workspaces(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pct_lines_catalog_sku') THEN
    ALTER TABLE pct_lines
      ADD CONSTRAINT fk_pct_lines_catalog_sku
        FOREIGN KEY (catalog_sku_id) REFERENCES npd2_catalog_skus(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pct_lines_sample_order') THEN
    ALTER TABLE pct_lines
      ADD CONSTRAINT fk_pct_lines_sample_order
        FOREIGN KEY (sample_order_id) REFERENCES npd2_sample_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pct_lines_po_line_item') THEN
    ALTER TABLE pct_lines
      ADD CONSTRAINT fk_pct_lines_po_line_item
        FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id) ON DELETE SET NULL;
  END IF;
END $$;
