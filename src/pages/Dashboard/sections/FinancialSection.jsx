import ComingSoon from '../ComingSoon';
import InvoiceList from '../../../components/financial/InvoiceList';
import Invoice from '../../../components/financial/Invoice';
import QualityClaimsSummary from '../../../components/financial/Claims';
import WeeklyPoSchedule from '../../../components/financial/WeeklyPoSchedule';
import ExpensesEbidta from '../../../components/financial/ExpensesEbidta';
import ExpensesSummary from '../../../components/financial/ExpensesSummary';
import { PlWeeklySummary, PlMonthlySummary } from '../../../components/financial/PlDataSummary';
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole, useProfileStore } from '../../../stores/profileStore'
import { useAuthStore } from '../../../stores/authStore'
import { canAccessJnmPlFeatures } from '../../../utils/jnmAccess'
import { useTabGuard } from '../../../hooks/useTabGuard'

export default function FinanceSection() {
    const role = useRole()
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const tab = params.get('tab')
    const userEmail = useAuthStore((s) => s.session?.user?.email)
    const orgMembership = useProfileStore((s) => s.orgMembership)
    const hasJnmPlAccess = canAccessJnmPlFeatures(userEmail, orgMembership)

    useTabGuard('financial', tab, '/dashboard/financial')

    const DEFAULT_TAB = {
        Merchant: 'invoice-list',
        Buyer: 'invoice-list',
    }
    // Redirect to default tab so the sidebar NavLink is highlighted
    useEffect(() => {
        if (!tab && role) {
            const def = DEFAULT_TAB[role]
            if (def) navigate(`/dashboard/financial?tab=invoice-list`, { replace: true })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab])

    const jnmOnlyTabs = ['expenses-ebidta', 'expenses-ebidta-summary', 'pl-weekly', 'pl-monthly']
    useEffect(() => {
        if (jnmOnlyTabs.includes(tab) && !hasJnmPlAccess) {
            navigate('/dashboard/financial?tab=weekly-po', { replace: true })
        }
    }, [tab, hasJnmPlAccess, navigate])

    if (role === 'Merchant') {
        if (tab === 'invoice-list') return <InvoiceList />
        if (tab === 'invoice-form') return <Invoice />
        if (tab === 'claims') return <QualityClaimsSummary />
        if (tab === 'weekly-po') return <WeeklyPoSchedule />
        if (tab === 'pl-weekly') {
            if (!hasJnmPlAccess) return null
            return <PlWeeklySummary />
        }
        if (tab === 'pl-monthly') {
            if (!hasJnmPlAccess) return null
            return <PlMonthlySummary />
        }
        if (tab === 'expenses-ebidta') {
            if (!hasJnmPlAccess) return null
            return <ExpensesEbidta />
        }
        if (tab === 'expenses-ebidta-summary') {
            if (!hasJnmPlAccess) return null
            return <ExpensesSummary />
        }
        if (tab) return <ComingSoon />
        return null // briefly null while redirect fires
    }
}