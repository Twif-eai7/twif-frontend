import ComingSoon from '../ComingSoon'
import FmsTracker from '../../../components/flowManagement/FmsTracker'
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole } from '../../../stores/profileStore'
import { useTabGuard } from '../../../hooks/useTabGuard'

// Sheet IDs — swap in your real Google Sheet document IDs
const FMS1_SHEET_ID = '10LRUVkCIvu26h12XiFT5c0CLzxbxNdtY4KLGS3sRxk4'
const FMS2_SHEET_ID = '1rsa5wqm2UH5YgPOaJj0b8KxNXUORKKsdwIQ_WleeQXg'
const FMS3_SHEET_ID = '1CtPTfF0YJBPR_UxhfVRqKyFIX8Nne4K3M0dtyc4W8Pk'
const FMS4_SHEET_ID = '1rcxRHF2wV6AZi5InLL25t_IJMpew7LdTI4L6B10AjhY'


export default function FmsSection() {
    const role = useRole()
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const tab = params.get('tab')

    useTabGuard('fms', tab, '/dashboard/fms')

    const DEFAULT_TAB = {
        Merchant: 'fms1',
    }

    // Redirect to default tab so the sidebar NavLink is highlighted
    useEffect(() => {
        if (!tab && role) {
            const def = DEFAULT_TAB[role]
            if (def) navigate(`/dashboard/fms?tab=fms1`, { replace: true })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab])

    if (role === 'Merchant') {
        if (tab === 'fms1') return (
            <FmsTracker
                sheetId={FMS1_SHEET_ID}
                gid={663292535}
                title="FMS1"
            />
        )
        if (tab === 'fms2') return (
            <FmsTracker
                sheetId={FMS2_SHEET_ID}
                gid={663292535}
                title="FMS2"
            />
        )
        if (tab === 'fms3') return (
            <FmsTracker
                sheetId={FMS3_SHEET_ID}
                gid={663292535}
                title="FMS3"
            />
        )
        if (tab === 'fms4') return (
            <FmsTracker
                sheetId={FMS4_SHEET_ID}
                gid={663292535}
                title="FMS4"
            />
        )
        if (tab) return <ComingSoon />
        return null // briefly null while redirect fires
    }
}