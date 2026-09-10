import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const BRAND = [41, 37, 36]     // stone-800
const HEAD_BG = [231, 229, 228] // stone-200
const DASH = '-'

const clean = v => {
  const s = v == null ? '' : String(v).trim()
  return s || DASH
}

/**
 * Sections shown in both the on-screen preview and the PDF, so the two
 * always match. `data` = { form, categoryNames, isVendorEntrance, email, role }.
 */
export function buildApplicationSections({ form, categoryNames = [], isVendorEntrance, email, role }) {
  const isSupplier = role === 'supplier'

  const sections = [
    {
      title: 'Applicant',
      rows: [
        ['Full name', form.fullName],
        ['Email', email || form.orgEmail],
        ['Phone', form.phone],
        ['Title / Role', form.titleRole],
        ['Country', form.country],
      ],
    },
    {
      title: 'Organisation',
      rows: [
        ['Company name', form.businessName],
        ['Website', form.website],
        ['Employees', form.employees],
        ['Business type', form.supplierType === 'Others' ? form.supplierTypeOther : form.supplierType],
        ['Address', form.address],
        ['Pincode', form.pincode],
      ],
    },
    ...(isSupplier ? [{
      title: 'KYC Docs',
      rows: [
        ['GST / Tax No.', form.registration],
        ['Registration / CIN No.', form.cin],
        ['Udyam / MSME No.', form.udyam],
        [isVendorEntrance ? 'IEC Code' : 'ISI code', isVendorEntrance ? form.iec : form.isi],
        ...(isVendorEntrance ? [] : [['MSME No.', form.msme]]),
        ['Swift/Bank account number', form.bankAccountNumber],
        ['SWIFT/BIC/IFSC Code', form.bankIfsc],
        ['Vendor logo', form.logoUrl],
      ],
    }, {
      title: 'Owner / Director',
      rows: [
        ['Name', form.ownerName],
        ['Phone', form.ownerPhone],
        ['Email', form.ownerEmail],
      ],
    }] : []),
    {
      title: 'Product Categories',
      rows: [['Selected', categoryNames.length ? categoryNames.join(', ') : '']],
    },
    ...(isSupplier ? [{
      title: 'Agreement',
      rows: [
        ['NDA accepted', 'Yes'],
        [
          'Signed by',
          form.signatureMode === 'type' ? form.ndaSignatureName : 'Signature image on file',
        ],
        [
          'Date',
          new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        ],
      ],
    }] : []),
  ]

  return sections.map(s => ({
    title: s.title,
    rows: s.rows.map(([label, value]) => [label, clean(value)]),
  }))
}

export function downloadApplicationPdf(data) {
  const { form } = data
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
  doc.text('eai7 Portal - Vendor Application', M, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, M, y)
  y += 4
  doc.text('Submitted for review. This is a copy for your records.', M, y)
  y += 6

  for (const section of buildApplicationSections(data)) {
    autoTable(doc, {
      startY: y,
      head: [[section.title, '']],
      body: section.rows,
      theme: 'grid',
      headStyles: { fillColor: HEAD_BG, textColor: BRAND, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: 40 },
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      margin: { left: M, right: M },
    })
    y = doc.lastAutoTable.finalY + 5
  }

  const hasSigImg = form.ndaSignatureImage &&
    (form.signatureMode === 'draw' || form.signatureMode === 'upload')
  if (hasSigImg) {
    if (y > 250) { doc.addPage(); y = 18 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
    doc.text('Signature', M, y)
    y += 3
    try {
      doc.addImage(form.ndaSignatureImage, 'PNG', M, y, 60, 24)
    } catch {
      // Unsupported data URL - skip the image, the rest of the PDF is fine.
    }
  }

  const slug = (form.businessName || 'vendor').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  doc.save(`twif-vendor-application-${slug || 'vendor'}.pdf`)
}
