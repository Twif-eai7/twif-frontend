// Shared field/section definitions for SKU forms — single source of truth
// for SkuReviewDrawer.jsx (editable) and SkuDetailDrawer.jsx (read-only),
// so the two never drift out of sync. Kept in its own module (not exported
// alongside a component) so Fast Refresh doesn't choke on a non-component
// export living in a component file.
export const FIELD_GROUPS = [
  {
    title: 'Identification',
    fields: [
      ['buyer_sku_ref', 'Buyer SKU Ref'],
      ['vendor_sku_ref', 'Vendor SKU Ref'],
      ['description', 'Description'],
      ['colour', 'Colour'],
    ],
  },
  {
    title: 'Pricing',
    fields: [
      ['base_price', 'Base Price (FOB)'],
    ],
  },
  {
    // Rendered in two columns of 3 — weight/padding/barcode in column one,
    // length/breadth/height in column two (see the sm:grid-flow-col override
    // in SkuReviewDrawer.jsx/SkuDetailDrawer.jsx) — so field order here is
    // column-major, not the read order the labels suggest.
    title: 'Weight & Dimensions',
    fields: [
      ['weight_kg', 'Weight'],
      ['padding_cm', 'Padding'],
      ['item_barcode', 'Barcode'],
      ['length', 'Length'],
      ['breadth', 'Breadth'],
      ['height', 'Height'],
    ],
  },
  {
    // Column-major, same as Weight & Dimensions above: qty/weight/barcode
    // in column one, length/breadth/height in column two.
    title: 'Inner Pack',
    fields: [
      ['inner_pack_qty', 'Qty'],
      ['inner_pack_weight_kg', 'Weight'],
      ['inner_pack_barcode', 'Barcode'],
      ['inner_pack_length', 'Length'],
      ['inner_pack_breadth', 'Breadth'],
      ['inner_pack_height', 'Height'],
    ],
  },
  {
    // Column-major, same as Weight & Dimensions above.
    title: 'Master Pack',
    fields: [
      ['master_pack_qty', 'Qty'],
      ['master_pack_weight_kg', 'Weight'],
      ['master_pack_barcode', 'Barcode'],
      ['master_pack_length', 'Length'],
      ['master_pack_breadth', 'Breadth'],
      ['master_pack_height', 'Height'],
    ],
  },
  {
    title: 'Volume & Container Loading',
    fields: [
      ['item_cbm', 'Item CBM'],
      ['inner_pack_cbm', 'Inner Pack CBM'],
      ['master_pack_cbm', 'Master Carton CBM'],
      ['units_per_20ft', 'Units / 20ft'],
      ['units_per_40ft', 'Units / 40ft'],
      ['units_per_40hq', 'Units / 40HQ'],
    ],
  },
  {
    title: 'Packing',
    fields: [['packing_material', 'Packing Material']],
  },
]
