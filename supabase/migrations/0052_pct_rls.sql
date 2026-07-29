-- PCT Row Level Security policies

CREATE OR REPLACE FUNCTION pct_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION pct_is_merchant_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid() AND o.type = 'merchant'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Can user access this po_line_item? (via buyer_supplier_links OR pct_lines org)
CREATE OR REPLACE FUNCTION po_line_item_accessible(p_line_item_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM po_line_items li
    LEFT JOIN purchase_orders po ON po.id = li.po_id
    LEFT JOIN buyer_supplier_links bsl ON bsl.id = po.buyer_supplier_link_id
    LEFT JOIN pct_lines pl ON pl.po_line_item_id = li.id
    WHERE li.id = p_line_item_id
      AND (
        pct_is_merchant_user()
        OR bsl.buyer_org_id    IN (SELECT pct_user_org_ids())
        OR bsl.supplier_org_id IN (SELECT pct_user_org_ids())
        OR pl.buyer_org_id     IN (SELECT pct_user_org_ids())
        OR pl.supplier_org_id  IN (SELECT pct_user_org_ids())
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── pct_lines ───────────────────────────────────────────────
ALTER TABLE pct_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pct_lines_select ON pct_lines;
CREATE POLICY pct_lines_select ON pct_lines FOR SELECT USING (
  buyer_org_id    IN (SELECT pct_user_org_ids()) OR
  supplier_org_id IN (SELECT pct_user_org_ids()) OR
  pct_is_merchant_user()
);

DROP POLICY IF EXISTS pct_lines_insert ON pct_lines;
CREATE POLICY pct_lines_insert ON pct_lines FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS pct_lines_update ON pct_lines;
CREATE POLICY pct_lines_update ON pct_lines FOR UPDATE USING (
  buyer_org_id    IN (SELECT pct_user_org_ids()) OR
  supplier_org_id IN (SELECT pct_user_org_ids()) OR
  pct_is_merchant_user()
);

-- ── pct_po_headers ──────────────────────────────────────────
ALTER TABLE pct_po_headers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pct_po_headers_select ON pct_po_headers;
CREATE POLICY pct_po_headers_select ON pct_po_headers FOR SELECT USING (
  buyer_org_id    IN (SELECT pct_user_org_ids()) OR
  supplier_org_id IN (SELECT pct_user_org_ids()) OR
  pct_is_merchant_user()
);

DROP POLICY IF EXISTS pct_po_headers_insert ON pct_po_headers;
CREATE POLICY pct_po_headers_insert ON pct_po_headers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS pct_po_headers_update ON pct_po_headers;
CREATE POLICY pct_po_headers_update ON pct_po_headers FOR UPDATE USING (
  buyer_org_id    IN (SELECT pct_user_org_ids()) OR
  supplier_org_id IN (SELECT pct_user_org_ids()) OR
  pct_is_merchant_user()
);

-- ── po_stage_* (per po_line_item) ───────────────────────────
ALTER TABLE po_stage_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_stage_checks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_stage_alert_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_stage_progress_select ON po_stage_progress;
CREATE POLICY po_stage_progress_select ON po_stage_progress FOR SELECT
  USING (po_line_item_accessible(po_line_item_id));

DROP POLICY IF EXISTS po_stage_progress_update ON po_stage_progress;
CREATE POLICY po_stage_progress_update ON po_stage_progress FOR UPDATE
  USING (po_line_item_accessible(po_line_item_id));

DROP POLICY IF EXISTS po_stage_checks_select ON po_stage_checks;
CREATE POLICY po_stage_checks_select ON po_stage_checks FOR SELECT
  USING (po_line_item_accessible(po_line_item_id));

DROP POLICY IF EXISTS po_stage_checks_update ON po_stage_checks;
CREATE POLICY po_stage_checks_update ON po_stage_checks FOR UPDATE
  USING (po_line_item_accessible(po_line_item_id));

DROP POLICY IF EXISTS po_stage_alert_checks_select ON po_stage_alert_checks;
CREATE POLICY po_stage_alert_checks_select ON po_stage_alert_checks FOR SELECT
  USING (po_line_item_accessible(po_line_item_id));

DROP POLICY IF EXISTS po_stage_alert_checks_update ON po_stage_alert_checks;
CREATE POLICY po_stage_alert_checks_update ON po_stage_alert_checks FOR UPDATE
  USING (po_line_item_accessible(po_line_item_id));

-- ── Other pct child tables ──────────────────────────────────
ALTER TABLE pct_activity           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pct_attachments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pct_inline_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pct_tab_checks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pct_exception_checks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pct_handoff_failures   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pct_activity_select ON pct_activity;
CREATE POLICY pct_activity_select ON pct_activity FOR SELECT
  USING (
    (pct_line_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM pct_lines l WHERE l.id = pct_line_id AND (
        l.buyer_org_id IN (SELECT pct_user_org_ids()) OR
        l.supplier_org_id IN (SELECT pct_user_org_ids()) OR pct_is_merchant_user()))
    )
    OR (po_line_item_id IS NOT NULL AND po_line_item_accessible(po_line_item_id))
    OR (pct_line_id IS NULL AND po_line_item_id IS NULL)
  );

DROP POLICY IF EXISTS pct_activity_insert ON pct_activity;
CREATE POLICY pct_activity_insert ON pct_activity FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS pct_attachments_select ON pct_attachments;
CREATE POLICY pct_attachments_select ON pct_attachments FOR SELECT
  USING (
    (pct_line_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM pct_lines l WHERE l.id = pct_line_id AND (
        l.buyer_org_id IN (SELECT pct_user_org_ids()) OR
        l.supplier_org_id IN (SELECT pct_user_org_ids()) OR pct_is_merchant_user()))
    )
    OR (po_line_item_id IS NOT NULL AND po_line_item_accessible(po_line_item_id))
  );

DROP POLICY IF EXISTS pct_attachments_insert ON pct_attachments;
CREATE POLICY pct_attachments_insert ON pct_attachments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS pct_inline_inspections_select ON pct_inline_inspections;
CREATE POLICY pct_inline_inspections_select ON pct_inline_inspections FOR SELECT
  USING (
    (pct_line_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM pct_lines l WHERE l.id = pct_line_id AND (
        l.buyer_org_id IN (SELECT pct_user_org_ids()) OR
        l.supplier_org_id IN (SELECT pct_user_org_ids()) OR pct_is_merchant_user()))
    )
    OR (po_line_item_id IS NOT NULL AND po_line_item_accessible(po_line_item_id))
  );

DROP POLICY IF EXISTS pct_inline_inspections_insert ON pct_inline_inspections;
CREATE POLICY pct_inline_inspections_insert ON pct_inline_inspections FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS pct_tab_checks_select ON pct_tab_checks;
CREATE POLICY pct_tab_checks_select ON pct_tab_checks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pct_lines l WHERE l.po_number = pct_tab_checks.po_number AND (
      l.buyer_org_id IN (SELECT pct_user_org_ids()) OR
      l.supplier_org_id IN (SELECT pct_user_org_ids()) OR pct_is_merchant_user())
  ));

DROP POLICY IF EXISTS pct_tab_checks_update ON pct_tab_checks;
CREATE POLICY pct_tab_checks_update ON pct_tab_checks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM pct_lines l WHERE l.po_number = pct_tab_checks.po_number AND (
      l.buyer_org_id IN (SELECT pct_user_org_ids()) OR
      l.supplier_org_id IN (SELECT pct_user_org_ids()) OR pct_is_merchant_user())
  ));

DROP POLICY IF EXISTS pct_exception_checks_select ON pct_exception_checks;
CREATE POLICY pct_exception_checks_select ON pct_exception_checks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pct_lines l WHERE l.po_number = pct_exception_checks.po_number AND (
      l.buyer_org_id IN (SELECT pct_user_org_ids()) OR
      l.supplier_org_id IN (SELECT pct_user_org_ids()) OR pct_is_merchant_user())
  ));

DROP POLICY IF EXISTS pct_exception_checks_update ON pct_exception_checks;
CREATE POLICY pct_exception_checks_update ON pct_exception_checks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM pct_lines l WHERE l.po_number = pct_exception_checks.po_number AND (
      l.buyer_org_id IN (SELECT pct_user_org_ids()) OR
      l.supplier_org_id IN (SELECT pct_user_org_ids()) OR pct_is_merchant_user())
  ));

DROP POLICY IF EXISTS pct_handoff_failures_select ON pct_handoff_failures;
CREATE POLICY pct_handoff_failures_select ON pct_handoff_failures FOR SELECT
  USING (pct_is_merchant_user());

DROP POLICY IF EXISTS pct_handoff_failures_insert ON pct_handoff_failures;
CREATE POLICY pct_handoff_failures_insert ON pct_handoff_failures FOR INSERT WITH CHECK (true);
