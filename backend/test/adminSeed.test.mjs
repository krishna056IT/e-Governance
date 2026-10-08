import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { ensureDevelopmentAdmin } from '../src/services/adminSeedService.mjs'

const adminPermissions = [
  'ORG_OVERVIEW',
  'APPLICATION_VIEW_ALL',
  'USER_MANAGE',
  'DEPARTMENT_MANAGE',
]

function createUserModel(initialUsers = []) {
  const users = initialUsers.map((user) => ({ ...user }))

  return {
    users,
    find(filter) {
      return {
        select() { return this },
        lean: async () => users.filter((user) => user.role === filter.role),
      }
    },
    findOne(filter) {
      return {
        select() { return this },
        lean: async () => users.find((user) => user.email === filter.email) || null,
      }
    },
    async create(user) {
      const createdUser = { _id: `user-${users.length + 1}`, ...user }
      users.push(createdUser)
      return createdUser
    },
    async updateOne(filter, update) {
      const user = users.find((candidate) =>
        candidate._id === filter._id && candidate.role === filter.role,
      )
      if (!user) return { matchedCount: 0 }
      Object.assign(user, update.$set)
      return { matchedCount: 1 }
    },
    async deleteMany(filter) {
      const ids = new Set((filter._id.$in || []).map((id) => String(id)))
      const remaining = users.filter((user) => !ids.has(String(user._id)) || user.role !== 'ADMIN')
      users.length = 0
      users.push(...remaining)
      return { deletedCount: remaining.length }
    },
  }
}

test('development seed creates exactly one bcrypt-protected Admin', async () => {
  const UserModel = createUserModel()
  const result = await ensureDevelopmentAdmin({
    email: ' Admin@Example.com ',
    password: 'LocalDevelopmentPassword!',
    nodeEnv: 'development',
    UserModel,
  })

  assert.equal(result.created, true)
  assert.equal(result.adminsFound, 0)
  assert.equal(result.finalAdminCount, 1)
  assert.equal(UserModel.users.length, 1)
  assert.equal(UserModel.users[0].email, 'admin@example.com')
  assert.equal(UserModel.users[0].role, 'ADMIN')
  assert.deepEqual(UserModel.users[0].permissions, adminPermissions)
  assert.equal(UserModel.users[0].isActive, true)
  assert.notEqual(UserModel.users[0].passwordHash, 'LocalDevelopmentPassword!')
  assert.equal(await bcrypt.compare('LocalDevelopmentPassword!', UserModel.users[0].passwordHash), true)
})

test('re-running the seed updates the canonical Admin without leaving duplicates', async () => {
  const UserModel = createUserModel([
    { _id: 'admin-1', email: 'admin@example.com', displayName: 'Existing Admin', role: 'ADMIN', permissions: [], isActive: false, passwordHash: 'old-hash' },
    { _id: 'admin-2', email: 'second@example.com', displayName: 'Duplicate Admin', role: 'ADMIN', permissions: ['OLD'], isActive: true, passwordHash: 'duplicate-hash' },
  ])

  const result = await ensureDevelopmentAdmin({
    email: 'admin@example.com',
    password: 'NewLocalDevelopmentPassword!',
    nodeEnv: 'development',
    UserModel,
  })

  assert.equal(result.created, false)
  assert.equal(result.adminsFound, 2)
  assert.equal(result.duplicateAdminsRemoved, 1)
  assert.equal(result.finalAdminCount, 1)
  assert.equal(UserModel.users.length, 1)
  assert.equal(UserModel.users[0].email, 'admin@example.com')
  assert.equal(UserModel.users[0].role, 'ADMIN')
  assert.equal(UserModel.users[0].isActive, true)
  assert.deepEqual(UserModel.users[0].permissions, adminPermissions)
  assert.equal(await bcrypt.compare('NewLocalDevelopmentPassword!', UserModel.users[0].passwordHash), true)
})

test('seed converts the first existing Admin to the configured canonical admin instead of creating a second duplicate', async () => {
  const UserModel = createUserModel([
    { _id: 'admin-1', email: 'old-admin@example.com', displayName: 'Old Admin', role: 'ADMIN', permissions: [], isActive: false, passwordHash: 'old-hash' },
    { _id: 'admin-2', email: 'other-admin@example.com', displayName: 'Other Admin', role: 'ADMIN', permissions: [], isActive: true, passwordHash: 'other-hash' },
  ])

  const result = await ensureDevelopmentAdmin({
    email: 'admin@example.com',
    password: 'CanonicalAdminPassword!',
    nodeEnv: 'development',
    UserModel,
  })

  assert.equal(result.created, false)
  assert.equal(result.adminsFound, 2)
  assert.equal(result.duplicateAdminsRemoved, 1)
  assert.equal(result.finalAdminCount, 1)
  assert.equal(UserModel.users[0].email, 'admin@example.com')
  assert.equal(UserModel.users[0].role, 'ADMIN')
  assert.equal(await bcrypt.compare('CanonicalAdminPassword!', UserModel.users[0].passwordHash), true)
})

test('seed refuses to assign the configured email to a non-admin account and rejects invalid configuration', async () => {
  const UserModel = createUserModel([
    { _id: 'admin-1', email: 'existing-admin@example.com', role: 'ADMIN' },
    { _id: 'applicant-1', email: 'new-admin@example.com', role: 'APPLICANT' },
  ])

  await assert.rejects(
    () => ensureDevelopmentAdmin({
      email: 'new-admin@example.com',
      password: 'LocalDevelopmentPassword!',
      nodeEnv: 'development',
      UserModel,
    }),
    /already used by another account; refusing to change its role/,
  )

  await assert.rejects(
    () => ensureDevelopmentAdmin({
      email: 'admin@example.com',
      password: 'LocalDevelopmentPassword!',
      nodeEnv: 'production',
      UserModel: createUserModel(),
    }),
    /only when NODE_ENV is development/,
  )

  await assert.rejects(
    () => ensureDevelopmentAdmin({
      email: 'admin@example.com',
      password: 'too-short',
      nodeEnv: 'development',
      UserModel: createUserModel(),
    }),
    /at least 12 characters/,
  )
})
