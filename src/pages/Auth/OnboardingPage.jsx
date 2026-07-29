import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigMessage } from '../../lib/supabase'
import { AuthShell, AuthLogo, OrgMatchCard } from '../../components/auth'
import { Button, Input, Select, Alert, Spinner } from '../../components/ui'
import SignaturePad from '../../components/shared/SignaturePad'
import { MODE_TO_STORAGE } from '../../lib/signatureMode'
import { useOrgLookup } from '../../hooks/useOrgLookup'
import { usePortalUser } from '../../hooks/usePortalUser'
import { useProfileStore } from '../../stores/profileStore'
import { useAuth } from '../../hooks/useAuth'
import { isValidUrl, isValidEmail } from '../../utils/validators'

// ─── Constants ────────────────────────────────────────────────
const COUNTRIES = [
  'United States', 'United Kingdom', 'India', 'Germany', 'France',
  'Australia', 'Canada', 'Japan', 'China', 'Brazil', 'Mexico', 'Other',
]

const EMPLOYEE_RANGES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']

const BUYER_RETAILER_TYPES = [
  'Online Store', 'Physical Store', 'Both Online & Physical',
  'Wholesale/Distribution', 'Marketplace Seller',
]

const SUPPLIER_TYPES = [
  'Manufacturer', 'Wholesaler', 'Distributor', 'Trading Company', 'Service Provider', 'Exporter', 'Others',
]

const FALLBACK_CATEGORIES = [
  'Home Decor', 'Furniture', 'Textile / Bed Linens', 'Lighting',
  'Kitchenware', 'Outdoor / Garden', 'Seasonal / Gifting', 'Hard Goods', 'Apparel',
].map((name, i) => ({ id: String(i), name }))

// ─── Sub-step: Role selection ──────────────────────────────────
function RoleStep({ role, onSelect, onContinue, companyName, onCompanyName, orgEmail, onOrgEmail, onBack, error }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h1
          className="text-stone-900"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400 }}
        >
          What describes you?
        </h1>
        <button type="button" onClick={onBack} className="text-sm text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0 mt-1">
          ← Back
        </button>
      </div>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        This determines your portal access and helps us find your organisation.
      </p>

      {error && <Alert type="error">{error}</Alert>}

      <div className="flex flex-col gap-3 mb-5">
        {[
          { val: 'buyer', label: 'Buyer', desc: 'I purchase products from suppliers and manage purchase orders' },
          { val: 'supplier', label: 'Supplier / Vendor', desc: 'I manufacture or supply products to buyers' },
        ].map(r => (
          <button
            key={r.val}
            type="button"
            onClick={() => onSelect(r.val)}
            className={`
              w-full text-left p-4 border rounded-xl transition-all duration-150
              ${role === r.val
                ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900/10'
                : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'}
            `}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-stone-900 mb-0.5">{r.label}</div>
                <div className="text-xs text-stone-500">{r.desc}</div>
              </div>
              <div className={`
                w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                ${role === r.val ? 'border-stone-900 bg-stone-900' : 'border-stone-300'}
              `}>
                {role === r.val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Email — stored as the organisation's contact email */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          placeholder="you@company.com"
          value={orgEmail}
          onChange={e => onOrgEmail(e.target.value)}
          className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
        />
      </div>

      {/* Company name — used for fuzzy match if domain lookup fails */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          Company name <span className="text-stone-400 font-normal">(helps us find your organisation)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. Acme Ltd"
          value={companyName}
          onChange={e => onCompanyName(e.target.value)}
          className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
        />
      </div>

      <Button variant="primary" fullWidth className="py-3" onClick={onContinue}>
        Continue
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
    </>
  )
}

// ─── Sub-step: Org lookup result ───────────────────────────────
function OrgLookupStep({ email, result, loading, error, form, setField, onJoin, onClaim, onCreateInstead, onSelectSuggestion, onBack, submitting }) {
  const domain = email?.split('@')[1] || ''

  return (
    <>
      <h1
        className="text-stone-900 mb-1.5"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400 }}
      >
        Your organisation
      </h1>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        We checked <strong className="text-stone-800 font-medium">@{domain}</strong> against our records.
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Spinner light={false} size="w-5 h-5" />
          <span className="text-sm text-stone-400">Looking up your organisation…</span>
        </div>
      )}

      {/* Org pending super-admin approval — not claimable/joinable yet */}
      {!loading && result?.found && result.pendingApproval && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 mb-5">
          <strong>{result.org.displayName}</strong> has been registered but is pending approval.
          It will be available to join once approved.
        </div>
      )}

      {/* Claimable — org exists, no members yet, needs super-admin approval */}
      {!loading && result?.found && result.claimable && (
        <>
          <OrgMatchCard org={result.org} />
          <div className="px-3.5 py-3 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-700 leading-relaxed mb-5">
            This organisation has no members yet. You can claim it as owner —
            your request will be reviewed by our team before access is granted.
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <Input
            label="Full name" required type="text" placeholder="Your full name"
            value={form.fullName} onChange={e => setField('fullName', e.target.value)}
          />
          <Button variant="primary" fullWidth loading={submitting} className="mt-1 py-3" onClick={onClaim}>
            Request ownership
          </Button>
          <div
            className="w-full py-2.5 ml-8 mt-2 text-sm text-stone-500 transition-colors"
          >
            <span>This isn't my organisation — </span><button className="underline cursor-pointer font-bold hover:text-stone-800 " type="button" onClick={onCreateInstead}>create a new one</button> 
          </div>
        </>
      )}

      {/* Match found — can join */}
      {!loading && result?.found && !result.claimable && !result.pendingApproval && !result.alreadyMember && !result.alreadyRequested && (
        <>
          <OrgMatchCard org={result.org} />

          <div className="px-3.5 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 leading-relaxed mb-5">
            Your request will be sent to your organisation's admin for approval.
            You'll receive an email once approved.
          </div>

          {error && <Alert type="error">{error}</Alert>}

          <Input
            label="Full name" required type="text" placeholder="Your full name"
            value={form.fullName} onChange={e => setField('fullName', e.target.value)}
          />
          <Input
            label="Phone" type="tel" placeholder="+91 XXXXX XXXXX"
            value={form.phone} onChange={e => setField('phone', e.target.value)}
          />

          <Button variant="primary" fullWidth loading={submitting} className="mt-1 py-3" onClick={onJoin}>
            Request to join
          </Button>
          <button
            type="button"
            onClick={onCreateInstead}
            className="w-full py-2.5 mt-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            Not your organisation? Create a new one
          </button>
        </>
      )}

      {/* Already requested */}
      {!loading && result?.found && !result.claimable && !result.pendingApproval && result.alreadyRequested && (
        <Alert type="warning">
          You've already requested to join <strong>{result.org.displayName}</strong>.
          Status: <strong className="capitalize">{result.requestStatus}</strong>.
        </Alert>
      )}

      {/* Already a member */}
      {!loading && result?.found && !result.claimable && !result.pendingApproval && result.alreadyMember && (
        <>
          <Alert type="success">
            You're already a member of <strong>{result.org.displayName}</strong>.
          </Alert>
          <Button variant="primary" fullWidth className="py-3" onClick={() => window.location.replace('/dashboard')}>
            Go to dashboard
          </Button>
        </>
      )}

      {/* No domain match but name suggestions found */}
      {!loading && result && !result.found && result.nameSuggestions?.length > 0 && (
        <>
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 mb-4">
            No organisation found for <strong>@{domain}</strong>, but we found some possible matches by name. Is one of these yours?
          </div>
          <div className="flex flex-col gap-2 mb-4">
            {result.nameSuggestions.map(org => (
              <button
                key={org.id}
                type="button"
                onClick={() => onSelectSuggestion(org)}
                className="w-full text-left px-4 py-3 border border-stone-200 rounded-xl hover:border-stone-400 hover:bg-stone-50 transition-all"
              >
                <div className="text-sm font-medium text-stone-900">{org.displayName}</div>
                <div className="text-xs text-stone-400 mt-0.5 capitalize">
                  {org.type} · {org.country || 'Unknown country'}
                  {!org.hasDomain && ' · No domain on file'}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateInstead}
            className="w-full py-2.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            None of these — create a new organisation
          </button>
        </>
      )}

      {/* No match at all */}
      {!loading && result && !result.found && !result.nameSuggestions?.length && (
        <>
          <div className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-500 mb-5">
            No existing organisation found for{' '}
            <strong className="text-stone-800">@{domain}</strong>. You'll create a new one.
          </div>
          <Button variant="primary" fullWidth className="py-3" onClick={onCreateInstead}>
            Create your organisation
          </Button>
        </>
      )}

      <div className="text-center mt-5">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-stone-400 hover:text-stone-700 transition-colors"
        >
          ← Back
        </button>
      </div>
    </>
  )
}

const NDA_DECLARATIONS = [
  { key: 'read', label: 'I have read and understood this Agreement, including all schedule and annexure.' },
  { key: 'authorized', label: 'I confirm I am authorized to sign on behalf of my organization.' },
]

const SUPPLIER_TABS = [
  { key: 'personal', step: 1, label: 'Personal Info' },
  { key: 'business', step: 2, label: 'Business Info' },
  { key: 'agreement', step: 3, label: 'Agreement' },
]

// ─── Searchable multi-select for product categories ────────────
function CategoryMultiSelect({ categories, selectedCats, toggleCat }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
  const selectedCategories = categories.filter(c => selectedCats.includes(c.id))

  return (
    <div className="relative" ref={containerRef}>
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedCategories.map(cat => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-stone-900 text-white text-xs rounded-lg"
            >
              {cat.name}
              <button type="button" onClick={() => toggleCat(cat.id)} className="hover:text-stone-300">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder="Search categories..."
        value={query}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
      />

      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-stone-400">No categories found</div>
          ) : (
            filtered.map(cat => (
              <label
                key={cat.id}
                className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCats.includes(cat.id)}
                  onChange={() => toggleCat(cat.id)}
                  className="w-3.5 h-3.5 accent-stone-900 flex-shrink-0"
                />
                {cat.name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-step: Create org form ─────────────────────────────────
function CreateOrgStep({ role, isVendorEntrance, form, setField, categories, selectedCats, toggleCat, ndaChecks, toggleNdaCheck, error, submitting, onSubmit, onBack }) {
  const [activeTab, setActiveTab] = useState('personal')
  const isSupplier = role === 'supplier'

  // Gate forward navigation between tabs on each tab's required fields —
  // users can always step back, but can't jump ahead until the current
  // tab is complete.
  const personalComplete = isVendorEntrance
    ? !!(form.fullName.trim() && form.phone.trim() && form.country && form.titleRole.trim() && form.employees)
    : !!(form.fullName.trim() && form.country && form.businessName.trim() && form.employees)

  const businessComplete = !!(
    form.registration.trim() && form.bankAccountNumber.trim() && form.bankIfsc.trim() &&
    form.pincode.trim() && form.address.trim() && form.ownerName.trim() && selectedCats.length > 0 &&
    (isVendorEntrance ? (form.businessName.trim() && form.iec.trim()) : form.isi.trim())
  )

  const tabUnlocked = { personal: true, business: personalComplete, agreement: personalComplete && businessComplete }

  // Pincode → address lookup via India Post's public PIN code API, so the
  // user gets a starting address they can still edit/extend with street detail.
  async function handlePincodeChange(value) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setField('pincode', digits)
    if (digits.length !== 6) return
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${digits}`)
      const data = await res.json()
      const po = data?.[0]?.PostOffice?.[0]
      if (po) setField('address', `${po.Name}, ${po.District}, ${po.State} - ${digits}`)
    } catch {
      // Lookup failed — user can still type the address manually.
    }
  }

  const personalFields = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Full name" required type="text" placeholder="Your name"
          value={form.fullName} onChange={e => setField('fullName', e.target.value)} wrapperClassName="mb-0" />
        <Input label="Phone" required={isVendorEntrance} type="tel" placeholder="+91 XXXXX XXXXX"
          value={form.phone} onChange={e => setField('phone', e.target.value)} wrapperClassName="mb-0" />
      </div>

      <Select label="Country" required value={form.country} onChange={e => setField('country', e.target.value)}>
        <option value="">Select country</option>
        {COUNTRIES.map(c => <option key={c}>{c}</option>)}
      </Select>

      <div className="grid grid-cols-2 gap-3">
        {isVendorEntrance ? (
          <Input
            label="Title / Role" required type="text" placeholder="e.g. Owner, Purchase Manager"
            value={form.titleRole} onChange={e => setField('titleRole', e.target.value)} wrapperClassName="mb-0"
          />
        ) : (
          <Input
            label={role === 'buyer' ? 'Company / Retailer name' : 'Company name'}
            required type="text" placeholder="Company name"
            value={form.businessName} onChange={e => setField('businessName', e.target.value)} wrapperClassName="mb-0"
          />
        )}
        <Input label="Website" type="url" placeholder="https://..."
          value={form.website} onChange={e => setField('website', e.target.value)} wrapperClassName="mb-0" />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Select label="Employees" required value={form.employees} onChange={e => setField('employees', e.target.value)} wrapperClassName="mb-0">
          <option value="">Select range</option>
          {EMPLOYEE_RANGES.map(r => <option key={r}>{r}</option>)}
        </Select>

        {role === 'buyer' ? (
          <Select label="Retailer type" value={form.retailerType} onChange={e => setField('retailerType', e.target.value)} wrapperClassName="mb-0">
            <option value="">Select type</option>
            {BUYER_RETAILER_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
        ) : (
          <Select label="Business type" value={form.supplierType} onChange={e => setField('supplierType', e.target.value)} wrapperClassName="mb-0">
            <option value="">Select type</option>
            {SUPPLIER_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
        )}
      </div>

      {role === 'supplier' && form.supplierType === 'Others' && (
        <Input
          label="Please specify business type" type="text" className="mt-4"
          placeholder="e.g. Cooperative, Artisan Collective"
          value={form.supplierTypeOther} onChange={e => setField('supplierTypeOther', e.target.value)}
        />
      )}
    </>
  )

  const businessFields = (
    <>
      {isVendorEntrance && (
        <Input
          label="Company Name" required type="text"
          placeholder="Company name"
          value={form.businessName} onChange={e => setField('businessName', e.target.value)}
        />
      )}

      <div className={`grid grid-cols-2 gap-3 ${isVendorEntrance ? 'mt-4' : ''}`}>
        <Input
          label="GST No." required type="text"
          placeholder="GST number"
          value={form.registration} onChange={e => setField('registration', e.target.value)} wrapperClassName="mb-0"
        />
        <Input
          label="CIN No." type="text"
          placeholder="Corporate identification number"
          value={form.cin} onChange={e => setField('cin', e.target.value)} wrapperClassName="mb-0"
        />
      </div>

      {isVendorEntrance ? (
        <Input
          label="Udyam No." type="text" className="mt-4"
          placeholder="Udyam registration number"
          value={form.udyam} onChange={e => setField('udyam', e.target.value)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Input
            label="Udyam No." type="text"
            placeholder="Udyam registration number"
            value={form.udyam} onChange={e => setField('udyam', e.target.value)} wrapperClassName="mb-0"
          />
          <Input
            label="MSME No." type="text"
            placeholder="MSME registration number"
            value={form.msme} onChange={e => setField('msme', e.target.value)} wrapperClassName="mb-0"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Input
          label={isVendorEntrance ? 'IEC No.' : 'ISI code'} required type="text"
          placeholder={isVendorEntrance ? 'IEC No.' : 'ISI code'}
          value={isVendorEntrance ? form.iec : form.isi}
          onChange={e => setField(isVendorEntrance ? 'iec' : 'isi', e.target.value)}
          wrapperClassName="mb-0"
        />
        <Input
          label="Vendor logo" type="url"
          placeholder="https://..."
          value={form.logoUrl} onChange={e => setField('logoUrl', e.target.value)} wrapperClassName="mb-0"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Input
          label="Bank account number" required type="text"
          placeholder="Account number"
          value={form.bankAccountNumber} onChange={e => setField('bankAccountNumber', e.target.value)} wrapperClassName="mb-0"
        />
        <Input
          label="IFSC code" required type="text"
          placeholder="IFSC code"
          value={form.bankIfsc} onChange={e => setField('bankIfsc', e.target.value)} wrapperClassName="mb-0"
        />
      </div>

      <Input
        label="Pincode" required type="text" className="mt-4"
        placeholder="e.g. 122001" inputMode="numeric" maxLength={6}
        value={form.pincode} onChange={e => handlePincodeChange(e.target.value)}
      />

      <Input
        label="Address" required type="text" className="mt-4"
        placeholder="Registered business address"
        value={form.address} onChange={e => setField('address', e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Input
          label="Owner / Director name" required type="text"
          placeholder="Full name"
          value={form.ownerName} onChange={e => setField('ownerName', e.target.value)} wrapperClassName="mb-0"
        />
        <Input
          label="Owner / Director phone" type="tel"
          placeholder="+91 XXXXX XXXXX"
          value={form.ownerPhone} onChange={e => setField('ownerPhone', e.target.value)} wrapperClassName="mb-0"
        />
      </div>

      <Input
        label="Owner / Director email" type="email" className="mt-4"
        placeholder="owner@company.com"
        value={form.ownerEmail} onChange={e => setField('ownerEmail', e.target.value)}
      />

      <Input
        label="Reason for contact" type="text" className="mt-4"
        placeholder="Why are you reaching out to us?"
        value={form.reasonForContact} onChange={e => setField('reasonForContact', e.target.value)}
      />

      <div className="mb-4 mt-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Product categories <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-stone-400 mb-2.5">
          Select all categories your business supplies
        </p>
        <CategoryMultiSelect categories={categories} selectedCats={selectedCats} toggleCat={toggleCat} />
      </div>
    </>
  )

  const agreementFields = (
    <div className="mb-4">
      <label className="block text-sm font-medium text-stone-700 mb-1">
        Vendor Agreement & NDA <span className="text-red-500">*</span>
      </label>
      <p className="text-xs text-stone-400 mb-2.5">
        Please review and accept our Non-Disclosure, Non-Circumvention &amp; Non-Solicitation Agreement.
      </p>
      <div className="max-h-64 overflow-y-auto text-xs text-stone-600 leading-relaxed border border-stone-200 rounded-xl p-4 mb-3 bg-stone-50">
        <p className="text-sm font-bold text-stone-900 mb-1">
          MASTER NON-DISCLOSURE, NON-CIRCUMVENTION &amp; NON-SOLICITATION AGREEMENT
        </p>
        <p className="font-semibold text-stone-700 mb-3">(Vendor Confidentiality &amp; Business Protection Agreement)</p>

        <p className="mb-3">
          <strong>This Agreement</strong> is entered into on{' '}
          <strong>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>{' '}
          ("Effective Date")
        </p>

        <p className="font-bold text-stone-900 mb-1">BETWEEN</p>
        <p className="mb-3">
          <strong>Twif Tech LLP</strong>, having its registered office at 36, Pace City 1, Sector 37,
          Gurugram, Haryana – 122001, India (hereinafter referred to as <strong>"Twif"</strong>, which
          expression shall include its successors, affiliates and permitted assigns);
        </p>

        <p className="mb-1">AND</p>
        <p className="mb-1">
          <strong>Vendor Name:</strong> {form.businessName || '____________________'}
        </p>
        <p className="mb-3">
          <strong>Address:</strong> {form.address || '____________________'}
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
          thirty (30) days, disputes shall be referred to arbitration under the Arbitration and
          Conciliation Act, 1996. Seat of arbitration: Gurugram, Haryana, India. Language: English. The
          arbitration award shall be final and binding.
        </p>

        <p className="text-sm font-bold text-stone-900 mt-3 mb-1">14. GOVERNING LAW</p>
        <p className="mb-3">
          This Agreement shall be governed by the laws of India. Courts at Gurugram, Haryana shall
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
            Non-Solicitation Agreement entered into between Twif Tech LLP ("Twif") and the Vendor.
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

      <div className="flex flex-col gap-2 mb-3">
        {NDA_DECLARATIONS.map(d => (
          <label key={d.key} className="flex items-start gap-2 text-xs text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              checked={!!ndaChecks[d.key]}
              onChange={() => toggleNdaCheck(d.key)}
              className="w-3.5 h-3.5 accent-stone-900 flex-shrink-0 mt-0.5"
            />
            {d.label} <span className="text-red-500">*</span>
          </label>
        ))}
      </div>

      <label className="block text-sm font-medium text-stone-700 mb-1.5">
        Sign the agreement <span className="text-red-500">*</span>
      </label>
      <SignaturePad
        mode={form.signatureMode}
        onModeChange={v => setField('signatureMode', v)}
        typedValue={form.ndaSignatureName}
        onTypedChange={v => setField('ndaSignatureName', v)}
        imageValue={form.ndaSignatureImage}
        onImageChange={v => setField('ndaSignatureImage', v)}
        typedPlaceholder="Full legal name"
      />
    </div>
  )

  if (!isSupplier) {
    return (
      <>
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <h1
            className="text-stone-900"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400 }}
          >
            Organisation details
          </h1>
          <button type="button" onClick={onBack} className="text-sm text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0 mt-1">
            ← Back
          </button>
        </div>
        <p className="text-sm text-stone-500 leading-relaxed mb-6">
          Tell us about yourself and your company.
        </p>

        {error && <Alert type="error">{error}</Alert>}

        {personalFields}

        <Button variant="primary" fullWidth loading={submitting} className="mt-2 py-3" onClick={onSubmit}>
          Submit for review
        </Button>
      </>
    )
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h1
          className="text-stone-900"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400 }}
        >
          {isVendorEntrance ? "Vendor's Organisation details" : 'Organisation details'}
        </h1>
        <button type="button" onClick={onBack} className="text-sm text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0 mt-1">
          ← Back
        </button>
      </div>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        Tell us about yourself and your company.
      </p>

      <div className="flex gap-1 mb-6">
        {SUPPLIER_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            disabled={!tabUnlocked[t.key]}
            onClick={() => tabUnlocked[t.key] && setActiveTab(t.key)}
            className={`
              flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap
              flex items-center justify-center gap-1.5
              ${activeTab === t.key
                ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                : tabUnlocked[t.key]
                  ? 'text-stone-500 hover:text-stone-700 border border-transparent cursor-pointer'
                  : 'text-stone-300 border border-transparent cursor-not-allowed'}
            `}
          >
            <span className={`
              flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold flex-shrink-0
              ${activeTab === t.key ? 'bg-stone-900 text-white' : tabUnlocked[t.key] ? 'bg-stone-200 text-stone-600' : 'bg-stone-100 text-stone-300'}
            `}>
              {t.step}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="h-[480px] overflow-y-auto pr-1">
        {activeTab === 'personal' && personalFields}
        {activeTab === 'business' && businessFields}
        {activeTab === 'agreement' && agreementFields}
      </div>

      {activeTab === 'agreement' && (
        <Button variant="primary" fullWidth loading={submitting} className="mt-2 py-3" onClick={onSubmit}>
          Submit for review
        </Button>
      )}
    </>
  )
}

// ─── Sub-step: Pending confirmation ───────────────────────────
function PendingStep({ email, pendingType }) {
  const navigate = useNavigate()

  const copy = {
    join: {
      title: 'Request submitted',
      body: "Your organisation's admin will review and approve your request. This usually takes less than 24 hours.",
    },
    claim: {
      title: 'Claim submitted',
      body: 'Our team will verify your ownership request. This usually takes 1–2 business days.',
    },
    new: {
      title: 'Application submitted',
      body: 'Our team will verify your organisation details. This usually takes 1–2 business days.',
    },
  }[pendingType] || { title: 'Submitted', body: "We'll be in touch shortly." }
  return (
    <div className="text-center py-2">
      <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>

      <h1
        className="text-stone-900 mb-2"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400 }}
      >
        {copy.title}
      </h1>
      <p className="text-sm text-stone-500 leading-relaxed mb-6 max-w-xs mx-auto">
        You'll receive an email at{' '}
        <strong className="text-stone-800 font-medium">{email}</strong>{' '}
        once your account is approved.
      </p>

      <div className="text-left px-4 py-4 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-500 mb-6">
        <strong className="text-stone-800 block mb-1.5">What happens next?</strong>
        {copy.body}
      </div>

      <Button variant="secondary" fullWidth onClick={() => navigate('/')}>
        Back to home
      </Button>
    </div>
  )
}

// ─── Main OnboardingPage ───────────────────────────────────────
export default function OnboardingPage({ forcedRole: routeForcedRole }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { email, pendingReview, forcedRole: stateForcedRole } = state || {}
  // Route prop wins — /auth/vendor/onboarding_vendor always knows its role,
  // regardless of whether history state carried it through correctly.
  const forcedRole = routeForcedRole || stateForcedRole

  // forcedRole (from /auth/buyer or /auth/vendor) skips the role picker —
  // land straight on the org-lookup step with the role already decided.
  const [step, setStep] = useState(pendingReview ? 3 : (forcedRole ? 1 : 0))
  const [role, setRole] = useState(forcedRole || 'buyer')
  // The /auth/vendor entrance has its own field set (Title/Role, IEC code,
  // required Phone, Company Name moved to Business Info, no MSME No.)
  const isVendorEntrance = forcedRole === 'supplier'
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES)
  const [selectedCats, setSelectedCats] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [pendingType, setPendingType] = useState('new') // 'join' | 'claim' | 'new'

  const [form, setFormState] = useState({
    orgEmail: email || '',
    fullName: '', phone: '', country: '', businessName: '', titleRole: '',
    website: '', employees: '', retailerType: '', supplierType: '', supplierTypeOther: '', registration: '',
    cin: '', udyam: '', msme: '', isi: '', iec: '', bankAccountNumber: '', bankIfsc: '',
    pincode: '', address: '', ownerName: '', ownerEmail: '', ownerPhone: '', reasonForContact: '',
    logoUrl: '', ndaSignatureName: '', signatureMode: 'type', ndaSignatureImage: '',
  })

  const [ndaChecks, setNdaChecks] = useState({
    read: false, authorized: false,
  })

  const [suggestedOrg, setSuggestedOrg] = useState(null) // user picked from name suggestions

  const { result, loading: lookupLoading, error: lookupError, lookup, reset } = useOrgLookup()

  // forcedRole entrances skip RoleStep — trigger the domain lookup ourselves
  // on mount instead of it happening via the (skipped) "Continue" click.
  useEffect(() => {
    if (forcedRole && email) lookup(email, forcedRole, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedRole, email])

  // The effective result — either from domain lookup or user-selected name suggestion
  const effectiveResult = suggestedOrg
    ? { found: true, claimable: !suggestedOrg.hasDomain, alreadyRequested: false, alreadyMember: false, org: suggestedOrg }
    : result

  // Hook owns portal_users updates — page just calls markOnboardingComplete()
  const [currentUser, setCurrentUser] = useState(null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
  }, [])
  const { markOnboardingComplete } = usePortalUser(currentUser)

  const profileFetched   = useProfileStore((s) => s.profileFetched)
  const portalUser       = useProfileStore((s) => s.portalUser)
  const orgMembership    = useProfileStore((s) => s.orgMembership)

  const { session, loading: authLoading } = useAuth()

  // Guard: no email in router state → redirect to /auth only if genuinely unauthenticated.
  // Authenticated users without router state are handled by the profile guards below.
  useEffect(() => {
    if (authLoading) return
    if (!email && !session) navigate('/auth', { replace: true })
  }, [email, session, authLoading, navigate])

  // Guard: already onboarded AND approved → send to dashboard
  // Skip this guard in pendingReview mode — user is here intentionally to see the pending screen
  useEffect(() => {
    if (!pendingReview && profileFetched && portalUser?.onboarding_completed) {
      navigate('/dashboard', { replace: true })
    }
  }, [pendingReview, profileFetched, portalUser, navigate])

  // Poll for approval when on the pending review screen.
  // Refreshes the profile every 10s — redirects to dashboard as soon as org membership appears.
  useEffect(() => {
    if (!pendingReview || !currentUser?.id) return
    const check = async () => {
      await useProfileStore.getState().fetchProfile(currentUser.id)
    }
    check() // immediate check on mount
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [pendingReview, currentUser?.id])

  useEffect(() => {
    if (pendingReview && orgMembership) {
      navigate('/dashboard', { replace: true })
    }
  }, [pendingReview, orgMembership, navigate])

  // Fetch categories
  useEffect(() => {
    fetch(`${import.meta.env.VITE_BACKEND_URL}/org-customers/categories`)
      .then(r => r.json())
      .then(d => { if (d.success && d.data?.length) setCategories(d.data) })
      .catch(() => {}) // keep fallback
  }, [])

  function setField(key, val) {
    setFormState(p => ({ ...p, [key]: val }))
    setSubmitError('')
  }

  function toggleCat(id) {
    setSelectedCats(p => p.includes(id) ? p.filter(c => c !== id) : [...p, id])
  }

  function toggleNdaCheck(key) {
    setNdaChecks(p => ({ ...p, [key]: !p[key] }))
    setSubmitError('')
  }

  function handleRoleContinue() {
    if (!isValidEmail(form.orgEmail)) return setSubmitError('Please enter a valid email address')
    setStep(1)
    lookup(email, role, form.businessName)
  }

  function handleRoleChange(r) {
    setRole(r)
    reset()
  }

  function handleCreateInstead() {
    reset()
    setStep(2)
  }

  // User picks a name suggestion — synthesise a found result so the
  // normal join/claim flow takes over from here
  function handleSelectSuggestion(org) {
    setSuggestedOrg(org)
  }

  async function handleClaimOrg() {
    if (!form.fullName.trim()) return setSubmitError('Full name is required')
    setSubmitting(true)
    setSubmitError('')
    try {
      if (!supabase) throw new Error(supabaseConfigMessage)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/org-customers/claim-org`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          organizationId: effectiveResult.org.id,
          fullName: form.fullName,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Race condition — org now has members, pivot to join request
        if (res.status === 409 && data.shouldJoin) {
          setSubmitError('This organisation now has members. Please submit a join request instead.')
          setSuggestedOrg(null) // reset so lookup result shows join path
          return
        }
        throw new Error(data.error || 'Failed to submit claim')
      }
      await markOnboardingComplete()
      setPendingType('claim')
      setStep(3)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleJoinRequest() {
    if (!form.fullName.trim()) return setSubmitError('Full name is required')
    setSubmitting(true)
    setSubmitError('')
    try {
      if (!supabase) throw new Error(supabaseConfigMessage)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/org-customers/join-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email,
          fullName: form.fullName,
          organizationId: effectiveResult.org.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit request')

      await markOnboardingComplete()
      setPendingType('join')
      setStep(3)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateOrg() {
    if (!form.fullName.trim()) return setSubmitError('Full name is required')
    if (!form.country) return setSubmitError('Country is required')
    if (!form.businessName.trim()) return setSubmitError('Company name is required')
    if (!form.employees) return setSubmitError('Number of employees is required')
    if (role === 'supplier' && selectedCats.length === 0) return setSubmitError('Please select at least one product category')
    if (form.website && !isValidUrl(form.website)) return setSubmitError('Website must start with https://')
    if (role === 'supplier') {
      if (!form.registration.trim()) return setSubmitError('GST No. is required')
      if (isVendorEntrance) {
        if (!form.phone.trim()) return setSubmitError('Phone is required')
        if (!form.titleRole.trim()) return setSubmitError('Title / Role is required')
        if (!form.iec.trim()) return setSubmitError('IEC No. is required')
      } else if (!form.isi.trim()) {
        return setSubmitError('ISI code is required')
      }
      if (!form.bankAccountNumber.trim()) return setSubmitError('Bank account number is required')
      if (!form.bankIfsc.trim()) return setSubmitError('IFSC code is required')
      if (form.pincode.trim().length !== 6) return setSubmitError('A valid 6-digit pincode is required')
      if (!form.address.trim()) return setSubmitError('Address is required')
      if (!form.ownerName.trim()) return setSubmitError('Owner / Director name is required')
      if (!NDA_DECLARATIONS.every(d => ndaChecks[d.key])) return setSubmitError('Please accept all NDA declarations to continue')
      if (form.signatureMode === 'type' && !form.ndaSignatureName.trim()) {
        return setSubmitError('Please type your full legal name to sign the NDA')
      }
      if ((form.signatureMode === 'draw' || form.signatureMode === 'upload') && !form.ndaSignatureImage) {
        return setSubmitError(form.signatureMode === 'draw' ? 'Please draw your signature' : 'Please upload your signature')
      }
    }

    setSubmitting(true)
    setSubmitError('')
    try {
      if (!supabase) throw new Error(supabaseConfigMessage)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/org-customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          customer_name: form.fullName,
          business_name: form.businessName,
          customer_role: role === 'buyer' ? 'Buyer' : 'Supplier/Vendor',
          org_email: form.orgEmail,
          customer_phone: form.phone,
          country: form.country,
          domain_name: form.website,
          number_of_employees: form.employees,
          retailer_type: form.retailerType,
          supplier_type: form.supplierType === 'Others' ? form.supplierTypeOther : form.supplierType,
          business_registration: form.registration,
          categories: selectedCats,
          create_org: true,
          ...(role === 'supplier' && {
            cin_no: form.cin,
            udyam_no: form.udyam,
            ...(isVendorEntrance
              ? { iec_code: form.iec, job_title: form.titleRole, via_vendor_entrance: true }
              : { msme_no: form.msme, isi_code: form.isi }),
            bank_account_number: form.bankAccountNumber,
            bank_ifsc_code: form.bankIfsc,
            pincode: form.pincode,
            address: form.address,
            owner_name: form.ownerName,
            owner_email: form.ownerEmail,
            owner_phone: form.ownerPhone,
            reason_for_contact: form.reasonForContact,
            logo_url: form.logoUrl,
            nda_accepted: true,
            nda_signature_type: MODE_TO_STORAGE[form.signatureMode],
            ...(form.signatureMode === 'type'
              ? { nda_signature_name: form.ndaSignatureName }
              : { nda_signature_image: form.ndaSignatureImage }),
          }),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed')

      await markOnboardingComplete()
      setPendingType('new')
      setStep(3)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const logoSuffix = forcedRole === 'buyer' ? 'New Buyer Registration' : forcedRole === 'supplier' ? 'New Vendor Registration' : undefined

  // No router state: unauthenticated → will redirect to /auth via effect above.
  // Authenticated → show spinner while profile loads and the guards redirect them.
  if (!email) {
    return (
      <AuthShell>
        <AuthLogo suffix={logoSuffix} />
        <div className="flex justify-center py-10">
          <Spinner light={false} size="w-6 h-6" />
        </div>
      </AuthShell>
    )
  }

  if (!supabase) {
    return (
      <AuthShell>
        <AuthLogo suffix={logoSuffix} />
        <Alert type="error">{supabaseConfigMessage}</Alert>
        <button
          type="button"
          onClick={() => navigate('/auth', { replace: true })}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Back to sign in
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell maxWidth={step === 2 && role === 'supplier' ? 'max-w-2xl' : 'max-w-md'}>
      <AuthLogo suffix={logoSuffix} />

      {step === 0 && (
        <RoleStep
          role={role}
          onSelect={handleRoleChange}
          onContinue={handleRoleContinue}
          companyName={form.businessName}
          onCompanyName={v => setField('businessName', v)}
          orgEmail={form.orgEmail}
          onOrgEmail={v => setField('orgEmail', v)}
          onBack={() => navigate(forcedRole ? `/auth/${forcedRole === 'buyer' ? 'buyer' : 'vendor'}` : '/auth', { state: { email } })}
          error={submitError}
        />
      )}

      {step === 1 && (
        <OrgLookupStep
          email={email}
          result={effectiveResult}
          loading={lookupLoading}
          error={submitError || lookupError}
          form={form}
          setField={setField}
          onJoin={handleJoinRequest}
          onClaim={handleClaimOrg}
          onCreateInstead={handleCreateInstead}
          onSelectSuggestion={handleSelectSuggestion}
          onBack={() => {
            setSuggestedOrg(null)
            // forcedRole flows never show the role picker — exit straight back
            // to the entrance page they came from instead of showing step 0.
            if (forcedRole) navigate(`/auth/${forcedRole === 'buyer' ? 'buyer' : 'vendor'}`, { state: { email } })
            else setStep(0)
          }}
          submitting={submitting}
        />
      )}

      {step === 2 && (
        <CreateOrgStep
          role={role}
          isVendorEntrance={isVendorEntrance}
          form={form}
          setField={setField}
          categories={categories}
          selectedCats={selectedCats}
          toggleCat={toggleCat}
          ndaChecks={ndaChecks}
          toggleNdaCheck={toggleNdaCheck}
          error={submitError}
          submitting={submitting}
          onSubmit={handleCreateOrg}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <PendingStep email={email} pendingType={pendingType} />
      )}
    </AuthShell>
  )
}