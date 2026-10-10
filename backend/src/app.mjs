import express from 'express'
import cors from 'cors'
import { env } from './config/env.mjs'
import adminRoutes from './routes/admin.mjs'
import authRoutes from './routes/auth.mjs'
import applicationsRoutes from './routes/applications.mjs'
import applicationStatusRoutes from './routes/applicationStatus.mjs'
import documentsRoutes from './routes/documents.mjs'
import officerRoutes from './routes/officer.mjs'
import generalOfficerRoutes from './routes/generalOfficer.mjs'
import verificationRoutes from './routes/verification.mjs'
import chatRoutes from './routes/chat.mjs'
import { isDatabaseReady } from './config/database.mjs'
import { isDatabaseUnavailableError } from './config/databaseErrors.mjs'

const app = express()

app.disable('x-powered-by')
const allowedOrigins = new Set(env.CORS_ORIGINS)
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin))
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', async (_req, res) => {
  const databaseConnected = await isDatabaseReady()
  res.status(databaseConnected ? 200 : 503).json({
    ok: databaseConnected,
    service: 'HacKBios backend',
    nodeEnv: env.NODE_ENV,
    ocrThreshold: env.OCR_THRESHOLD,
    database: databaseConnected ? 'connected' : 'unavailable',
  })
})

app.use('/api/admin', adminRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/applications', applicationsRoutes)
app.use('/api/application-status', applicationStatusRoutes)
app.use('/api/documents', documentsRoutes)
app.use('/api/officer', officerRoutes)
app.use('/api/general-officer', generalOfficerRoutes)
app.use('/api/human-verification', verificationRoutes)
app.use('/api/chat', chatRoutes)

export function handleApiError(err, _req, res, _next) {
  const isDatabaseError = isDatabaseUnavailableError(err)
  const status = err?.statusCode || (isDatabaseError ? 503 : err?.type === 'entity.parse.failed' ? 400 : 500)
  const message = isDatabaseError
    ? 'The service is temporarily unavailable because the database cannot be reached. Please try again.'
    : status < 500 ? err.message : status === 503 ? 'The service is temporarily unavailable.' : 'Internal server error.'
  return res.status(status).json({ error: message })
}

app.use(handleApiError)

export default app
