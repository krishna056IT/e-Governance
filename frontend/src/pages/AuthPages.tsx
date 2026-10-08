import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { roleHomePath, useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/layout'
import { Field } from '../components/ui'
import { AuthApiError, authService } from '../services/authService'
import { officerRegistrationService } from '../services/officerRegistrationService'
import type { UserArea, UserRole } from '../types'

const roleNames: Record<Exclude<UserArea, 'applicant'>, string> = {
  officer: 'Officer',
  'general-officer': 'General Officer',
  'human-verifier': 'Human Verifier Officer',
  admin: 'Admin',
}

function officerRegistrationError(reason: unknown) {
  if (!(reason instanceof AuthApiError)) {
    return reason instanceof Error
      ? reason.message
      : 'Unable to process the request right now. Please try again.'
  }
  if (reason.status >= 500) return 'Unable to process the request right now. Please try again.'
  if (reason.status === 401) return 'You are not authorized to submit this request.'
  if (reason.status === 403) {
    return reason.message === 'This Government Officer ID is inactive.'
      ? reason.message
      : 'You are not authorized to submit this request.'
  }
  if (reason.status === 404) {
    return reason.message === 'Government Officer ID was not found.'
      ? reason.message
      : 'Unable to process the request right now. Please try again.'
  }
  if (reason.status === 409) {
    if (/awaiting administrator approval|already pending/i.test(reason.message)) {
      return 'Your registration is already awaiting administrator approval.'
    }
    if (/already has an account|account already exists/i.test(reason.message)) {
      return 'This officer already has an account.'
    }
  }
  return reason.message
}

export function ApplicantLoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const data = new FormData(event.currentTarget)

    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')

    setError('')
    setLoading(true)

    try {
      const user = await login(email, password)
      navigate(roleHomePath(user.role), { replace: true })
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Login failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <Link className="back-link" to="/">
          ← Home
        </Link>

        <p className="eyebrow">APPLICANT ACCESS</p>

        <h1>Welcome back</h1>

        <p className="auth-card__intro">
          Sign in to view your applications and their progress.
        </p>

        {error && (
          <p className="form-alert form-alert--error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <Field
            label="Email address"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />

          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />

          <button
            className="button button--primary button--full"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
            {!loading && <span aria-hidden="true"> →</span>}
          </button>
        </form>

        <p className="auth-switch">
          New to e-Governance?{' '}
          <Link to="/applicant/register">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

export function ApplicantRegistrationPage() {
  const navigate = useNavigate()
  const { register } = useAuth()

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const data = new FormData(event.currentTarget)

    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    const confirmPassword = String(
      data.get('confirmPassword') ?? '',
    )
    const displayName = String(
      data.get('displayName') ?? '',
    )

    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const user = await register(email, password, displayName)
      navigate(roleHomePath(user.role), { replace: true })
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Registration failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <Link className="back-link" to="/">
          ← Home
        </Link>

        <p className="eyebrow">APPLICANT ACCESS</p>

        <h1>Create account</h1>

        <p className="auth-card__intro">
          Use your email and password to begin an application.
        </p>

        {error && (
          <p className="form-alert form-alert--error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <Field
            label="Full name"
            type="text"
            name="displayName"
            autoComplete="name"
            placeholder="Your full name"
            required
          />

          <Field
            label="Email address"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />

          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
          />

          <Field
            label="Confirm password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
          />

          <button
            className="button button--primary button--full"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create account'}
            {!loading && <span aria-hidden="true"> →</span>}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/applicant/login">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

export function StaffLoginPage({
  area,
}: {
  area: Exclude<UserArea, 'applicant'>
}) {
  const navigate = useNavigate()
  const { login, logout } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const title = roleNames[area]
  const expectedRoles: Record<Exclude<UserArea, 'applicant'>, UserRole[]> = {
    officer: ['OFFICER'],
    'general-officer': ['GENERAL_OFFICER'],
    'human-verifier': ['HUMAN_VERIFIER'],
    admin: ['ADMIN'],
  } as const

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const identifier = String(data.get('identifier') ?? '')
    const password = String(data.get('password') ?? '')

    setError('')
    setLoading(true)
    try {
      const user = await login(identifier, password)
      if (!expectedRoles[area].includes(user.role)) {
        await logout()
        setError(`This account does not have access to the ${title} workspace.`)
        return
      }
      navigate(roleHomePath(user.role), { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <Link className="back-link" to="/">
          ← Choose another workspace
        </Link>

        <p className="eyebrow">
          {title.toUpperCase()} ACCESS
        </p>

        <h1>
          {area === 'admin'
            ? 'Admin authentication'
            : `${title} sign in`}
        </h1>

        <p className="auth-card__intro">
          {area === 'officer'
            ? 'Sign in with your Government Officer ID and password.'
            : 'Sign in with the email and password associated with your account.'}
        </p>

        {error && (
          <p className="form-alert form-alert--error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <Field
            label={area === 'officer' ? 'Government Officer ID or email' : 'Email address'}
            type={area === 'officer' ? 'text' : 'email'}
            name="identifier"
            autoComplete={area === 'officer' ? 'username' : 'email'}
            placeholder={area === 'officer' ? 'REV-001' : undefined}
            required
          />

          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />

          <button
            className="button button--primary button--full"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {area === 'officer' && (
          <p className="auth-switch">
            Need an Officer account?{' '}
            <Link to="/officer/access">Check registration status</Link>
          </p>
        )}
        {area === 'human-verifier' && (
          <p className="auth-switch">
            Need a Human Verifier account?{' '}
            <Link to="/human-verifier/register">Register for admin approval</Link>
            <br />
            Already registered? <Link to="/human-verifier/access">Check approval status</Link>
          </p>
        )}
      </div>
    </AuthLayout>
  )
}

export function OfficerAccessPage() {
  const [searchParams] = useSearchParams()
  const [governmentOfficerId, setGovernmentOfficerId] = useState(
    searchParams.get('governmentOfficerId') || '',
  )
  const [registration, setRegistration] = useState<{
    governmentOfficerId?: string
    status: string
    passwordSetupAvailable: boolean
    passwordSetupUrl?: string
    rejectionReason?: string
  } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const registrationAccessToken = localStorage.getItem('officerRegistrationAccessToken') || ''

  async function checkStatus(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const officerId = governmentOfficerId.trim().toUpperCase()
    if (!officerId) {
      setError('Enter your Government Officer ID.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await officerRegistrationService.getStatus('OFFICER', officerId, registrationAccessToken || undefined)
      setRegistration(result)
      setGovernmentOfficerId(result.governmentOfficerId || officerId)
    } catch (reason) {
      setRegistration(null)
      setError(reason instanceof Error
        ? reason.message
        : 'Unable to check registration status. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <Link className="back-link" to="/officer/login">← Officer sign in</Link>
        <p className="eyebrow">OFFICER ACCESS</p>
        <h1>Check approval status</h1>
        <p className="auth-card__intro">Enter your Government Officer ID to check your registration status. Your ID is not a password and cannot authorize password setup.</p>
        {error && <p className="form-alert form-alert--error" role="alert">{error}</p>}
        <form onSubmit={(event) => void checkStatus(event)} className="form-stack">
          <Field
            label="Government Officer ID"
            name="governmentOfficerId"
            autoComplete="username"
            placeholder="REV-001"
            value={governmentOfficerId}
            onChange={(event) => {
              setGovernmentOfficerId(event.target.value.toUpperCase())
              setRegistration(null)
              setError('')
            }}
            required
          />
          <button className="button button--primary button--full" type="submit" disabled={loading}>
            {loading ? 'Checking…' : registration ? 'Check Again' : 'Check Approval Status'}
          </button>
        </form>
        {registration?.status === 'NOT_REGISTERED' && (
          <section className="form-alert" role="status">
            <strong>No registration request found</strong>
            <p>The Government Officer ID is valid. Submit an Officer registration request to continue.</p>
            <Link className="button button--secondary" to={`/officer/register?governmentOfficerId=${encodeURIComponent(registration.governmentOfficerId || governmentOfficerId)}`}>Register as an Officer</Link>
          </section>
        )}
        {registration?.status === 'PENDING' && (
          <section className="form-alert" role="status">
            <strong>Registration Pending</strong>
            <p>Your registration request has been submitted and is currently waiting for administrator approval.</p>
            <p>Please check again later.</p>
          </section>
        )}
        {registration?.status === 'REJECTED' && (
          <section className="form-alert form-alert--error" role="status">
            <strong>Registration Rejected</strong>
            <p>Your officer registration was not approved.</p>
            {registration.rejectionReason && <p>Reason: {registration.rejectionReason}</p>}
          </section>
        )}
        {registration?.status === 'APPROVED' && (
          <section className="form-alert" role="status">
            <strong>Registration Approved ✓</strong>
            <p>Your officer registration has been approved by the administrator.</p>
            <p>Your account is ready for password setup.</p>
            {registration.passwordSetupAvailable && registration.passwordSetupUrl && (
              <Link className="button button--primary" to={registration.passwordSetupUrl}>Set Up Your Password</Link>
            )}
          </section>
        )}
        {registration?.status === 'ACTIVE' && (
          <section className="form-alert" role="status">
            <strong>Your officer account is active.</strong>
            <Link className="button button--primary" to="/officer/login">Go to Officer Login</Link>
          </section>
        )}
        {registration?.status === 'SUSPENDED' && (
          <section className="form-alert form-alert--error" role="status">
            <strong>This Officer account is inactive.</strong>
            <p>Please contact the administrator.</p>
          </section>
        )}
        <p className="auth-switch">
          Need to register?{' '}
          <Link to={`/officer/register${governmentOfficerId ? `?governmentOfficerId=${encodeURIComponent(governmentOfficerId)}` : ''}`}>Register with your Government Officer ID</Link>
        </p>
      </div>
    </AuthLayout>
  )
}

export function HumanVerifierAccessPage() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [registration, setRegistration] = useState<{
    email?: string
    status: string
    passwordSetupAvailable: boolean
    passwordSetupUrl?: string
    rejectionReason?: string
  } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const registrationAccessToken = localStorage.getItem('humanVerifierRegistrationAccessToken') || ''

  async function checkStatus(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Enter the official email used during registration.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await officerRegistrationService.getStatus(
        'HUMAN_VERIFIER',
        normalizedEmail,
        registrationAccessToken || undefined,
      )
      setRegistration(result)
      setEmail(result.email || normalizedEmail)
    } catch (reason) {
      setRegistration(null)
      setError(reason instanceof Error ? reason.message : 'Unable to check registration status.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <Link className="back-link" to="/human-verifier/login">← Human Verifier Officer sign in</Link>
        <p className="eyebrow">HUMAN VERIFIER OFFICER ACCESS</p>
        <h1>Check approval status</h1>
        <p className="auth-card__intro">Enter your official registration email. Email alone cannot authorize password setup; the registration credential from this browser is also required.</p>
        {error && <p className="form-alert form-alert--error" role="alert">{error}</p>}
        <form onSubmit={(event) => void checkStatus(event)} className="form-stack">
          <Field
            label="Official email address"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setRegistration(null)
              setError('')
            }}
            required
          />
          <button className="button button--primary button--full" type="submit" disabled={loading}>
            {loading ? 'Checking…' : registration ? 'Check Again' : 'Check Approval Status'}
          </button>
        </form>
        {registration?.status === 'NOT_REGISTERED' && (
          <section className="form-alert" role="status">
            <strong>No registration request found</strong>
            <p>Submit a Human Verifier Officer registration request to continue.</p>
            <Link className="button button--secondary" to={`/human-verifier/register?email=${encodeURIComponent(email)}`}>Register as a Human Verifier Officer</Link>
          </section>
        )}
        {registration?.status === 'PENDING' && (
          <section className="form-alert" role="status">
            <strong>Registration Pending</strong>
            <p>Your registration is waiting for administrator approval.</p>
            <p>Please check again later.</p>
          </section>
        )}
        {registration?.status === 'REJECTED' && (
          <section className="form-alert form-alert--error" role="status">
            <strong>Registration Rejected</strong>
            <p>Your Human Verifier Officer registration was not approved.</p>
            {registration.rejectionReason && <p>Reason: {registration.rejectionReason}</p>}
          </section>
        )}
        {registration?.status === 'APPROVED' && (
          <section className="form-alert" role="status">
            <strong>Registration Approved ✓</strong>
            <p>Your Human Verifier Officer registration has been approved by the administrator.</p>
            <p>Your account is ready for password setup.</p>
            {registration.passwordSetupAvailable && registration.passwordSetupUrl && (
              <Link className="button button--primary" to={registration.passwordSetupUrl}>Set Up Your Password</Link>
            )}
          </section>
        )}
        {registration?.status === 'ACTIVE' && (
          <section className="form-alert" role="status">
            <strong>Account Active ✓</strong>
            <p>Your Human Verifier Officer account is ready to use.</p>
            <Link className="button button--primary" to="/human-verifier/login">Go to Human Verifier Login</Link>
          </section>
        )}
        {registration?.status === 'SUSPENDED' && (
          <section className="form-alert form-alert--error" role="status">
            <strong>This Human Verifier Officer account is inactive.</strong>
            <p>Please contact the administrator.</p>
          </section>
        )}
        <p className="auth-switch">Need to register? <Link to={`/human-verifier/register${email ? `?email=${encodeURIComponent(email)}` : ''}`}>Register as a Human Verifier Officer</Link></p>
      </div>
    </AuthLayout>
  )
}

export function OfficerRegistrationPage({ initialType = 'OFFICER' }: { initialType?: 'OFFICER' | 'HUMAN_VERIFIER' }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [officerType, setOfficerType] = useState<'OFFICER' | 'HUMAN_VERIFIER'>(initialType)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validatedIdentity, setValidatedIdentity] = useState<{
    departmentName: string
    governmentOfficerId: string
    displayName: string
    officialEmail: string
    reRegistered: boolean
  } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const governmentOfficerId = String(data.get('governmentOfficerId') ?? '').trim()
    setError('')
    setLoading(true)
    try {
      if (officerType === 'OFFICER') {
        if (!validatedIdentity) {
          const result = await authService.validateOfficerRegistration(governmentOfficerId)
          setValidatedIdentity({
            departmentName: result.department.name,
            governmentOfficerId: result.governmentOfficerId,
            displayName: result.displayName,
            officialEmail: result.officialEmail,
            reRegistered: result.reRegistered,
          })
        } else {
          const result = await authService.registerOfficer(governmentOfficerId)
          localStorage.setItem('officerRegistrationAccessToken', result.registrationAccessToken)
          navigate(`/officer/access?governmentOfficerId=${encodeURIComponent(result.user.governmentOfficerId || governmentOfficerId)}`, { replace: true })
        }
      } else {
        const email = String(data.get('email') ?? '').trim().toLowerCase()
        const displayName = String(data.get('displayName') ?? '').trim()
        const result = await authService.registerHumanVerifier({ email, displayName })
        localStorage.setItem('humanVerifierRegistrationAccessToken', result.registrationAccessToken)
        navigate(`/human-verifier/access?email=${encodeURIComponent(result.user.email)}`, { replace: true })
      }
    } catch (reason) {
      if (officerType === 'OFFICER' && reason instanceof AuthApiError && reason.status === 409) {
        navigate(`/officer/access?governmentOfficerId=${encodeURIComponent(governmentOfficerId)}`, { replace: true })
        return
      }
      setError(officerType === 'OFFICER'
        ? officerRegistrationError(reason)
        : reason instanceof Error ? reason.message : 'Unable to submit Human Verifier registration.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <Link className="back-link" to={officerType === 'OFFICER' ? '/officer/login' : '/human-verifier/login'}>← {officerType === 'OFFICER' ? 'Officer' : 'Human Verifier Officer'} sign in</Link>
        <p className="eyebrow">OFFICER ACCESS</p>
        <h1>{officerType === 'OFFICER' ? 'Officer registration' : 'Human Verifier Officer registration'}</h1>
        <p className="auth-card__intro">Choose your officer type. All registrations are reviewed by an administrator before account access is enabled.</p>
        {error && <p className="form-alert form-alert--error" role="alert">{error}</p>}
        <form onSubmit={(event) => void handleSubmit(event)} className="form-stack">
          <label className="field">
            <span className="field-label">Officer type</span>
            <select
              className="field-input"
              value={officerType}
              onChange={(event) => {
                setOfficerType(event.target.value as 'OFFICER' | 'HUMAN_VERIFIER')
                setValidatedIdentity(null)
                setError('')
              }}
            >
              <option value="OFFICER">Government Officer</option>
              <option value="HUMAN_VERIFIER">Human Verifier Officer</option>
            </select>
          </label>
          {officerType === 'OFFICER' ? (
            <>
              <Field
                label="Government Officer ID"
                name="governmentOfficerId"
                autoComplete="username"
                placeholder="REV-001"
                defaultValue={searchParams.get('governmentOfficerId') || ''}
                onChange={() => { setValidatedIdentity(null); setError('') }}
                required
              />
              {validatedIdentity && (
                <section className="form-alert" role="status">
                  <strong>Identity validated</strong>
                  <p>Government Officer ID: {validatedIdentity.governmentOfficerId}</p>
                  <p>Registered name: {validatedIdentity.displayName}</p>
                  <p>Official email: {validatedIdentity.officialEmail}</p>
                  <p>Department: {validatedIdentity.departmentName}</p>
                  {validatedIdentity.reRegistered && <p>Your earlier rejected registration can be resubmitted for review.</p>}
                </section>
              )}
              <p className="muted">Name, official email, and Department come from the Government Officer registry and cannot be changed here.</p>
              <button className="button button--primary button--full" type="submit" disabled={loading}>
                {loading ? (validatedIdentity ? 'Submitting…' : 'Validating…') : (validatedIdentity ? 'Submit registration' : 'Validate identity')}
              </button>
              <p className="auth-switch">Already submitted a request? <Link to="/officer/access">Check approval status</Link></p>
            </>
          ) : (
            <>
              <Field label="Full name" name="displayName" autoComplete="name" maxLength={160} required />
              <Field
                label="Official email address"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={searchParams.get('email') || ''}
                required
              />
              <p className="muted">Human Verifier Officers are system-wide and are not assigned to a Department. Registration is reviewed by an administrator.</p>
              <button className="button button--primary button--full" type="submit" disabled={loading}>
                {loading ? 'Submitting…' : 'Submit registration'}
              </button>
              <p className="auth-switch">Already submitted a request? <Link to="/human-verifier/access">Check approval status</Link></p>
            </>
          )}
        </form>
      </div>
    </AuthLayout>
  )
}

export function HumanVerifierRegistrationPage() {
  return <OfficerRegistrationPage initialType="HUMAN_VERIFIER" />
}

export function OfficerSetupPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const role: 'OFFICER' | 'HUMAN_VERIFIER' = location.pathname.startsWith('/human-verifier/')
    ? 'HUMAN_VERIFIER'
    : 'OFFICER'
  const setupToken = searchParams.get('token') || ''
  const governmentOfficerId = searchParams.get('officerId') || ''
  const email = searchParams.get('email') || ''
  const registrationMode = searchParams.get('registration') === '1'
  const registrationAccessToken = localStorage.getItem(
    role === 'OFFICER' ? 'officerRegistrationAccessToken' : 'humanVerifierRegistrationAccessToken',
  ) || ''
  const loginPath = role === 'OFFICER' ? '/officer/login' : '/human-verifier/login'
  const roleLabel = role === 'OFFICER' ? 'Officer' : 'Human Verifier Officer'
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('confirmPassword') ?? '')
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setError('')
    setLoading(true)
    try {
      if (registrationMode) {
        await officerRegistrationService.completePasswordSetup(
          role,
          role === 'OFFICER' ? governmentOfficerId : email,
          registrationAccessToken,
          password,
        )
        localStorage.removeItem(role === 'OFFICER'
          ? 'officerRegistrationAccessToken'
          : 'humanVerifierRegistrationAccessToken')
      } else {
        await authService.completeOfficerSetup(setupToken, password, role)
      }
      setComplete(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Password setup failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <Link className="back-link" to={loginPath}>← {roleLabel} sign in</Link>
        <p className="eyebrow">{roleLabel.toUpperCase()} ACCESS</p>
        <h1>Set Your Password</h1>
        {governmentOfficerId && <p>Government Officer ID: <strong>{governmentOfficerId}</strong></p>}
        {role === 'HUMAN_VERIFIER' && email && <p>Official email: <strong>{email}</strong></p>}
        {error && <p className="form-alert form-alert--error" role="alert">{error}</p>}
        {complete ? (
          <div className="form-alert" role="status">
            <p>Password setup is complete. Sign in with your {role === 'OFFICER' ? 'Government Officer ID' : 'official email'} and this password.</p>
            <button className="button button--primary" type="button" onClick={() => navigate(loginPath, { replace: true })}>Go to {roleLabel} Login</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-stack">
            <p className="auth-card__intro">{registrationMode ? 'Your registration has been approved. Choose a password to activate your account.' : `Choose your ${roleLabel} account password. This one-time setup link expires and can only be used once.`}</p>
            <Field label="New password" type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            <Field label="Confirm password" type="password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={128} required />
            <button className="button button--primary button--full" type="submit" disabled={loading || (registrationMode ? !registrationAccessToken || (role === 'OFFICER' ? !governmentOfficerId : !email) : !setupToken)}>
              {loading ? 'Setting password…' : 'Set Password'}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

export function OfficerChangePasswordPage() {
  const navigate = useNavigate()
  const { changeOfficerPassword } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const currentPassword = String(data.get('currentPassword') ?? '')
    const newPassword = String(data.get('newPassword') ?? '')
    if (newPassword !== String(data.get('confirmPassword') ?? '')) {
      setError('The new passwords do not match.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await changeOfficerPassword(currentPassword, newPassword)
      navigate('/officer', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <p className="eyebrow">OFFICER ACCESS</p>
        <h1>Change your password</h1>
        <p className="auth-card__intro">A password change is required before opening the Officer Dashboard.</p>
        {error && <p className="form-alert form-alert--error" role="alert">{error}</p>}
        <form onSubmit={handleSubmit} className="form-stack">
          <Field label="Current temporary password" type="password" name="currentPassword" autoComplete="current-password" required />
          <Field label="New password" type="password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={128} required />
          <Field label="Confirm new password" type="password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={128} required />
          <button className="button button--primary button--full" type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}