import { randomBytes } from 'node:crypto'
import { env } from '../config/env.mjs'

const developmentPreviewLifetimeMs = 24 * 60 * 60 * 1000
const developmentEmailPreviews = new Map()
let officerEmailSender = null

export function configureOfficerEmailSender(sender) {
  if (sender !== null && typeof sender !== 'function') {
    throw new TypeError('Officer email sender must be a function or null.')
  }
  officerEmailSender = sender
}

function removeExpiredDevelopmentPreviews(now = Date.now()) {
  for (const [previewId, preview] of developmentEmailPreviews) {
    if (preview.expiresAt.getTime() <= now) developmentEmailPreviews.delete(previewId)
  }
}

export async function sendOfficerSetupLink({
  email,
  governmentOfficerId,
  role = 'OFFICER',
  setupPath,
  expiresAt,
}) {
  const isHumanVerifier = role === 'HUMAN_VERIFIER'
  const message = {
    to: email,
    subject: `Set up your HacKBios ${isHumanVerifier ? 'Human Verifier' : 'Officer'} password`,
    text: `Use this one-time link to set up your HacKBios ${isHumanVerifier ? 'Human Verifier' : 'Officer'} password: ${setupPath}`,
    metadata: {
      type: isHumanVerifier ? 'HUMAN_VERIFIER_PASSWORD_SETUP' : 'OFFICER_PASSWORD_SETUP',
      governmentOfficerId,
      expiresAt: expiresAt.toISOString(),
    },
    setupPath,
  }

  if (officerEmailSender) {
    await officerEmailSender(message)
  } else if (env.NODE_ENV !== 'development') {
    const error = new Error('Officer setup email delivery is not configured.')
    error.statusCode = 503
    throw error
  }

  if (env.NODE_ENV !== 'development') return { delivered: true }

  removeExpiredDevelopmentPreviews()
  const developmentPreviewId = randomBytes(24).toString('base64url')
  developmentEmailPreviews.set(developmentPreviewId, {
    to: message.to,
    subject: message.subject,
    metadata: message.metadata,
    setupPath: message.setupPath,
    expiresAt: new Date(Date.now() + developmentPreviewLifetimeMs),
  })
  return { delivered: true, developmentPreviewId }
}

export function getDevelopmentOfficerEmailPreview(previewId) {
  if (env.NODE_ENV !== 'development') return null
  removeExpiredDevelopmentPreviews()
  if (typeof previewId !== 'string') return null
  return developmentEmailPreviews.get(previewId) || null
}
