import { useState, useCallback } from 'react'
import { supabase, supabaseConfigMessage } from '../lib/supabase'
import { extractDomain } from '../utils/validators'

/**
 * useOrgLookup
 *
 * Step 1: Domain-based lookup — fast, exact match on org.domain
 * Step 2: If domain lookup returns { found: false }, automatically run
 *         a name-based fuzzy search so ERP orgs without domains can still
 *         be found. Surfaces as { found: false, nameSuggestions: [...] }
 *
 * Returns:
 *   { found: false }                                      no match, no suggestions
 *   { found: false, nameSuggestions: [...] }              no domain match, but name hits
 *   { found: true, pendingApproval: true, org }           org exists but mid-approval
 *   { found: true, claimable: true, org }                 org exists, no members yet
 *   { found: true, alreadyMember: true, org }             already a member
 *   { found: true, alreadyRequested: true, ... }          join request pending
 *   { found: true, org }                                  normal join path
 */
export function useOrgLookup() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const lookup = useCallback(async (email, role, companyName = '') => {
    setLoading(true)
    setResult(null)
    setError('')

    try {
      if (!supabase) throw new Error(supabaseConfigMessage)
      const domain = extractDomain(email)
      const { data: { session } } = await supabase.auth.getSession()
      const authHeader = { Authorization: `Bearer ${session?.access_token}` }
      const BASE = import.meta.env.VITE_BACKEND_URL

      // ── Step 1: Domain lookup ────────────────────────────────
      const domainParams = new URLSearchParams({ domain, type: role, email })
      const domainRes = await fetch(
        `${BASE}/org-customers/org-lookup?${domainParams}`,
        { headers: authHeader }
      )

      if (!domainRes.ok) {
        const data = await domainRes.json()
        throw new Error(data.error || 'Lookup failed')
      }

      const domainData = await domainRes.json()

      // Domain match found — return it directly, no need for name search
      if (domainData.found) {
        setResult(domainData)
        return domainData
      }

      // ── Step 2: Name-based fuzzy search ──────────────────────
      // Use company name if provided, otherwise fall back to the
      // local part of the email as a rough heuristic
      const searchTerm = companyName.trim() ||
        email.split('@')[0].replace(/[._-]/g, ' ')

      if (searchTerm.length >= 2) {
        const nameParams = new URLSearchParams({ q: searchTerm, type: role })
        const nameRes = await fetch(
          `${BASE}/org-customers/org-name-search?${nameParams}`,
          { headers: authHeader }
        )

        if (nameRes.ok) {
          const nameData = await nameRes.json()
          if (nameData.data?.length > 0) {
            const combined = {
              found: false,
              nameSuggestions: nameData.data,
            }
            setResult(combined)
            return combined
          }
        }
      }

      // Nothing found at all
      setResult({ found: false })
      return { found: false }

    } catch (err) {
      setError(err.message || 'Could not check organisation. Please try again.')
      setResult({ found: false })
      return { found: false }
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError('')
  }, [])

  return { result, loading, error, lookup, reset }
}