-- Inspection Request Form (IRF), brought in-app from the external Google Form.
-- One row per submitted request; submitting also drops a 'requested' row onto
-- inspection_schedules (see 20260806_add_requested_status_to_schedules.sql) so
-- the calendar and the request share a single record instead of being re-keyed.
-- No RLS, matching every other domain table here.

CREATE SEQUENCE IF NOT EXISTS inspection_request_no_seq;

CREATE TABLE IF NOT EXISTS inspection_requests (
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
);
CREATE INDEX IF NOT EXISTS idx_inspection_requests_po_id ON inspection_requests(po_id);

-- Up to 10 PO attachments per request; mirrors the inspection_report_photos
-- child-table pattern rather than a jsonb array, so individual files can be
-- removed/retried without rewriting the parent row.
CREATE TABLE IF NOT EXISTS inspection_request_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_irf_attachments_request_id ON inspection_request_attachments(request_id);

NOTIFY pgrst, 'reload schema';
