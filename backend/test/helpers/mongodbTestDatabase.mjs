import mongoose from 'mongoose'
import { connectDatabase, isDatabaseConnected } from '../../src/config/database.mjs'
import { env } from '../../src/config/env.mjs'

const testDatabaseNamePattern = /(?:^|[-_])test(?:$|[-_])/i

export function validateMongoTestUri(uri = process.env.MONGODB_TEST_URI) {
  if (!uri) {
    throw new Error('MONGODB_TEST_URI is required to run MongoDB integration tests.')
  }

  let parsedUri
  try {
    parsedUri = new URL(uri)
  } catch {
    throw new Error('MONGODB_TEST_URI must be a valid MongoDB connection URI.')
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(parsedUri.protocol)) {
    throw new Error('MONGODB_TEST_URI must use the mongodb or mongodb+srv protocol.')
  }

  const databaseName = decodeURIComponent(parsedUri.pathname.replace(/^\/+/, ''))
  if (!testDatabaseNamePattern.test(databaseName)) {
    throw new Error('MONGODB_TEST_URI must use a database name with "test" as a separate hyphen- or underscore-delimited segment.')
  }

  return uri
}

export async function connectTestDatabase() {
  const testUri = validateMongoTestUri()
  if (mongoose.connection.readyState !== 0) {
    throw new Error('Refusing to run MongoDB integration tests because a database connection already exists.')
  }

  const originalMongoUri = env.MONGODB_URI
  env.MONGODB_URI = testUri
  try {
    const connection = await connectDatabase()
    if (!connection || !isDatabaseConnected()) {
      throw new Error('Could not connect to MONGODB_TEST_URI for MongoDB integration tests.')
    }
    return connection
  } catch (error) {
    env.MONGODB_URI = originalMongoUri
    throw error
  }
}
