import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { UserArea } from '../types'

const areaConfig: Record<UserArea, { label: string; links: { label: string; to: string }[] }> = {
  applicant: { label: 'Applicant', links: [{ label: 'My applications', to: '/applicant' }, { label: 'Create application', to: '/applicant/applications/new' }] },
  officer: { label: 'Officer', links: [{ label: 'Application queue', to: '/officer' }] },
  'general-officer': { label: 'General Officer', links: [{ label: 'Escalated cases', to: '/general-officer' }] },
  'human-verifier': { label: 'Human Verifier Officer', links: [{ label: 'Human verification', to: '/human-verifier' }] },
  admin: { label: 'Admin', links: [{ label: 'Overview', to: '/admin' }] },
}

export function Brand({ light = false }: { light?: boolean }) {
  return <Link className={`brand ${light ? 'brand--light' : ''}`} to="/" aria-label="e-Governance home"><span className="brand__mark" aria-hidden="true">E</span><span>e-Governance</span></Link>
}

export function Navbar({ area }: { area?: UserArea }) {
  return (
    <header className="topbar">
      <Brand />
      <div className="topbar__right">
        {area && <span className="role-chip">{areaConfig[area].label}</span>}
        <Link className="topbar__home" to="/">Home</Link>
      </div>
    </header>
  )
}

export function DashboardLayout({ area, title, children }: { area: UserArea; title: string; children: ReactNode }) {
  const config = areaConfig[area]
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleLogout() {
    setSigningOut(true)
    setSignOutError('')
    try {
      await logout()
      navigate('/applicant/login', { replace: true })
    } catch (reason) {
      setSignOutError(reason instanceof Error ? reason.message : 'Unable to sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="app-shell">
      <Navbar area={area} />
      <div className="dashboard-layout">
        <aside className="sidebar">
          <div className="sidebar__role"><span className="avatar" aria-hidden="true">{config.label.charAt(0)}</span><div><strong>{config.label} services</strong><small>Government service portal</small></div></div>
          <p className="sidebar__caption">SERVICES</p>
          <nav aria-label={`${config.label} navigation`} className="sidebar__nav">
            {config.links.map((link) => <NavLink key={link.to} to={link.to} end={link.to === '/applicant' || link.to === '/officer' || link.to === '/general-officer' || link.to === '/admin'} className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}><span aria-hidden="true">◫</span>{link.label}</NavLink>)}
          </nav>
          <div className="sidebar__footer">
            {signOutError && <p role="alert" className="form-error">{signOutError}</p>}
            <button className="button button--quiet button--small" type="button" disabled={signingOut} onClick={() => void handleLogout()}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
            <Link to="/">← Back to service selection</Link>
          </div>
        </aside>
        <main className="dashboard-main" id="main-content">
          <div className="mobile-workspace-label">{title}</div>
          {children}
        </main>
      </div>
    </div>
  )
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-page"><Navbar /><main className="auth-main">{children}</main><footer className="site-footer">e-Governance · Public service portal</footer></div>
}
