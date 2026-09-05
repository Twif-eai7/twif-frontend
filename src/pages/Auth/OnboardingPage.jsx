import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigMessage } from '../../lib/supabase'
import { AuthShell, AuthLogo, OrgMatchCard } from '../../components/auth'
import { Button, Input, Select, Alert, Spinner, PhoneField, OTPInput } from '../../components/ui'
import { useOTPTimer } from '../../hooks/useOtpTimer'
import SignaturePad from '../../components/shared/SignaturePad'
import NdaAgreementText from '../../components/shared/NdaAgreementText'
import { MODE_TO_STORAGE } from '../../lib/signatureMode'
import { useOrgLookup } from '../../hooks/useOrgLookup'
import { usePortalUser } from '../../hooks/usePortalUser'
import { useProfileStore } from '../../stores/profileStore'
import { useAuth } from '../../hooks/useAuth'
import { isValidUrl, isValidEmail } from '../../utils/validators'
import { formatErrorFor, GSTIN_RE, INDIA_PIN_RE } from '../../utils/fieldFormats'
import ApplicationPreviewModal from './ApplicationPreviewModal'

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

// Synthetic "Others" option — when picked, the user types a free-text category.
const OTHER_CAT_ID = '__other__'

// GSTIN state code (first 2 digits) → state name. Used for the free, no-API
// fallback when the full GST lookup isn't configured.
const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
}

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

// Nearest scrollable ancestor — the tab body clips the dropdown otherwise.
function getScrollParent(node) {
  let el = node?.parentElement
  while (el) {
    const oy = getComputedStyle(el).overflowY
    if (oy === 'auto' || oy === 'scroll') return el
    el = el.parentElement
  }
  return null
}

// ─── Searchable multi-select for product categories ────────────
function CategoryMultiSelect({ categories, selectedCats, toggleCat }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const containerRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Decide flip direction against the clipping scroll container, then make
  // sure the menu is actually in view once it has rendered.
  function openMenu() {
    const el = containerRef.current
    const scroller = getScrollParent(el)
    if (el && scroller) {
      const r = el.getBoundingClientRect()
      const s = scroller.getBoundingClientRect()
      const spaceBelow = s.bottom - r.bottom
      const spaceAbove = r.top - s.top
      setDropUp(spaceBelow < 240 && spaceAbove > spaceBelow)
    }
    setOpen(true)
  }

  useEffect(() => {
    if (open) menuRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

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
        onFocus={openMenu}
        onChange={e => { setQuery(e.target.value); if (!open) openMenu() }}
        className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
      />

      {open && (
        <div
          ref={menuRef}
          className={`absolute z-10 w-full max-h-56 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
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
function CreateOrgStep({ role, isVendorEntrance, publicEntry, form, setField, categories, selectedCats, toggleCat, ndaChecks, toggleNdaCheck, error, submitting, onSubmit, onBack }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('personal')
  const [kycOpen, setKycOpen] = useState(true)
  const isSupplier = role === 'supplier'

  // Advisory format hints — shown under a field on blur, never block Next/Submit.
  // Transient UI state: not part of `form`, not persisted in the draft.
  const [fieldErrors, setFieldErrors] = useState({})
  const validationCtx = { country: form.country }

  function handleBlur(name, value) {
    const msg = formatErrorFor(name, value, validationCtx)
    setFieldErrors(prev => (prev[name] === msg ? prev : { ...prev, [name]: msg }))
  }

  // Value update + live-clear an existing error the moment it becomes valid.
  // Never raises a new error mid-typing for a field that isn't already flagged.
  function setFieldChecked(name, value) {
    setField(name, value)
    setFieldErrors(prev =>
      prev[name] ? { ...prev, [name]: formatErrorFor(name, value, validationCtx) } : prev)
  }

  // Per-tab completeness — drives the green "completed" tab styling. Navigation
  // is free (no hard stop); these are advisory only.
  const personalComplete = isVendorEntrance
    ? !!(form.fullName.trim() && form.phone.trim() && form.country && form.titleRole.trim() && form.employees && (!publicEntry || isValidEmail(form.orgEmail)))
    : !!(form.fullName.trim() && form.country && form.businessName.trim() && form.employees)

  const businessComplete = !!(
    form.registration.trim() && form.bankAccountNumber.trim() && form.bankIfsc.trim() &&
    form.pincode.trim() && form.address.trim() && form.ownerName.trim() && selectedCats.length > 0 &&
    (!selectedCats.includes(OTHER_CAT_ID) || form.categoryOther.trim()) &&
    (isVendorEntrance ? (form.businessName.trim() && form.iec.trim()) : form.isi.trim())
  )

  const agreementComplete = !!(
    NDA_DECLARATIONS.every(d => ndaChecks[d.key]) &&
    (form.signatureMode === 'type' ? form.ndaSignatureName.trim() : form.ndaSignatureImage)
  )

  const tabComplete = { personal: personalComplete, business: businessComplete, agreement: agreementComplete }

  // Previous / Next just move between tabs — every tab is reachable directly too.
  const tabKeys = SUPPLIER_TABS.map(t => t.key)
  const tabIndex = tabKeys.indexOf(activeTab)
  const isFirstTab = tabIndex === 0
  const isLastTab = tabIndex === tabKeys.length - 1

  function goPrev() {
    if (isFirstTab) { if (onBack) onBack(); return }
    setActiveTab(tabKeys[tabIndex - 1])
  }
  function goNext() {
    if (!isLastTab) setActiveTab(tabKeys[tabIndex + 1])
  }

  // GSTIN → registered-business details.
  // Full path: the backend's Appyflow lookup (Company Name, Address, Pincode…).
  // Free fallback (no key / lookup down): derive Country + State from the GSTIN
  // itself — the pincode field still fills the rest of the address.
  const [gstLookup, setGstLookup] = useState('') // '' | 'loading' | 'ok' | 'partial'
  const [gstFilled, setGstFilled] = useState([]) // labels of fields we prefilled
  const [gstState, setGstState] = useState('')   // state derived from the code

  // No-API fallback — everything derivable from the number alone.
  function gstFreeFallback(gstin) {
    setField('country', 'India')
    setGstState(GST_STATE_CODES[gstin.slice(0, 2)] || '')
    setGstFilled(['Country'])
    setGstLookup('partial')
  }

  async function handleGstChange(value) {
    const gstin = value.toUpperCase().replace(/\s/g, '').slice(0, 15)
    setField('registration', gstin)
    setFieldErrors(prev => (prev.registration
      ? { ...prev, registration: GSTIN_RE.test(gstin) ? '' : prev.registration } : prev))

    if (!GSTIN_RE.test(gstin)) {
      setGstLookup('')
      setGstFilled([])
      setGstState('')
      return
    }

    setGstLookup('loading')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/org-customers/gst-lookup?gstin=${gstin}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } },
      )
      // 503 = full lookup not configured — fall back to number-only derivation.
      if (res.status === 503) { gstFreeFallback(gstin); return }
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Lookup failed')

      const d = json.data
      const filled = []
      const companyName = d.tradeName || d.legalName
      if (companyName) { setField('businessName', companyName); filled.push('Company Name') }
      if (d.country) { setField('country', d.country); filled.push('Country') }
      if (d.pincode) { setField('pincode', d.pincode); filled.push('Pincode') }
      if (d.address) { setField('address', d.address); filled.push('Address') }
      // For a proprietorship the GST legal name is the individual owner.
      if (/propriet/i.test(d.constitution || '') && d.legalName) {
        setField('ownerName', d.legalName); filled.push('Owner name')
      }

      setGstState(d.state || '')
      setGstFilled(filled)
      setGstLookup('ok')
    } catch {
      // Lookup unreachable — still give them the free derivation.
      gstFreeFallback(gstin)
    }
  }

  // Pincode → address lookup via India Post's public PIN code API, so the
  // user gets a starting address they can still edit/extend with street detail.
  async function handlePincodeChange(value) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setField('pincode', digits)
    setFieldErrors(prev => (prev.pincode
      ? { ...prev, pincode: INDIA_PIN_RE.test(digits) ? '' : prev.pincode } : prev))
    if (digits.length !== 6) return
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${digits}`)
      const data = await res.json()
      const po = data?.[0]?.PostOffice?.[0]
      if (po) setField('address', `${po.District}, ${po.State}, ${po.Country || 'India'} - ${digits}`)
    } catch {
      // Lookup failed — user can still type the address manually.
    }
  }

  const personalFields = (
    <>
      {publicEntry && (
        <Input
          label="Work email" required type="email" placeholder="you@company.com"
          value={form.orgEmail} onChange={e => setField('orgEmail', e.target.value)}
          hint="We'll verify this email when you submit the application."
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Full name" required type="text" placeholder="Your name"
          value={form.fullName} onChange={e => setField('fullName', e.target.value)} wrapperClassName="mb-0" />
        <PhoneField label="Phone" required={isVendorEntrance}
          value={form.phone}
          country={form.country}
          onChange={v => setFieldChecked('phone', v)}
          onBlur={v => handleBlur('phone', v)}
          error={fieldErrors.phone}
          wrapperClassName="mb-0" />
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
          value={form.website}
          onChange={e => setFieldChecked('website', e.target.value)}
          onBlur={e => handleBlur('website', e.target.value)}
          error={fieldErrors.website}
          wrapperClassName="mb-0" />
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

      <div className={`border border-stone-200 rounded-xl overflow-hidden ${isVendorEntrance ? 'mt-6' : ''}`}>
        <button
          type="button"
          onClick={() => setKycOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors"
          aria-expanded={kycOpen}
        >
          <span className="text-base font-semibold tracking-wide text-stone-700">KYC Docs</span>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className={`text-stone-500 transition-transform duration-200 ${kycOpen ? 'rotate-180' : ''}`}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {kycOpen && (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="GST / Tax No." required type="text"
                placeholder="GST number"
                value={form.registration}
                onChange={e => handleGstChange(e.target.value)}
                onBlur={e => handleBlur('registration', e.target.value)}
                error={fieldErrors.registration}
                wrapperClassName="mb-0"
                maxLength={15}
                hint={
                  gstLookup === 'loading' ? 'Fetching details from GSTIN…'
                    : gstLookup === 'ok'
                      ? (gstFilled.length ? `Filled from GSTIN: ${gstFilled.join(', ')}` : 'GSTIN verified')
                      : gstLookup === 'partial'
                        ? `Set Country = India${gstState ? `, State = ${gstState}` : ''}. Add pincode to fill the address.`
                        : undefined
                }
              />
              <Input
                label="Registration / CIN No." type="text"
                placeholder="Corporate identification number"
                value={form.cin}
                onChange={e => setFieldChecked('cin', e.target.value)}
                onBlur={e => handleBlur('cin', e.target.value)}
                error={fieldErrors.cin}
                wrapperClassName="mb-0"
              />
            </div>

            {isVendorEntrance ? (
              <Input
                label="Udyam / MSME No." type="text" className="mt-4"
                placeholder="Udyam registration number"
                value={form.udyam}
                onChange={e => setFieldChecked('udyam', e.target.value)}
                onBlur={e => handleBlur('udyam', e.target.value)}
                error={fieldErrors.udyam}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Input
                  label="Udyam No." type="text"
                  placeholder="Udyam registration number"
                  value={form.udyam}
                  onChange={e => setFieldChecked('udyam', e.target.value)}
                  onBlur={e => handleBlur('udyam', e.target.value)}
                  error={fieldErrors.udyam}
                  wrapperClassName="mb-0"
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
                label={isVendorEntrance ? 'IEC Code' : 'ISI code'} required type="text"
                placeholder={isVendorEntrance ? 'IEC Code' : 'ISI code'}
                value={isVendorEntrance ? form.iec : form.isi}
                onChange={e => setFieldChecked(isVendorEntrance ? 'iec' : 'isi', e.target.value)}
                onBlur={isVendorEntrance ? (e => handleBlur('iec', e.target.value)) : undefined}
                error={isVendorEntrance ? fieldErrors.iec : undefined}
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
                label="Swift/Bank account number" required type="text"
                placeholder="Account number"
                value={form.bankAccountNumber}
                onChange={e => setFieldChecked('bankAccountNumber', e.target.value)}
                onBlur={e => handleBlur('bankAccountNumber', e.target.value)}
                error={fieldErrors.bankAccountNumber}
                wrapperClassName="mb-0"
              />
              <Input
                label="SWIFT/BIC/IFSC Code" required type="text"
                placeholder="IFSC code"
                value={form.bankIfsc}
                onChange={e => setFieldChecked('bankIfsc', e.target.value)}
                onBlur={e => handleBlur('bankIfsc', e.target.value)}
                error={fieldErrors.bankIfsc}
                wrapperClassName="mb-0"
              />
            </div>
          </div>
        )}
      </div>

      <Input
        label="Pincode" required type="text" className="mt-4"
        placeholder="e.g. 122001" inputMode="numeric" maxLength={6}
        value={form.pincode}
        onChange={e => handlePincodeChange(e.target.value)}
        onBlur={e => handleBlur('pincode', e.target.value)}
        error={fieldErrors.pincode}
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
        <PhoneField
          label="Owner / Director phone"
          value={form.ownerPhone}
          country={form.country}
          onChange={v => setFieldChecked('ownerPhone', v)}
          onBlur={v => handleBlur('ownerPhone', v)}
          error={fieldErrors.ownerPhone}
          wrapperClassName="mb-0"
        />
      </div>

      <Input
        label="Owner / Director email" type="email" className="mt-4"
        placeholder="owner@company.com"
        value={form.ownerEmail}
        onChange={e => setFieldChecked('ownerEmail', e.target.value)}
        onBlur={e => handleBlur('ownerEmail', e.target.value)}
        error={fieldErrors.ownerEmail}
      />

      <div className="mb-4 mt-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Product categories <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-stone-400 mb-2.5">
          Select all categories your business supplies
        </p>
        <CategoryMultiSelect
          categories={[...categories, { id: OTHER_CAT_ID, name: 'Others' }]}
          selectedCats={selectedCats}
          toggleCat={toggleCat}
        />

        {selectedCats.includes(OTHER_CAT_ID) && (
          <Input
            label="Please specify other category" required type="text" className="mt-3"
            placeholder="e.g. Pet Supplies, Stationery"
            value={form.categoryOther}
            onChange={e => setField('categoryOther', e.target.value)}
          />
        )}
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
      <NdaAgreementText
        businessName={form.businessName}
        address={form.address}
        className="max-h-64 overflow-y-auto text-xs text-stone-600 leading-relaxed border border-stone-200 rounded-xl p-4 mb-3 bg-stone-50"
      />

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
        {!publicEntry && (
          <button type="button" onClick={onBack} className="text-sm text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0 mt-1">
            ← Back
          </button>
        )}
      </div>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        Tell us about yourself and your company.
      </p>

      <div className="flex gap-1 mb-6">
        {SUPPLIER_TABS.map(t => {
          const isActive = activeTab === t.key
          const done = tabComplete[t.key]
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`
                flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap
                flex items-center justify-center gap-1.5 cursor-pointer border
                ${isActive
                  ? 'bg-white text-stone-900 shadow-sm border-stone-200'
                  : done
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'text-stone-500 hover:text-stone-700 border-transparent'}
              `}
            >
              <span className={`
                flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold flex-shrink-0
                ${isActive ? 'bg-stone-900 text-white' : done ? 'bg-green-600 text-white' : 'bg-stone-200 text-stone-600'}
              `}>
                {done ? (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5 4.5 9 10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : t.step}
              </span>
              {t.label}
            </button>
          )
        })}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="h-[480px] overflow-y-auto pr-1">
        {activeTab === 'personal' && personalFields}
        {activeTab === 'business' && businessFields}
        {activeTab === 'agreement' && agreementFields}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4">
        <Button type="button" variant="secondary" className="py-3" disabled={isFirstTab} onClick={goPrev}>
          ← Previous
        </Button>

        {isLastTab ? (
          <Button type="button" variant="primary" loading={submitting} className="py-3" onClick={onSubmit}>
            Submit for review
          </Button>
        ) : (
          <Button type="button" variant="primary" className="py-3" onClick={goNext}>
            Next →
          </Button>
        )}
      </div>
      {publicEntry && (
        <p className="text-center text-sm text-stone-500 mt-5">
          Already have an account?{' '}
          <button type="button" onClick={() => navigate('/auth')} className="text-[#4d68f0] font-medium hover:underline">
            Sign in
          </button>
        </p>
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

// Draft is kept in sessionStorage so a page refresh mid-form doesn't drop the
// user back to step 1 with an empty form.
const DRAFT_KEY = 'twif-vendor-onboarding-draft'

function emptyForm(email) {
  return {
    orgEmail: email || '',
    fullName: '', phone: '', country: '', businessName: '', titleRole: '',
    website: '', employees: '', retailerType: '', supplierType: '', supplierTypeOther: '', registration: '',
    cin: '', udyam: '', msme: '', isi: '', iec: '', bankAccountNumber: '', bankIfsc: '',
    pincode: '', address: '', ownerName: '', ownerEmail: '', ownerPhone: '',
    logoUrl: '', categoryOther: '', ndaSignatureName: '', signatureMode: 'type', ndaSignatureImage: '',
  }
}

function loadDraft(email, publicEntry) {
  try {
    const snap = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    if (!snap || ![1, 2].includes(snap.step)) return null
    if (publicEntry && snap.publicEntry) return snap
    if (!email || snap.email !== email) return null
    return snap
  } catch {
    return null
  }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

// ─── Main OnboardingPage ───────────────────────────────────────
const OTP_LENGTH = 8

function PublicOtpGate({ email, onVerified, onCancel, verifying, error }) {
  const { secondsLeft, canResend, resending, resendError, resend } = useOTPTimer(email, 'signup')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-center text-sm font-bold tracking-[0.18em] text-[#4d68f0] uppercase mb-3">
          Verify email
        </h2>
        <p className="text-center text-sm text-stone-500 leading-relaxed mb-4">
          We sent an {OTP_LENGTH}-digit code to{' '}
          <strong className="text-stone-900 font-medium">{email}</strong>
        </p>
        {(error || resendError) && <Alert type="error">{error || resendError}</Alert>}
        <OTPInput length={OTP_LENGTH} onComplete={onVerified} hasError={!!error} disabled={verifying} />
        {verifying && (
          <div className="flex justify-center mb-3">
            <Spinner light={false} size="w-5 h-5" />
          </div>
        )}
        <div className="text-center text-sm text-stone-500 mt-2">
          {canResend ? (
            <span>
              Didn't receive it?{' '}
              <button
                type="button"
                onClick={resend}
                disabled={resending || verifying}
                className="text-[#4d68f0] font-medium hover:underline disabled:opacity-50"
              >
                {resending ? 'Sending…' : 'Resend code'}
              </button>
            </span>
          ) : (
            <span>
              Resend code in <strong className="text-stone-900">{secondsLeft}s</strong>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 w-full text-sm text-stone-400 hover:text-stone-700"
        >
          ← Back to form
        </button>
      </div>
    </div>
  )
}

// ─── Main OnboardingPage ───────────────────────────────────────
export default function OnboardingPage({ forcedRole: routeForcedRole, publicEntry = false }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { email, pendingReview, forcedRole: stateForcedRole } = state || {}
  // Route prop wins — /auth/vendor/onboarding_vendor always knows its role,
  // regardless of whether history state carried it through correctly.
  const forcedRole = routeForcedRole || stateForcedRole

  // A saved draft (from a refresh) wins over the default entry step — but never
  // in pendingReview mode, which is a deliberate deep-link to the status screen.
  const [draft] = useState(() => (pendingReview ? null : loadDraft(email, publicEntry)))

  // Public website link opens the vendor form immediately (step 2).
  // forcedRole (from /auth/buyer or /auth/vendor) skips the role picker —
  // land straight on the org-lookup step with the role already decided.
  const [step, setStep] = useState(
    draft?.step ?? (pendingReview ? 3 : publicEntry ? 2 : (forcedRole ? 1 : 0))
  )
  const [role, setRole] = useState(forcedRole || draft?.role || 'buyer')
  // The /auth/vendor entrance has its own field set (Title/Role, IEC code,
  // required Phone, Company Name moved to Business Info, no MSME No.)
  const isVendorEntrance = forcedRole === 'supplier'
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES)
  const [selectedCats, setSelectedCats] = useState(draft?.selectedCats ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [pendingType, setPendingType] = useState('new') // 'join' | 'claim' | 'new'
  const [showPreview, setShowPreview] = useState(false)
  const [showOtpGate, setShowOtpGate] = useState(false)
  const [otpEmail, setOtpEmail] = useState('')
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')

  const [form, setFormState] = useState(
    draft?.form ? { ...emptyForm(email), ...draft.form } : emptyForm(email)
  )

  const [ndaChecks, setNdaChecks] = useState(
    draft?.ndaChecks ?? { read: false, authorized: false }
  )

  // Persist the in-progress draft on every change; drop it once the flow leaves
  // the form (submitted → step 3, or handled elsewhere).
  useEffect(() => {
    if (pendingReview) return
    const keyEmail = email || (publicEntry ? (form.orgEmail || 'public') : '')
    if (!keyEmail) return
    if (![1, 2].includes(step)) { clearDraft(); return }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        email: keyEmail, publicEntry: !!publicEntry, step, role, form, selectedCats, ndaChecks,
      }))
    } catch { /* quota / disabled storage — draft just won't persist */ }
  }, [email, step, role, form, selectedCats, ndaChecks, pendingReview, publicEntry])

  const [suggestedOrg, setSuggestedOrg] = useState(null) // user picked from name suggestions

  const { result, loading: lookupLoading, error: lookupError, lookup, reset } = useOrgLookup()

  // forcedRole entrances skip RoleStep — trigger the domain lookup ourselves
  // on mount instead of it happening via the (skipped) "Continue" click.
  useEffect(() => {
    if (publicEntry) return
    if (forcedRole && email) lookup(email, forcedRole, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedRole, email, publicEntry])

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
  // Public vendor link skips this — visitors land on the form without OTP first.
  useEffect(() => {
    if (publicEntry || authLoading) return
    if (!email && !session) navigate('/auth', { replace: true })
  }, [email, session, authLoading, navigate, publicEntry])

  // Guard: already onboarded AND approved → send to dashboard
  // Skip for public vendor registration (website button) and pendingReview.
  useEffect(() => {
    if (publicEntry) return
    if (!pendingReview && profileFetched && portalUser?.onboarding_completed) {
      navigate('/dashboard', { replace: true })
    }
  }, [pendingReview, profileFetched, portalUser, navigate, publicEntry])

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

  // Returns an error message, or '' when the form is ready to submit.
  function validateOrg() {
    if (publicEntry && !isValidEmail(form.orgEmail)) return 'Work email is required'
    if (!form.fullName.trim()) return 'Full name is required'
    if (!form.country) return 'Country is required'
    if (!form.businessName.trim()) return 'Company name is required'
    if (!form.employees) return 'Number of employees is required'
    if (role === 'supplier' && selectedCats.length === 0) return 'Please select at least one product category'
    if (selectedCats.includes(OTHER_CAT_ID) && !form.categoryOther.trim()) return 'Please specify your other product category'
    if (form.website && !isValidUrl(form.website)) return 'Website must start with https://'
    if (role === 'supplier') {
      if (!form.registration.trim()) return 'GST No. is required'
      if (isVendorEntrance) {
        if (!form.phone.trim()) return 'Phone is required'
        if (!form.titleRole.trim()) return 'Title / Role is required'
        if (!form.iec.trim()) return 'IEC No. is required'
      } else if (!form.isi.trim()) {
        return 'ISI code is required'
      }
      if (!form.bankAccountNumber.trim()) return 'Bank account number is required'
      if (!form.bankIfsc.trim()) return 'IFSC code is required'
      if (form.pincode.trim().length !== 6) return 'A valid 6-digit pincode is required'
      if (!form.address.trim()) return 'Address is required'
      if (!form.ownerName.trim()) return 'Owner / Director name is required'
      if (!NDA_DECLARATIONS.every(d => ndaChecks[d.key])) return 'Please accept all NDA declarations to continue'
      if (form.signatureMode === 'type' && !form.ndaSignatureName.trim()) {
        return 'Please type your full legal name to sign the NDA'
      }
      if ((form.signatureMode === 'draw' || form.signatureMode === 'upload') && !form.ndaSignatureImage) {
        return form.signatureMode === 'draw' ? 'Please draw your signature' : 'Please upload your signature'
      }
    }
    return ''
  }

  // "Submit for review" — validate, then open the preview/confirm modal.
  function handleReviewSubmit() {
    const err = validateOrg()
    if (err) return setSubmitError(err)
    setSubmitError('')
    setShowPreview(true)
  }

  // Called by the modal's "Confirm & submit".
  async function handleCreateOrg(sessionOverride) {
    const err = validateOrg()
    if (err) return setSubmitError(err)

    setSubmitting(true)
    setSubmitError('')
    try {
      if (!supabase) throw new Error(supabaseConfigMessage)
      let session = (sessionOverride && sessionOverride.access_token) ? sessionOverride : null
      if (!session) {
        const { data } = await supabase.auth.getSession()
        session = data.session
      }

      if (!session) {
        const workEmail = form.orgEmail.trim().toLowerCase()
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: workEmail,
          options: { shouldCreateUser: true },
        })
        if (otpError) throw otpError
        setOtpEmail(workEmail)
        setOtpError('')
        setShowOtpGate(true)
        return
      }

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
          categories: selectedCats.filter(id => id !== OTHER_CAT_ID),
          ...(selectedCats.includes(OTHER_CAT_ID) && form.categoryOther.trim()
            ? { category_other: form.categoryOther.trim() }
            : {}),
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
      if (!currentUser?.id) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.id) {
          await supabase.from('portal_users').upsert(
            { id: user.id, email: user.email },
            { onConflict: 'id', ignoreDuplicates: true },
          )
          await supabase.from('portal_users').update({ onboarding_completed: true }).eq('id', user.id)
        }
      }
      setShowPreview(false)
      setShowOtpGate(false)
      setPendingType('new')
      setStep(3)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePublicOtpComplete(code) {
    setOtpError('')
    setOtpVerifying(true)
    try {
      if (!supabase) throw new Error(supabaseConfigMessage)
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: code,
        type: 'email',
      })
      if (verifyError) throw verifyError
      setCurrentUser(data.user)
      setShowOtpGate(false)
      await handleCreateOrg(data.session)
    } catch (err) {
      const msg = err.message?.toLowerCase() || ''
      setOtpError(
        msg.includes('expired') || msg.includes('invalid')
          ? 'Incorrect or expired code. Please try again.'
          : err.message || 'Verification failed. Please try again.'
      )
    } finally {
      setOtpVerifying(false)
    }
  }

  const workEmail = email || form.orgEmail
  const logoSuffix = forcedRole === 'buyer' ? 'New Buyer Registration' : forcedRole === 'supplier' ? 'New Vendor Registration' : undefined

  // No router state: unauthenticated → will redirect to /auth via effect above.
  // Public vendor link has no router email — skip the spinner and show the form.
  if (!email && !publicEntry) {
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
          onBack={async () => {
            setSuggestedOrg(null)
            // forcedRole flows never show the role picker — exit straight back
            // to the entrance page they came from instead of showing step 0.
            if (forcedRole) {
              // Leaving the flow entirely — discard the saved draft.
              clearDraft()
              // OTP is already verified here, so the session is live — without
              // signing out, AuthPage's redirect guard bounces the user right
              // back to this page. The next email submit signs out anyway.
              if (supabase) await supabase.auth.signOut({ scope: 'local' })
              navigate(`/auth/${forcedRole === 'buyer' ? 'buyer' : 'vendor'}`, { state: { email } })
            } else {
              setStep(0)
            }
          }}
          submitting={submitting}
        />
      )}

      {step === 2 && (
        <CreateOrgStep
          role={role}
          isVendorEntrance={isVendorEntrance}
          publicEntry={publicEntry}
          form={form}
          setField={setField}
          categories={categories}
          selectedCats={selectedCats}
          toggleCat={toggleCat}
          ndaChecks={ndaChecks}
          toggleNdaCheck={toggleNdaCheck}
          error={showPreview ? '' : submitError}
          submitting={submitting}
          onSubmit={handleReviewSubmit}
          onBack={publicEntry ? undefined : () => setStep(1)}
        />
      )}

      {step === 2 && (
        <ApplicationPreviewModal
          open={showPreview}
          data={{
            form,
            isVendorEntrance,
            email: workEmail,
            role,
            categoryNames: [
              ...categories.filter(c => selectedCats.includes(c.id)).map(c => c.name),
              ...(selectedCats.includes(OTHER_CAT_ID) && form.categoryOther.trim()
                ? [form.categoryOther.trim()]
                : []),
            ],
          }}
          submitting={submitting}
          error={submitError}
          onClose={() => setShowPreview(false)}
          onConfirm={() => handleCreateOrg()}
        />
      )}

      {step === 3 && (
        <PendingStep email={workEmail} pendingType={pendingType} />
      )}

      {showOtpGate && (
        <PublicOtpGate
          email={otpEmail}
          verifying={otpVerifying}
          error={otpError}
          onVerified={handlePublicOtpComplete}
          onCancel={() => { setShowOtpGate(false); setOtpError('') }}
        />
      )}
    </AuthShell>
  )
}