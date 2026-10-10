import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

process.env.CORS_ORIGINS = 'http://localhost:5173,https://audit-test.netlify.app'

const [
  { default: app },
  { env },
  { requirePermission, requireRole, signToken },
  { serializeUser, ROLE_PERMISSIONS, hasPermission, isRole },
  { default: User },
] = await Promise.all([
  import('../src/app.mjs'),
  import('../src/config/env.mjs'),
  import('../src/middleware/auth.mjs'),
  import('../src/services/authService.mjs'),
  import('../src/models/User.mjs'),
])

const netlifyOrigin = 'https://audit-test.netlify.app'
let server
let baseUrl

before(async () => {
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
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
})

test('configured Netlify origin can preflight authenticated API requests', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'OPTIONS',
    headers: {
      Origin: netlifyOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), netlifyOrigin)
  assert.match(response.headers.get('access-control-allow-headers') || '', /authorization/i)
  assert.match(response.headers.get('access-control-allow-headers') || '', /content-type/i)
})

test('unconfigured origins do not receive CORS permission', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://untrusted.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.ok([200, 204].includes(response.status))
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('CORS headers are present on authentication failures for allowed origins', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Origin: netlifyOrigin },
  })
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('access-control-allow-origin'), netlifyOrigin)

  const protectedAdminRoute = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Origin: netlifyOrigin },
  })
  assert.equal(protectedAdminRoute.status, 401)
  assert.equal(protectedAdminRoute.headers.get('access-control-allow-origin'), netlifyOrigin)
})

test('missing, malformed, and expired bearer tokens are rejected before database access', async () => {
  const missing = await fetch(`${baseUrl}/api/auth/me`)
  assert.equal(missing.status, 401)

  const malformed = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: 'Bearer invalid-token' },
  })
  assert.equal(malformed.status, 401)

  const expiredToken = jwt.sign(
    { sub: '000000000000000000000001' },
    env.JWT_SECRET,
    { expiresIn: -1, jwtid: 'auth-boundary-expired-token' },
  )
  const expired = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  })
  assert.equal(expired.status, 401)

  const unsupportedAlgorithmToken = jwt.sign(
    { sub: '000000000000000000000001' },
    env.JWT_SECRET,
    { algorithm: 'HS512', expiresIn: '1h', jwtid: 'auth-boundary-wrong-algorithm' },
  )
  const unsupportedAlgorithm = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${unsupportedAlgorithmToken}` },
  })
  assert.equal(unsupportedAlgorithm.status, 401)
})

test('register and login return an explicit unavailable response when MongoDB is disconnected', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: netlifyOrigin },
    body: JSON.stringify({
      email: 'synthetic-auth-test@example.test',
      password: 'SyntheticPassword123!',
      displayName: 'Synthetic Auth Test',
      role: 'ADMIN',
    }),
  })
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('access-control-allow-origin'), netlifyOrigin)
  assert.match((await response.json()).error, /database connection failed/i)
})

test('JWTs contain a unique ID, expiry, and expected subject claims', () => {
  const user = {
    id: '000000000000000000000001',
    role: 'APPLICANT',
    permissions: ROLE_PERMISSIONS.APPLICANT,
  }
  const token = signToken(user)
  const payload = jwt.verify(token, env.JWT_SECRET)
  assert.equal(payload.sub, user.id)
  assert.equal(payload.role, 'APPLICANT')
  assert.deepEqual(payload.permissions, ['APPLICATION_CREATE'])
  assert.equal(typeof payload.jti, 'string')
  assert.equal(typeof payload.exp, 'number')
  assert.notEqual(jwt.verify(signToken(user), env.JWT_SECRET).jti, payload.jti)
})

test('user serialization excludes password and all one-time token credentials', () => {
  const serialized = serializeUser({
    _id: '000000000000000000000001',
    email: 'synthetic-auth-test@example.test',
    passwordHash: 'not-a-real-hash',
    setupTokenHash: 'setup-hash',
    setupTokenExpiresAt: new Date(),
    passwordResetTokenHash: 'reset-hash',
    passwordResetTokenExpiresAt: new Date(),
    registrationAccessTokenHash: 'registration-hash',
    registrationAccessTokenExpiresAt: new Date(),
  })
  for (const field of [
    'passwordHash',
    'setupTokenHash',
    'setupTokenExpiresAt',
    'passwordResetTokenHash',
    'passwordResetTokenExpiresAt',
    'registrationAccessTokenHash',
    'registrationAccessTokenExpiresAt',
  ]) {
    assert.equal(field in serialized, false, `${field} must not be serialized`)
  }
  assert.equal(User.schema.path('passwordResetTokenHash').options.select, false)
  assert.equal(User.schema.path('passwordResetTokenExpiresAt').options.select, false)

  const modelSafeUser = new User({
    email: 'synthetic-auth-test@example.test',
    displayName: 'Synthetic Auth Test',
    passwordHash: 'not-a-real-hash',
    setupTokenHash: 'setup-hash',
    passwordResetTokenHash: 'reset-hash',
    registrationAccessTokenHash: 'registration-hash',
  }).toSafeObject()
  for (const field of [
    'passwordHash',
    'setupTokenHash',
    'passwordResetTokenHash',
    'registrationAccessTokenHash',
  ]) {
    assert.equal(field in modelSafeUser, false, `${field} must not be in the model safe object`)
  }
})

test('bcrypt password verification and role permissions match configured roles', async () => {
  const password = 'SyntheticPassword123!'
  const hash = await bcrypt.hash(password, 10)
  assert.notEqual(hash, password)
  assert.equal(await bcrypt.compare(password, hash), true)
  assert.equal(await bcrypt.compare('WrongPassword123!', hash), false)

  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    assert.equal(isRole({ role }, role), true)
    for (const permission of permissions) {
      assert.equal(hasPermission({ permissions }, permission), true)
    }
  }
  assert.equal(isRole({ role: 'APPLICANT' }, 'ADMIN'), false)
  assert.equal(hasPermission({ permissions: [] }, 'USER_MANAGE'), false)

  const deniedResponse = {
    statusCode: 200,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  requireRole('ADMIN')({ user: { role: 'APPLICANT' } }, deniedResponse, () => {
    assert.fail('A non-Admin role passed the Admin guard.')
  })
  assert.equal(deniedResponse.statusCode, 403)

  let adminRoleAllowed = false
  requireRole('ADMIN')({ user: { role: 'ADMIN' } }, deniedResponse, () => {
    adminRoleAllowed = true
  })
  assert.equal(adminRoleAllowed, true)

  requirePermission('USER_MANAGE')({
    user: { role: 'ADMIN', permissions: ['ORG_OVERVIEW'] },
  }, deniedResponse, () => {
    assert.fail('An Admin without USER_MANAGE passed the permission guard.')
  })
  assert.equal(deniedResponse.statusCode, 403)

  let adminPermissionAllowed = false
  requirePermission('USER_MANAGE')({
    user: { role: 'ADMIN', permissions: ROLE_PERMISSIONS.ADMIN },
  }, deniedResponse, () => {
    adminPermissionAllowed = true
  })
  assert.equal(adminPermissionAllowed, true)
})

test('production refuses the development or a short JWT secret', () => {
  const script = "import('./src/config/env.mjs')"
  const common = {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  }
  const weakSecret = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    ...common,
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me' },
  })
  assert.notEqual(weakSecret.status, 0)
  assert.match(weakSecret.stderr, /JWT_SECRET of at least 32 bytes/)

  const strongSecret = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    ...common,
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) },
  })
  assert.equal(strongSecret.status, 0, strongSecret.stderr)
})
