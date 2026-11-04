import Sidebar from '../../components/ui/Sidebar'
import Header from '../../components/ui/Header'
import Article3dSection from './sections/Article3dSection'
import { useProfileStore } from '../../stores/profileStore'

// Local-only stand-in so the dashboard chrome can render without a session.
useProfileStore.setState({
  orgMembership: {
    orgType: 'merchant',
    orgName: 'eai7',
    orgDisplayName: 'eai7',
    role: 'member',
    fullName: 'Tech',
    department: 'tech',
    allowedModules: null,
  },
  profileHeader: {
    name: 'Tech',
    businessName: 'eai7',
    businessLogo: null,
    role: 'Merchant',
    initials: 'T',
  },
  profileFetched: true,
  profileLoading: false,
})

export default function Article3dPreview() {
  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8f8f8]">
      <Sidebar role="Merchant" allowedModules={null} collapsed={false} mobileOpen={false} />
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
        <Header
          dept="tech"
          profile={{ name: 'Tech', businessName: 'eai7', initials: 'T' }}
          onLogout={() => {}}
        />
        <section className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full h-full flex flex-col">
            <Article3dSection />
          </div>
        </section>
      </main>
    </div>
  )
}
