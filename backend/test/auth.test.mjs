import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import app from '../src/app.mjs'
import { connectDatabase, isDatabaseConnected } from '../src/config/database.mjs'
import { env } from '../src/config/env.mjs'
import { requireAuth, requirePermission, requireRole, signToken } from '../src/middleware/auth.mjs'
import RevokedToken from '../src/models/RevokedToken.mjs'
import User from '../src/models/User.mjs'

const runId = `${process.pid}-${Date.now()}`
const testEmails = []
const testTokenIds = []
let server
let baseUrl

before(async () => {
  assert.ok(env.MONGODB_URI, 'MONGODB_URI must be configured to run authentication integration tests.')
  await connectDatabase()
  assert.equal(isDatabaseConnected(), true, 'MongoDB must be reachable for authentication integration tests.')
  server = app.listen(0)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  if (testEmails.length > 0) {
    await User.deleteMany({ email: { $in: testEmails } })
  }
  if (testTokenIds.length > 0) {
    await RevokedToken.deleteMany({ tokenId: { $in: testTokenIds } })
  }
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  await mongoose.disconnect()
})

async function register(email, extra = {}) {
  testEmails.push(email)
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'TestPassword123!',
      displayName: 'Test Applicant',
      ...extra,
    }),
  })
}

test('registration persists an applicant with a bcrypt hash and never returns it', async () => {
  const email = `applicant-${runId}@example.test`
  const response = await register(email, { role: 'ADMIN' })
  const body = await response.json()

  assert.equal(response.status, 201)
  assert.equal(body.user.email, email)
  assert.equal(body.user.role, 'APPLICANT')
  assert.equal('passwordHash' in body.user, false)
  assert.equal(typeof body.token, 'string')

  const storedUser = await User.findOne({ email }).lean()
  assert.ok(storedUser)
  assert.notEqual(storedUser.passwordHash, 'TestPassword123!')
  assert.equal(await bcrypt.compare('TestPassword123!', storedUser.passwordHash), true)
})

test('registration rejects duplicate email addresses', async () => {
  const email = `duplicate-${runId}@example.test`
  const firstResponse = await register(email)
  const duplicateResponse = await register(email)

  assert.equal(firstResponse.status, 201)
  assert.equal(duplicateResponse.status, 409)
  assert.deepEqual(await duplicateResponse.json(), {
    error: 'An account with that email already exists.',
  })
})

test('login issues a JWT for a provisioned account and /me returns the database user safely', async () => {
  const email = `login-${runId}@example.test`
  const registrationResponse = await register(email)
  const registration = await registrationResponse.json()
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.user.id, registration.user.id)
  assert.equal('passwordHash' in body.user, false)
  assert.equal(typeof body.token, 'string')

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${body.token}` },
  })
  const me = await meResponse.json()
  assert.equal(meResponse.status, 200)
  assert.equal(me.user.id, registration.user.id)
  assert.equal(me.user.role, 'APPLICANT')
  assert.equal('passwordHash' in me.user, false)
})

test('invalid credentials and unauthenticated or invalid tokens are rejected', async () => {
  const email = `invalid-${runId}@example.test`
  await register(email)
  const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'WrongPassword123!' }),
  })
  assert.equal(badLogin.status, 401)

  const missingToken = await fetch(`${baseUrl}/api/auth/me`)
  assert.equal(missingToken.status, 401)
  const invalidToken = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: 'Bearer invalid-token' },
  })
  assert.equal(invalidToken.status, 401)
})

test('logout revokes the current JWT so it cannot be reused', async () => {
  const email = `logout-${runId}@example.test`
  const registrationResponse = await register(email)
  const registration = await registrationResponse.json()
  const payload = JSON.parse(Buffer.from(registration.token.split('.')[1], 'base64url').toString())
  testTokenIds.push(payload.jti)

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${registration.token}` },
  })
  assert.equal(logoutResponse.status, 200)
  assert.deepEqual(await logoutResponse.json(), { ok: true })

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  })
  assert.equal(meResponse.status, 401)
})

test('authentication middleware loads current role and permissions from MongoDB', async () => {
  const email = `verifier-${runId}@example.test`
  testEmails.push(email)
  const passwordHash = await bcrypt.hash('TestPassword123!', 10)
  const verifier = await User.create({
    email,
    displayName: 'Provisioned Verifier',
    passwordHash,
    role: 'HUMAN_VERIFIER',
    permissions: ['HUMAN_VERIFY_OCR'],
  })
  const tokenWithStaleRole = signToken({
    id: String(verifier._id),
    role: 'APPLICANT',
    permissions: [],
  })

  const response = await fetch(`${baseUrl}/api/human-verification`, {
    headers: { Authorization: `Bearer ${tokenWithStaleRole}` },
  })
  assert.equal(response.status, 200)

  const applicantEmail = `ordinary-${runId}@example.test`
  const registration = await register(applicantEmail)
  const applicant = await registration.json()
  const denied = await fetch(`${baseUrl}/api/human-verification`, {
    headers: { Authorization: `Bearer ${applicant.token}` },
  })
  assert.equal(denied.status, 403)

  const unauthenticated = await fetch(`${baseUrl}/api/human-verification`)
  assert.equal(unauthenticated.status, 401)
})

test('role and permission middleware reject actors without the required access', () => {
  const response = {
    status(code) {
      this.code = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
  const request = { user: { role: 'APPLICANT', permissions: [] } }

  requireRole('OFFICER')(request, response, () => assert.fail('Role guard unexpectedly allowed access.'))
  assert.equal(response.code, 403)

  requirePermission('HUMAN_VERIFY_OCR')(request, response, () => assert.fail('Permission guard unexpectedly allowed access.'))
  assert.equal(response.code, 403)
})
