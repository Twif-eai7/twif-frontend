-- Final Inspection Report feature. Every SKU (po_line_item) goes through up to
-- 3 fixed inspection stages -- Inline, Midline, Final -- so this is exactly one
-- row per (po_line_item_id, inspection_type), not an open log. Mirrors the
-- existing shipment_legs pattern: FK straight to po_line_items, only the
-- event-specific findings as columns. Everything about the product itself
-- (description, color, base material, dimensions, barcodes, department) is
-- derived from po_line_items -> skus -> categories at render/export time and is
-- intentionally NOT duplicated here. There is no report "header" table: different
-- SKUs on the same PO can be inspected by different people at different times, so
-- there's no genuinely shared document-level data to hold in one.

CREATE SEQUENCE IF NOT EXISTS inspection_report_no_seq;

CREATE TABLE IF NOT EXISTS inspection_reports (
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

  packaging_appearance               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {master_packing:{sample_size,result}, inner_packing:{...}, unit_packing:{...}, shipping_mark:{...}}
  packaging_measurement_findings     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {master:{l,b,h,wt,qty,result}, inner:{...}, unit:{...}} -- findings only; spec comes from skus.master_pack_*/inner_pack_*/length,breadth,height,weight_kg
  barcode_results                    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {master:{result}, inner:{result}, unit:{result}} -- spec comes from skus.item_barcode/inner_pack_barcode/master_pack_barcode
  onsite_tests                       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {dimensional_check:{inspection_level,sample_size,result}, drop_test:{...}, hanging_test:{...}, moisture_content_test:{...}}

  workmanship_inspection_level       text,
  workmanship_sample_size            text,
  aql_critical                       numeric,
  aql_major                          numeric,
  aql_minor                          numeric,
  workmanship_remarks                text,

  remarks                            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["note 1", "note 2", ...]
  attachments                        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, path}]

  vendor_rep_name                    text,
  vendor_rep_signature               text,   -- typed name OR base64 PNG data-URL (SignaturePad convention)
  quality_process_auditor_name       text,
  quality_process_auditor_signature  text,
  quality_resource_name              text,
  quality_resource_signature         text,

  status                             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at                       timestamptz,   -- set when status flips to 'submitted' — the "when was this SKU inspected" audit timestamp
  created_by                         text,
  created_at                         timestamptz DEFAULT now(),
  updated_at                         timestamptz DEFAULT now(),
  UNIQUE (po_line_item_id, inspection_type)
);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_po_line_item_id ON inspection_reports(po_line_item_id);

-- Variable-length workmanship defect grid, attached to one inspection event.
CREATE TABLE IF NOT EXISTS inspection_report_defects (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  defect_description text,
  critical_count     integer NOT NULL DEFAULT 0,
  major_count        integer NOT NULL DEFAULT 0,
  minor_count        integer NOT NULL DEFAULT 0,
  remarks            text,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspection_report_defects_report_id ON inspection_report_defects(report_id);

-- Variable-length "Digitals" photo list, attached to one inspection event.
CREATE TABLE IF NOT EXISTS inspection_report_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption      text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspection_report_photos_report_id ON inspection_report_photos(report_id);

NOTIFY pgrst, 'reload schema';
