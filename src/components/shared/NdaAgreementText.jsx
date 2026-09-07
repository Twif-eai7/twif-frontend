const BOX = 'max-h-64 overflow-y-auto text-xs text-stone-600 leading-relaxed border border-stone-200 rounded-xl p-4 bg-stone-50'

/**
 * The full Master NDA / Non-Circumvention / Non-Solicitation agreement text.
 * Shared by the onboarding Agreement tab and the application review modal so
 * both show the exact document the vendor signs.
 */
export default function NdaAgreementText({ businessName, address, className }) {
  const effectiveDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className={className || BOX}>
      <p className="text-sm font-bold text-stone-900 mb-1">
        MASTER NON-DISCLOSURE, NON-CIRCUMVENTION &amp; NON-SOLICITATION AGREEMENT
      </p>
      <p className="font-semibold text-stone-700 mb-3">(Vendor Confidentiality &amp; Business Protection Agreement)</p>

      <p className="mb-3">
        <strong>This Agreement</strong> is entered into on{' '}
        <strong>{effectiveDate}</strong>{' '}
        ("Effective Date")
      </p>

      <p className="font-bold text-stone-900 mb-1">BETWEEN</p>
      <p className="mb-3">
        <strong>Twif Technologies PTE LTD</strong>, having its headquarters in Singapore and a hub office in Bengaluru, India (hereinafter referred to as <strong>"Twif"</strong>, which
        expression shall include its successors, affiliates and permitted assigns);
      </p>

      <p className="mb-1">AND</p>
      <p className="mb-1">
        <strong>Vendor Name:</strong> {businessName || '____________________'}
      </p>
      <p className="mb-3">
        <strong>Address:</strong> {address || '____________________'}
      </p>
      <p className="mb-3">
        (hereinafter referred to as the <strong>"Vendor"</strong>).
        Twif and the Vendor shall collectively be referred to as the <strong>"Parties"</strong>.
      </p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">1. PURPOSE</p>
      <p className="mb-3">
        The Vendor shall manufacture, develop, source, sample, inspect, package, or otherwise
        provide products and services for buyers introduced by Twif. During this relationship, the
        Vendor will have access to confidential commercial, technical and proprietary information
        belonging to Twif and/or its customers. The purpose of this Agreement is to protect Twif's
        intellectual property, trade secrets, customer relationships and proprietary business
        information.
      </p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">2. CONFIDENTIAL INFORMATION</p>
      <p className="mb-1">Confidential Information shall include but not be limited to:</p>
      <ul className="list-disc pl-5 mb-3 space-y-0.5">
        <li>Buyer names and identities</li>
        <li>Buyer contacts</li>
        <li>Product developments</li>
        <li>Designs</li>
        <li>CAD drawings</li>
        <li>Sketches</li>
        <li>Technical drawings</li>
        <li>Samples</li>
        <li>Tooling</li>
        <li>Moulds</li>
        <li>Artwork</li>
        <li>Packaging</li>
        <li>Product specifications</li>
        <li>Bill of Materials (BOM)</li>
        <li>Cost sheets</li>
        <li>Quotations</li>
        <li>Purchase Orders</li>
        <li>Vendor Scorecards</li>
        <li>Quality reports</li>
        <li>Test reports</li>
        <li>Compliance documents</li>
        <li>Product photographs</li>
        <li>Merchandising documents</li>
        <li>PLM Data</li>
        <li>PCT Data</li>
        <li>ERP Data</li>
        <li>Buyer Portal information</li>
        <li>Vendor Portal information</li>
        <li>AI-generated outputs</li>
        <li>Trade intelligence</li>
        <li>Market research</li>
        <li>Dashboards</li>
        <li>Pricing models</li>
        <li>Business methodologies</li>
        <li>Customer strategies</li>
        <li>Forecasts</li>
        <li>Financial information</li>
      </ul>
      <p className="mb-3">Whether oral, written, electronic or visual.</p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">3. CONFIDENTIALITY OBLIGATIONS</p>
      <p className="mb-1">The Vendor agrees that it shall:</p>
      <ul className="list-disc pl-5 mb-3 space-y-0.5">
        <li>Keep all information strictly confidential.</li>
        <li>Use information solely for executing Twif business.</li>
        <li>Not disclose information to any third party.</li>
        <li>Restrict access only to authorized personnel.</li>
        <li>Ensure employees are equally bound by confidentiality obligations.</li>
      </ul>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">4. NON-CIRCUMVENTION</p>
      <p className="mb-1">
        The Vendor expressly agrees that during the business relationship and for five (5) years
        thereafter, it shall not directly or indirectly:
      </p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Contact any buyer introduced by Twif.</li>
        <li>Solicit direct business from any Twif buyer.</li>
        <li>Quote directly.</li>
        <li>Supply directly.</li>
        <li>Negotiate directly.</li>
        <li>Accept RFQs.</li>
        <li>Participate in tenders.</li>
        <li>Create commercial relationships.</li>
        <li>Divert business away from Twif introduced clients.</li>
      </ul>
      <p className="mb-1">This restriction applies irrespective of whether:</p>
      <ul className="list-disc pl-5 mb-3 space-y-0.5">
        <li>orders are currently active;</li>
        <li>sampling has commenced; or</li>
        <li>discussions are ongoing.</li>
      </ul>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">5. BUYER EXCLUSIVE DESIGNS</p>
      <p className="mb-1">The Vendor agrees that all buyer developments remain confidential. Accordingly, the Vendor shall not:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Show buyer developments to any other customer.</li>
        <li>Sell similar products to competitors.</li>
        <li>Use photographs for marketing.</li>
        <li>Display products in showrooms.</li>
        <li>Display products at exhibitions.</li>
        <li>Upload products on websites.</li>
        <li>Upload products on social media.</li>
        <li>Include products in catalogues.</li>
        <li>Manufacture exclusive developments without written approval.</li>
      </ul>
      <p className="mb-1">This includes:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Designs</li>
        <li>Samples</li>
        <li>Packaging</li>
        <li>Graphics</li>
        <li>Artwork</li>
        <li>Colours</li>
        <li>Finishes</li>
        <li>Product concepts</li>
      </ul>
      <p className="mb-3">Whether production has commenced or not.</p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">6. INTELLECTUAL PROPERTY</p>
      <p className="mb-1">All Intellectual Property developed through Twif shall remain the exclusive property of:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>the Buyer; or</li>
        <li>Twif,</li>
      </ul>
      <p className="mb-1">including:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Designs</li>
        <li>Technical Drawings</li>
        <li>CAD Files</li>
        <li>Tooling</li>
        <li>Moulds</li>
        <li>Packaging</li>
        <li>Product Concepts</li>
        <li>Product Photography</li>
        <li>AI Models</li>
        <li>Software</li>
        <li>Workflows</li>
        <li>Documentation</li>
      </ul>
      <p className="mb-3">The Vendor shall acquire no ownership rights whatsoever.</p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">7. SOFTWARE &amp; DIGITAL ASSET PROTECTION</p>
      <p className="mb-1">The Vendor acknowledges that Twif owns proprietary technology platforms including but not limited to:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Vendor Portal</li>
        <li>AI Dashboards</li>
        <li>Trade Intelligence Modules</li>
        <li>Workflow Engines</li>
      </ul>
      <p className="mb-1">The Vendor shall not:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Copy</li>
        <li>Reverse engineer</li>
        <li>Replicate</li>
        <li>Modify</li>
        <li>Decompile</li>
        <li>Reproduce</li>
        <li>Commercially exploit</li>
      </ul>
      <p className="mb-3">any software, workflow, interface, database structure or technology belonging to Twif.</p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">8. TRADE SECRET PROTECTION</p>
      <p className="mb-1">The Vendor acknowledges that Twif possesses valuable trade secrets including:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Supply chain methodologies</li>
        <li>Costing models</li>
        <li>Vendor intelligence</li>
        <li>Buyer intelligence</li>
        <li>Pricing logic</li>
        <li>Procurement models</li>
        <li>Business processes</li>
        <li>Analytics</li>
      </ul>
      <p className="mb-3">Such information shall remain confidential indefinitely unless publicly available through lawful means.</p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">9. NON-SOLICITATION OF BUYER/CLIENTS</p>
      <p className="mb-3">
        The Vendor shall not directly or indirectly recruit, solicit, induce, employ or engage, consultant
        or appoint a representative/agents to approach Twif clients during the business relationship and
        for without Twif's prior written consent.
      </p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">10. DATA SECURITY</p>
      <p className="mb-1">The Vendor shall implement appropriate physical, technical and organisational safeguards to prevent:</p>
      <ul className="list-disc pl-5 mb-3 space-y-0.5">
        <li>Data theft</li>
        <li>Unauthorized access</li>
        <li>Data leakage</li>
        <li>Cyber breaches</li>
        <li>Loss of confidential information</li>
      </ul>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">11. RETURN OF MATERIALS</p>
      <p className="mb-1">Upon request or termination:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>all documents;</li>
        <li>drawings;</li>
        <li>samples;</li>
        <li>prototypes;</li>
        <li>electronic files;</li>
        <li>digital records;</li>
        <li>confidential materials;</li>
      </ul>
      <p className="mb-3">shall immediately be returned or permanently destroyed.</p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">12. BREACH</p>
      <p className="mb-1">Any breach shall entitle Twif to:</p>
      <ul className="list-disc pl-5 mb-3 space-y-0.5">
        <li>Immediate termination.</li>
        <li>Suspension of all orders.</li>
        <li>Cancellation of outstanding business.</li>
        <li>Recovery of direct losses and damages as permitted by law.</li>
        <li>Injunctive relief.</li>
        <li>Specific performance.</li>
        <li>Recovery of legal expenses.</li>
      </ul>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">13. DISPUTE RESOLUTION</p>
      <p className="mb-3">
        The Parties shall first attempt to resolve disputes amicably. Failing resolution within
        thirty (30) days, disputes shall be referred to arbitration in Singapore under the
        Arbitration Rules of the Singapore International Arbitration Centre (SIAC). Seat of
        arbitration: Singapore. Language: English. The arbitration award shall be final and binding.
      </p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">14. GOVERNING LAW</p>
      <p className="mb-3">
        This Agreement shall be governed by the laws of Singapore. Courts of Singapore shall
        have exclusive jurisdiction for interim and enforcement proceedings.
      </p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">15. TERM</p>
      <p className="mb-1">This Agreement shall remain effective during the business relationship.</p>
      <p className="mb-1">The obligations relating to:</p>
      <ul className="list-disc pl-5 mb-1 space-y-0.5">
        <li>Confidentiality</li>
        <li>Intellectual Property</li>
        <li>Trade Secrets</li>
        <li>Buyer Protection</li>
        <li>Non-Circumvention</li>
      </ul>
      <p className="mb-3">shall survive for five (5) years following termination, or longer where required by law or contract.</p>

      <p className="text-sm font-bold text-stone-900 mt-3 mb-1">16. ENTIRE AGREEMENT</p>
      <p>
        This Agreement constitutes the complete understanding between the Parties and supersedes all
        prior oral or written communications relating to its subject matter. Any amendment shall
        only be valid if made in writing and signed by both Parties.
      </p>

      <div className="text-[10px] text-stone-500 leading-normal border-t border-stone-200 mt-4 pt-3">
        <p className="text-xs font-bold text-stone-800 mb-0.5">SCHEDULE A</p>
        <p className="font-semibold text-stone-700 mb-2">Buyer Exclusivity &amp; Product Development Protocol</p>
        <p className="mb-2">
          This Schedule forms an integral part of the Master Non-Disclosure, Non-Circumvention &amp;
          Non-Solicitation Agreement entered into between Twif Technologies PTE LTD ("Twif") and the Vendor.
        </p>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">1. Buyer Exclusivity</p>
        <p className="mb-0.5">
          The Vendor acknowledges that all buyers introduced by Twif are proprietary business
          relationships of Twif. Accordingly, the Vendor shall not, directly or indirectly:
        </p>
        <ul className="list-disc pl-4 mb-1 space-y-0.5">
          <li>Contact, solicit, negotiate, quote, invoice, supply, or conduct business with any buyer introduced by Twif without Twif's prior written approval.</li>
          <li>Accept enquiries, RFQs, or purchase orders directly from such buyers.</li>
          <li>Share buyer contact details with any third party.</li>
          <li>Encourage buyers to bypass Twif for any commercial transaction.</li>
        </ul>
        <p className="mb-2">This restriction shall remain valid during the business relationship and for five (5) years following its termination.</p>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">2. Product Development Confidentiality</p>
        <p className="mb-0.5">All product developments undertaken through Twif shall remain strictly confidential. This includes, but is not limited to:</p>
        <ul className="list-disc pl-4 mb-1 space-y-0.5">
          <li>New product concepts</li>
          <li>Sketches and mood boards</li>
          <li>CAD drawings</li>
          <li>Technical drawings</li>
          <li>Product specifications</li>
          <li>Bill of Materials (BOM)</li>
          <li>Artwork and graphics</li>
          <li>Packaging designs</li>
          <li>Samples and prototypes</li>
          <li>Costing information</li>
          <li>Product photography</li>
          <li>AI-generated concepts</li>
          <li>Buyer comments and revisions</li>
        </ul>
        <p className="mb-2">The Vendor shall use such information solely for executing Twif-approved work.</p>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">3. Communication Protocol</p>
        <p className="mb-0.5">
          The Vendor shall communicate only through the designated Twif representative unless expressly
          authorized otherwise in writing. No discussions relating to:
        </p>
        <ul className="list-disc pl-4 mb-1 space-y-0.5">
          <li>New developments</li>
          <li>Pricing</li>
          <li>Product specifications</li>
          <li>Design changes</li>
          <li>Technical comments</li>
          <li>Sampling status</li>
          <li>Commercial negotiations</li>
        </ul>
        <p className="mb-2">shall be conducted directly with the buyer without prior written approval from Twif.</p>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">4. Approval Process</p>
        <p className="mb-0.5">No product shall be treated as approved until Twif communicates written confirmation. The Vendor shall not:</p>
        <ul className="list-disc pl-4 mb-1 space-y-0.5">
          <li>Commence production.</li>
          <li>Order raw materials.</li>
          <li>Order packaging materials.</li>
          <li>Create tooling or moulds.</li>
          <li>Book production capacity.</li>
          <li>Display or publicize products.</li>
        </ul>
        <p className="mb-2">until final approval has been received through Twif.</p>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">5. Product Display Restrictions</p>
        <p className="mb-0.5">Without prior written approval from Twif, the Vendor shall not:</p>
        <ul className="list-disc pl-4 mb-2 space-y-0.5">
          <li>Display buyer-exclusive products in factories or showrooms.</li>
          <li>Exhibit products at fairs or exhibitions.</li>
          <li>Publish photographs in catalogues, brochures, websites, or social media.</li>
          <li>Circulate product images through WhatsApp, email, or other marketing channels.</li>
          <li>Use buyer developments for marketing or promotional purposes.</li>
        </ul>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">6. Reproduction Restrictions</p>
        <p className="mb-0.5">
          The Vendor shall not manufacture, reproduce, modify, or offer substantially similar products
          for any third party where the product has been developed exclusively for a Twif buyer. This
          restriction applies irrespective of whether:
        </p>
        <ul className="list-disc pl-4 mb-2 space-y-0.5">
          <li>the order is placed,</li>
          <li>sampling is completed,</li>
          <li>or production has commenced.</li>
        </ul>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">7. Tooling, Moulds &amp; Development Assets</p>
        <p className="mb-2">
          Unless otherwise agreed in writing, all tooling, moulds, jigs, fixtures, artwork, CAD files,
          technical documents, samples, and development assets created specifically for Twif buyers
          shall remain the exclusive property of the respective buyer and/or Twif. Such assets shall
          not be reused for any other customer without prior written consent.
        </p>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">8. Breach</p>
        <p className="mb-0.5">Any breach of this Schedule shall constitute a material breach of the Agreement and may result in:</p>
        <ul className="list-disc pl-4 mb-2 space-y-0.5">
          <li>Immediate termination of business.</li>
          <li>Cancellation of current and future orders.</li>
          <li>Removal of the Vendor from Twif's approved vendor panel.</li>
          <li>Recovery of damages and legal costs as permitted by applicable law.</li>
          <li>Injunctive relief or other legal remedies available under law.</li>
        </ul>

        <p className="font-bold text-stone-800 mt-2 mb-0.5">Vendor Acknowledgement</p>
        <p>
          The Vendor acknowledges that compliance with this Schedule is fundamental to protecting
          Twif's buyer relationships, intellectual property, product developments, and commercial
          interests. The Vendor agrees to adhere strictly to these obligations throughout the
          business relationship.
        </p>
      </div>
    </div>
  )
}
