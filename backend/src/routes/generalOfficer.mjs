import { Router } from 'express'
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.mjs'
import {
  decideEscalatedApplication,
  getEscalatedApplication,
  listEscalatedApplications,
} from '../services/generalOfficerReviewService.mjs'

const router = Router()
router.use(requireAuth, requireRole('GENERAL_OFFICER'), requirePermission('APPLICATION_VIEW_ASSIGNED'))

function sendReviewError(res, error) {
  const isDatabaseError = error?.name?.startsWith('Mongo') || error?.name?.startsWith('Mongoose')
  const status = error.statusCode || (isDatabaseError ? 503 : 500)
  return res.status(status).json({
    error: status >= 500
      ? 'General Officer review service is temporarily unavailable.'
      : error.message,
  })
}

router.get('/applications', async (_req, res) => {
  try {
    const applications = await listEscalatedApplications()
    return res.json({ applications })
  } catch (error) {
    return sendReviewError(res, error)
  }
})

router.get('/applications/:applicationId', async (req, res) => {
  try {
    const application = await getEscalatedApplication(req.params.applicationId)
    if (!application) return res.status(404).json({ error: 'Application not found in the escalated queue.' })
    return res.json({ application })
  } catch (error) {
    return sendReviewError(res, error)
  }
})

router.post('/applications/:applicationId/decision', async (req, res) => {
  try {
    const application = await decideEscalatedApplication({
      generalOfficer: req.user,
      applicationId: req.params.applicationId,
      decision: req.body?.decision,
      reason: req.body?.reason,
    })
    if (!application) return res.status(404).json({ error: 'Application is no longer in the escalated queue.' })
    return res.json({ application })
  } catch (error) {
    return sendReviewError(res, error)
  }
})

export default router
