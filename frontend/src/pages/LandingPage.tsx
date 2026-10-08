import { Link } from 'react-router-dom'
import { Brand, Navbar } from '../components/layout'

const roles = [
  { title: 'Applicant', description: 'Create applications, submit documents and follow progress.', to: '/applicant/login', icon: '01' },
  { title: 'Officer', description: 'Review assigned applications and monitor deadlines.', to: '/officer/login', icon: '02' },
  { title: 'General Officer', description: 'Review cases escalated by department officers.', to: '/general-officer/login', icon: '03' },
  { title: 'Human Verifier', description: 'Review documents held for human verification.', to: '/human-verifier/login', icon: '04' },
  { title: 'Admin', description: 'View the cross-department administrative overview.', to: '/admin/auth', icon: '05' },
]

export function LandingPage() {
  return (
    <div className="landing-page">
      <Navbar />
      <main>
        <section className="hero-section">
          <div className="hero-section__copy">
            <p className="eyebrow"><span className="eyebrow__dot" /> DIGITAL PUBLIC SERVICES</p>
            <h1>Public services,<br /><em>made clearer.</em></h1>
            <p className="hero-section__lead">e-Governance brings application submissions, document processing, department routing and case progress into one transparent service.</p>
            <div className="hero-section__actions"><Link className="button button--primary button--large" to="/applicant/register">Create an account <span aria-hidden="true">→</span></Link><Link className="button button--secondary button--large" to="/applicant/login">Applicant login</Link></div>
            <p className="hero-section__footnote">Email and password sign-in</p>
          </div>
          <div className="hero-art" aria-label="Illustration of an application moving through review" role="img">
            <div className="hero-art__orb hero-art__orb--one" /><div className="hero-art__orb hero-art__orb--two" />
            <div className="flow-card flow-card--document"><span className="flow-card__file">▤</span><div><strong>Application</strong><small>Documents submitted</small></div><span className="flow-check">✓</span></div>
            <div className="flow-line"><span /></div>
            <div className="flow-card flow-card--review"><span className="flow-card__avatar">R</span><div><strong>Department review</strong><small>Progress in view</small></div></div>
            <div className="hero-art__caption"><span className="caption-line" /> A connected service journey</div>
          </div>
        </section>
        <section className="role-section">
          <div className="section-heading"><div><p className="eyebrow">GET STARTED</p><h2>Choose a service area</h2></div><p>Each role has a focused view of the application process.</p></div>
          <div className="role-grid">{roles.map((role) => <Link className="role-card" to={role.to} key={role.title}><span className="role-card__number">{role.icon}</span><span className="role-card__arrow" aria-hidden="true">↗</span><h3>{role.title}</h3><p>{role.description}</p><span className="role-card__link">Continue <span aria-hidden="true">→</span></span></Link>)}</div>
        </section>
        <section className="journey-section"><div className="journey-section__title"><p className="eyebrow">THE JOURNEY</p><h2>One process.<br /><em>Clear at every step.</em></h2><p>From submission to outcome, see where a case is and what stage comes next.</p></div><div className="journey-steps"><div><span>01</span><strong>Submit</strong><small>Application and documents</small></div><i aria-hidden="true">→</i><div><span>02</span><strong>Route</strong><small>Department determined from content</small></div><i aria-hidden="true">→</i><div><span>03</span><strong>Review</strong><small>Officer processing and deadlines</small></div><i aria-hidden="true">→</i><div><span>04</span><strong>Resolve</strong><small>Escalation when required</small></div></div></section>
      </main>
      <footer className="landing-footer"><Brand /><span>Public services, delivered with clarity.</span><Link to="/applicant/login">Sign in <span aria-hidden="true">→</span></Link></footer>
    </div>
  )
}
