import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectTestDatabase, validateMongoTestUri } from './helpers/mongodbTestDatabase.mjs'

test('MongoDB test URI accepts test as a database-name segment', () => {
  for (const uri of [
    'mongodb://localhost:27017/hackbios_test',
    'mongodb+srv://user:pass@example.mongodb.net/hackbios-test-data?retryWrites=true',
    'mongodb://localhost:27017/test',
  ]) {
    assert.equal(validateMongoTestUri(uri), uri)
  }
})

test('MongoDB test URI rejects missing, invalid, and non-test database names', () => {
  for (const uri of [
    '',
    'not-a-mongodb-uri',
    'http://localhost:27017/hackbios_test',
    'mongodb://localhost:27017/hackbios',
    'mongodb://localhost:27017/hackbiostest',
    'mongodb://localhost:27017/testing',
  ]) {
    assert.throws(() => validateMongoTestUri(uri))
  }
})

test('missing test URI refuses to connect even when the normal URI is loaded', async () => {
  const previousTestUri = process.env.MONGODB_TEST_URI
  delete process.env.MONGODB_TEST_URI
  try {
    await assert.rejects(connectTestDatabase(), /MONGODB_TEST_URI is required/)
    assert.equal(mongoose.connection.readyState, 0)
  } finally {
    if (previousTestUri === undefined) delete process.env.MONGODB_TEST_URI
    else process.env.MONGODB_TEST_URI = previousTestUri
  }
})

test('existing Mongoose connection is left untouched', async () => {
  const previousTestUri = process.env.MONGODB_TEST_URI
  const connection = mongoose.connection
  const originalReadyState = connection.readyState
  const originalDb = connection.db
  const originalClient = connection.client
  const readyStateDescriptor = Object.getOwnPropertyDescriptor(connection, 'readyState')

  process.env.MONGODB_TEST_URI = 'mongodb://localhost:27017/hackbios_test'
  Object.defineProperty(connection, 'readyState', {
    configurable: true,
    get: () => 1,
  })

  try {
    await assert.rejects(connectTestDatabase(), /connection already exists/)
    assert.equal(mongoose.connection, connection)
    assert.equal(connection.readyState, 1)
    assert.equal(connection.db, originalDb)
    assert.equal(connection.client, originalClient)
  } finally {
    if (readyStateDescriptor) {
      Object.defineProperty(connection, 'readyState', readyStateDescriptor)
    } else {
      delete connection.readyState
    }
    assert.equal(connection.readyState, originalReadyState)
    if (previousTestUri === undefined) delete process.env.MONGODB_TEST_URI
    else process.env.MONGODB_TEST_URI = previousTestUri
  }
})
