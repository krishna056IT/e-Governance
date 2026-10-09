import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import app, { handleApiError } from '../src/app.mjs'
import {
  reconnectDelayMs,
  startDatabaseConnectionMonitor,
} from '../src/config/database.mjs'
import { isDatabaseUnavailableError } from '../src/config/databaseErrors.mjs'
import { env } from '../src/config/env.mjs'

test('database reconnect delay grows exponentially and stays capped', () => {
  const middleJitter = () => 0.5
  assert.equal(reconnectDelayMs(1, middleJitter), 1_000)
  assert.equal(reconnectDelayMs(2, middleJitter), 2_000)
  assert.equal(reconnectDelayMs(10, middleJitter), 60_000)
  assert.equal(reconnectDelayMs(10, () => 1), 60_000)
  assert.equal(reconnectDelayMs(1, () => 0), 800)
  assert.equal(reconnectDelayMs(1, () => 1), 1_200)
})

test('database connection monitor retries a failure and recovers on the next attempt', async () => {
  let connected = false
  let attempts = 0
  const scheduled = []
  const cancelled = []
  const stop = startDatabaseConnectionMonitor({
    connect: async () => {
      attempts += 1
      if (attempts === 1) return null
      connected = true
      return { connection: true }
    },
    isConnected: () => connected,
    schedule: (callback, delay) => {
      const timer = { callback, delay }
      scheduled.push(timer)
      return timer
    },
    cancel: (timer) => cancelled.push(timer),
    random: () => 0.5,
  })

  await new Promise(setImmediate)
  assert.equal(attempts, 1)
  assert.equal(scheduled[0].delay, 1_000)

  scheduled[0].callback()
  await new Promise(setImmediate)
  assert.equal(attempts, 2)
  assert.equal(connected, true)
  assert.equal(scheduled[1].delay, 60_000)

  stop()
  assert.equal(cancelled.length, 1)
})

test('a disconnect wakes the connection monitor instead of waiting for the ready-check interval', async () => {
  let connected = true
  const scheduled = []
  const cancelled = []
  const stop = startDatabaseConnectionMonitor({
    connect: async () => null,
    isConnected: () => connected,
    schedule: (callback, delay) => {
      const timer = { callback, delay }
      scheduled.push(timer)
      return timer
    },
    cancel: (timer) => cancelled.push(timer),
  })

  await new Promise(setImmediate)
  assert.equal(scheduled[0].delay, 60_000)

  connected = false
  mongoose.connection.emit('disconnected')
  assert.equal(cancelled[0], scheduled[0])
  assert.equal(scheduled[1].delay, 0)

  stop()
})

test('transient network failures are distinguished from application validation errors', () => {
  assert.equal(isDatabaseUnavailableError({
    name: 'MongoNetworkError',
    cause: { code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' },
  }), true)
  assert.equal(isDatabaseUnavailableError({
    name: 'MongoPoolClearedError',
    errorLabels: ['ResetPool'],
  }), true)
  assert.equal(isDatabaseUnavailableError({ name: 'ValidationError', statusCode: 400 }), false)
  assert.equal(isDatabaseUnavailableError({ name: 'MongoServerError', code: 11000 }), false)
  assert.equal(isDatabaseUnavailableError({ name: 'ServiceError', statusCode: 503 }), false)
})

test('API error middleware returns 503 only for database failures and preserves validation responses', () => {
  const response = {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  handleApiError({
    name: 'MongoNetworkError',
    cause: { code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' },
  }, {}, response, () => {})
  assert.equal(response.statusCode, 503)
  assert.match(response.body.error, /database cannot be reached/i)

  handleApiError({ name: 'ValidationError', statusCode: 400, message: 'Invalid date.' }, {}, response, () => {})
  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.body, { error: 'Invalid date.' })
})

test('health endpoint accurately reports unavailable database readiness', async (context) => {
  const server = app.listen(0)
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const response = await fetch(`http://127.0.0.1:${address.port}/health`)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    ok: false,
    service: 'HacKBios backend',
    nodeEnv: env.NODE_ENV,
    ocrThreshold: env.OCR_THRESHOLD,
    database: 'unavailable',
  })
})

test('malformed JSON remains a client error rather than a database outage', async (context) => {
  const server = app.listen(0)
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /JSON|property|position/i)
})
