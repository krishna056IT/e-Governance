import mongoose from 'mongoose'
import { env } from './env.mjs'
import { databaseErrorDetails } from './databaseErrors.mjs'

const READY_CHECK_INTERVAL_MS = 60_000
const RETRY_BASE_DELAY_MS = 1_000
const RETRY_MAX_DELAY_MS = 60_000
const RETRY_JITTER_RATIO = 0.2

let connectionAttempt = null
let monitorStarted = false
let wakeActiveMonitor = null
let previousReadyState = mongoose.connection.readyState
let lastFailureLog = { key: '', at: 0 }

function logDatabaseEvent(level, event, details = {}) {
  const record = JSON.stringify({ service: 'database', event, ...details })
  console[level](record)
}

function logConnectionFailure(error, event = 'connection_attempt_failed') {
  const details = databaseErrorDetails(error)
  const key = `${details.name}:${details.code || ''}:${details.causeCode || ''}`
  const now = Date.now()
  if (lastFailureLog.key === key && now - lastFailureLog.at < 30_000) return
  lastFailureLog = { key, at: now }
  logDatabaseEvent('warn', event, details)
}

mongoose.connection.on('connected', () => {
  if (previousReadyState !== 1) {
    console.info('MongoDB connected successfully')
  }
  previousReadyState = mongoose.connection.readyState
})

mongoose.connection.on('disconnected', () => {
  previousReadyState = mongoose.connection.readyState
  logDatabaseEvent('warn', 'disconnected', { readyState: mongoose.connection.readyState })
  wakeActiveMonitor?.()
})

mongoose.connection.on('error', (error) => {
  logConnectionFailure(error, 'connection_error')
})

export function reconnectDelayMs(failures, random = Math.random) {
  const exponentialDelay = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * (2 ** Math.max(0, failures - 1)),
  )
  const jitter = 1 - RETRY_JITTER_RATIO + random() * RETRY_JITTER_RATIO * 2
  return Math.round(Math.min(RETRY_MAX_DELAY_MS, exponentialDelay * jitter))
}

export async function connectDatabase() {
  if (!env.MONGODB_URI) {
    logDatabaseEvent('error', 'connection_uri_missing')
    return null
  }

  if (isDatabaseConnected()) return mongoose.connection
  if (connectionAttempt) return connectionAttempt

  if (mongoose.connection.readyState === 2) {
    connectionAttempt = mongoose.connection.asPromise()
      .catch((error) => {
        logConnectionFailure(error)
        return null
      })
      .finally(() => {
        connectionAttempt = null
      })
    return connectionAttempt
  }

  if (mongoose.connection.readyState === 3) return null

  connectionAttempt = mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8_000,
  })
    .then((connection) => connection.connection)
    .catch((error) => {
      logConnectionFailure(error)
      return null
    })
    .finally(() => {
      connectionAttempt = null
    })

  return connectionAttempt
}

export function startDatabaseConnectionMonitor({
  connect = connectDatabase,
  isConnected = isDatabaseConnected,
  schedule = setTimeout,
  cancel = clearTimeout,
  random = Math.random,
} = {}) {
  if (monitorStarted) return () => {}
  if (!env.MONGODB_URI && connect === connectDatabase) {
    logDatabaseEvent('error', 'connection_uri_missing')
    return () => {}
  }
  monitorStarted = true

  let stopped = false
  let running = false
  let failures = 0
  let timer

  const scheduleAttempt = (delay) => {
    if (timer) cancel(timer)
    timer = schedule(() => {
      timer = null
      void attempt()
    }, delay)
    timer?.unref?.()
  }

  const wake = () => {
    if (!stopped && !running) scheduleAttempt(0)
  }

  const attempt = async () => {
    if (stopped || running) return
    running = true
    try {
      if (isConnected()) {
        failures = 0
      } else {
        const connection = await connect()
        if (connection || isConnected()) failures = 0
        else failures += 1
      }
    } catch (error) {
      failures += 1
      logConnectionFailure(error, 'reconnection_failed')
    } finally {
      running = false
    }
    if (stopped) return
    const delay = isConnected()
      ? READY_CHECK_INTERVAL_MS
      : reconnectDelayMs(Math.max(failures, 1), random)
    scheduleAttempt(delay)
  }

  wakeActiveMonitor = wake
  void attempt()
  return () => {
    stopped = true
    if (timer) cancel(timer)
    if (wakeActiveMonitor === wake) wakeActiveMonitor = null
    monitorStarted = false
  }
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1
}

export async function isDatabaseReady() {
  if (!isDatabaseConnected() || !mongoose.connection.db) return false
  try {
    await mongoose.connection.db.admin().ping({ maxTimeMS: 2_000 })
    return true
  } catch (error) {
    logConnectionFailure(error, 'health_check_failed')
    return false
  }
}
