import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import {
  ApplicantLoginPage,
  ApplicantRegistrationPage,
  OfficerChangePasswordPage,
  OfficerRegistrationPage,
  OfficerAccessPage,
  OfficerSetupPage,
  StaffLoginPage,
  HumanVerifierAccessPage,
  HumanVerifierRegistrationPage,
} from './pages/AuthPages'
import { ApplicantApplicationDetailsPage, ApplicantDashboardPage, CreateApplicationPage } from './pages/ApplicantPages'
import { OfficerApplicationDetailsPage, OfficerDashboardPage } from './pages/OfficerPages'
import { EscalatedCaseDetailsPage, EscalatedCasesDashboardPage } from './pages/GeneralOfficerPages'
import { AdminDashboardPage } from './pages/AdminPages'
import { HumanVerificationDashboardPage, HumanVerificationDetailsPage } from './pages/HumanVerificationPages'

function NotFoundPage() {
  return <main className="not-found"><p className="eyebrow">PAGE NOT FOUND</p><h1>That page isn’t here.</h1><p>Return to e-Governance and choose a service area.</p><a className="button button--primary" href="/">Back to home</a></main>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/applicant/login" element={<ApplicantLoginPage />} />
      <Route path="/applicant/register" element={<ApplicantRegistrationPage />} />
      <Route path="/applicant" element={<ProtectedRoute allowedRoles={['APPLICANT']}><ApplicantDashboardPage /></ProtectedRoute>} />
      <Route path="/applicant/applications/new" element={<ProtectedRoute allowedRoles={['APPLICANT']}><CreateApplicationPage /></ProtectedRoute>} />
      <Route path="/applicant/applications/:id" element={<ProtectedRoute allowedRoles={['APPLICANT']}><ApplicantApplicationDetailsPage /></ProtectedRoute>} />
      <Route path="/officer/login" element={<StaffLoginPage area="officer" />} />
      <Route path="/officer/access" element={<OfficerAccessPage />} />
      <Route path="/officer/register" element={<OfficerRegistrationPage />} />
      <Route path="/officer/setup" element={<OfficerSetupPage />} />
      <Route path="/officer/change-password" element={<ProtectedRoute allowedRoles={['OFFICER']} allowOfficerPasswordChange><OfficerChangePasswordPage /></ProtectedRoute>} />
      <Route path="/officer" element={<OfficerDashboardPage />} />
      <Route path="/officer/applications/:id" element={<ProtectedRoute allowedRoles={['OFFICER']}><OfficerApplicationDetailsPage /></ProtectedRoute>} />
      <Route path="/general-officer/login" element={<StaffLoginPage area="general-officer" />} />
      <Route path="/general-officer" element={<ProtectedRoute allowedRoles={['GENERAL_OFFICER']}><EscalatedCasesDashboardPage /></ProtectedRoute>} />
      <Route path="/general-officer/cases/:id" element={<ProtectedRoute allowedRoles={['GENERAL_OFFICER']}><EscalatedCaseDetailsPage /></ProtectedRoute>} />
      <Route path="/general-officer/human-verification" element={<ProtectedRoute allowedRoles={['HUMAN_VERIFIER']}><HumanVerificationDashboardPage /></ProtectedRoute>} />
      <Route path="/general-officer/human-verification/:id" element={<ProtectedRoute allowedRoles={['HUMAN_VERIFIER']}><HumanVerificationDetailsPage /></ProtectedRoute>} />
      <Route path="/human-verifier/login" element={<StaffLoginPage area="human-verifier" />} />
      <Route path="/human-verifier/register" element={<HumanVerifierRegistrationPage />} />
      <Route path="/human-verifier/access" element={<HumanVerifierAccessPage />} />
      <Route path="/human-verifier/setup" element={<OfficerSetupPage />} />
      <Route path="/human-verifier" element={<ProtectedRoute allowedRoles={['HUMAN_VERIFIER']}><HumanVerificationDashboardPage /></ProtectedRoute>} />
      <Route path="/human-verifier/review/:id" element={<ProtectedRoute allowedRoles={['HUMAN_VERIFIER']}><HumanVerificationDetailsPage /></ProtectedRoute>} />
      <Route path="/admin/auth" element={<StaffLoginPage area="admin" />} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboardPage /></ProtectedRoute>} />
      <Route path="/login" element={<Navigate to="/applicant/login" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
