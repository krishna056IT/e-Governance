import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/layout'
import {
  ApplicationSummary,
  ApplicationTable,
  DeadlineIndicator,
  EmptyState,
  ErrorState,
  InfoCard,
  LoadingState,
  MetricCard,
  PageHeader,
  StatusBadge,
  TextAreaField,
  Timeline,
} from '../components/ui'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { generalOfficerReviewService } from '../services/generalOfficerReviewService'
import type { ApplicationDocument, ApplicationRecord } from '../types'

function GeneralOfficerDocument({ document }: { document: ApplicationDocument }) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [originalUrl, setOriginalUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    let objectUrl = ''
    if (showOriginal) {
      setLoading(true)
      setError('')
      generalOfficerReviewService.getOriginalDocument(document.id)
        .then((blob) => {
          if (!current) return
          objectUrl = URL.createObjectURL(blob)
          setOriginalUrl(objectUrl)
        })
        .catch((reason: unknown) => {
          if (current) setError(reason instanceof Error ? reason.message : 'The original document could not be loaded.')
        })
        .finally(() => { if (current) setLoading(false) })
    } else {
      setOriginalUrl('')
    }
    return () => {
      current = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [document.id, showOriginal])

  return (
    <article className="officer-document">
      <div className="panel__heading">
        <div>
          <h3>{document.name}</h3>
          <p className="muted">{document.documentType || document.mimeType} · {new Date(document.addedAt).toLocaleString()}</p>
        </div>
        <span className="inline-status">{document.ocrStatus || document.status}</span>
      </div>
      <dl className="summary-grid">
        <div><dt>OCR confidence</dt><dd>{document.ocrConfidence === null ? 'Unavailable' : `${document.ocrConfidence}%`}</dd></div>
        <div><dt>Human verification</dt><dd>{document.humanVerificationStatus || 'Not required'}</dd></div>
        {document.humanVerificationDecision && <div><dt>Verification decision</dt><dd>{document.humanVerificationDecision}</dd></div>}
        {document.humanVerifiedBy && <div><dt>Verified by</dt><dd>{document.humanVerifiedBy}</dd></div>}
        {document.humanVerifiedAt && <div><dt>Verified at</dt><dd>{new Date(document.humanVerifiedAt).toLocaleString()}</dd></div>}
        {document.humanVerificationNote && <div className="summary-grid__wide"><dt>Verification note</dt><dd>{document.humanVerificationNote}</dd></div>}
      </dl>
      {document.extractedText && <div className="officer-ocr-output"><strong>OCR-extracted information</strong><pre className="document-preview">{document.extractedText}</pre></div>}
      {document.correctedExtractedData?.length ? (
        <div className="officer-ocr-output">
          <strong>Human-verified corrected information</strong>
          <dl className="summary-grid">{document.correctedExtractedData.map((field, index) => <div key={`${field.name}-${index}`}><dt>{field.name}</dt><dd>{field.value}</dd></div>)}</dl>
        </div>
      ) : null}
      <button className="button button--quiet button--small" type="button" onClick={() => setShowOriginal((visible) => !visible)}>{showOriginal ? 'Hide original' : 'View private original'}</button>
      {loading && <LoadingState label="Loading authorized original…" />}
      {error && <ErrorState message={error} />}
      {showOriginal && originalUrl && (document.mimeType === 'application/pdf'
        ? <iframe className="document-preview" src={originalUrl} title={`Original document ${document.name}`} />
        : <img className="document-preview" src={originalUrl} alt={`Original document ${document.name}`} />)}
    </article>
  )
}

export function EscalatedCasesDashboardPage() {
  const currentTime = useCurrentTime()
  const [applications, setApplications] = useState<ApplicationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setApplications(await generalOfficerReviewService.listEscalated())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let current = true
    generalOfficerReviewService.listEscalated()
      .then((items) => { if (current) setApplications(items) })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Please try again.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const overdueCount = useMemo(
    () => applications.filter((application) =>
      Boolean(application.breachedAt) ||
      Boolean(application.deadlineAt && new Date(application.deadlineAt).getTime() < currentTime),
    ).length,
    [applications, currentTime],
  )

  return (
    <DashboardLayout area="general-officer" title="Escalated cases">
      <PageHeader eyebrow="GENERAL OFFICER WORKSPACE" title="Escalated cases" description="Applications awaiting a General Officer decision." />
      <div className="metric-grid metric-grid--two">
        <MetricCard label="Escalated cases" value={loading || error ? '—' : applications.length} detail="Awaiting a decision" icon="↗" />
        <MetricCard label="Breached deadlines" value={loading || error ? '—' : overdueCount} detail="Deadline has passed" icon="!" />
      </div>
      <section className="panel">
        <div className="panel__heading">
          <div><h2 className="panel__title">Case queue</h2><p className="muted">Only unresolved Officer escalations are listed.</p></div>
          <button className="button button--quiet button--small" onClick={() => void load()}>Refresh</button>
        </div>
        {loading ? <LoadingState label="Loading escalated cases…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : applications.length ? <ApplicationTable applications={applications} hrefFor={(application) => `/general-officer/cases/${application.id}`} /> : <EmptyState title="No escalated cases" description="Officer-escalated cases will appear here." />}
      </section>
    </DashboardLayout>
  )
}

export function EscalatedCaseDetailsPage() {
  const { id = '' } = useParams()
  const [application, setApplication] = useState<ApplicationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadedId, setLoadedId] = useState('')
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setApplication(await generalOfficerReviewService.getEscalatedCase(id))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.')
    } finally {
      setLoadedId(id)
      setLoading(false)
    }
  }

  useEffect(() => {
    let current = true
    generalOfficerReviewService.getEscalatedCase(id)
      .then((item) => { if (current) { setApplication(item); setError('') } })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'Please try again.') })
      .finally(() => { if (current) { setLoadedId(id); setLoading(false) } })
    return () => { current = false }
  }, [id])

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && !reason.trim()) {
      setActionError('A rejection reason is required.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      setApplication(await generalOfficerReviewService.decide(id, decision, reason))
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'The decision could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const canDecide = application?.status === 'ESCALATED'
  return (
    <DashboardLayout area="general-officer" title="Escalated case details">
      <PageHeader eyebrow="ESCALATED CASE" title={application?.title ?? 'Case details'} description={application?.id} action={<Link className="button button--secondary" to="/general-officer">← Escalated cases</Link>} />
      {loading || loadedId !== id ? <LoadingState label="Loading escalated case…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : application && <>
        <div className="details-statusbar"><div><span className="muted">Current status</span><StatusBadge status={application.status} /></div><DeadlineIndicator deadlineAt={application.deadlineAt} breachedAt={application.breachedAt} /></div>
        <InfoCard title="Application information"><ApplicationSummary application={application} /><p className="application-description">{application.details}</p></InfoCard>
        <InfoCard title="Escalation information">{application.escalation ? <dl className="summary-grid"><div><dt>Originating officer</dt><dd>{application.escalation.originatingOfficer}</dd></div><div><dt>Escalated</dt><dd>{new Date(application.escalation.createdAt).toLocaleString()}</dd></div><div className="summary-grid__wide"><dt>Escalation reason</dt><dd>{application.escalation.note || 'No reason was recorded.'}</dd></div></dl> : <p className="muted">No escalation details are recorded.</p>}</InfoCard>
        <InfoCard title="Submitted documents">{application.documents.length ? <div className="officer-document-list">{application.documents.map((document) => <GeneralOfficerDocument key={document.id} document={document} />)}</div> : <p className="muted">No documents have been uploaded.</p>}</InfoCard>
        {application.officerReview?.notes.length ? <InfoCard title="Officer review notes"><ul className="document-list">{application.officerReview.notes.map((note, index) => <li key={`${note.officerId}-${note.at}-${index}`}><span className="document-list__icon" aria-hidden="true">✓</span><span className="document-list__name"><strong>{note.action} · {note.officerName}</strong><small>{note.note || 'No note recorded.'}</small></span><span className="document-list__date">{new Date(note.at).toLocaleString()}</span></li>)}</ul></InfoCard> : null}
        <InfoCard title="Application timeline"><Timeline entries={application.timeline} /></InfoCard>
        <InfoCard title="General Officer decision">
          {canDecide ? <>
            <TextAreaField label="Decision note / rejection reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} hint="A reason is required when rejecting. The note is saved with the decision." />
            {actionError && <p className="field__error" role="alert">{actionError}</p>}
            <div className="form-actions">
              <button className="button button--primary" type="button" disabled={busy} onClick={() => void decide('APPROVED')}>{busy ? 'Saving…' : 'Approve application'}</button>
              <button className="button button--secondary" type="button" disabled={busy || !reason.trim()} onClick={() => void decide('REJECTED')}>{busy ? 'Saving…' : 'Reject application'}</button>
            </div>
          </> : <p className="muted">This application has been resolved as {application.status}. Decisions cannot be changed from this screen.</p>}
        </InfoCard>
      </>}
    </DashboardLayout>
  )
}
