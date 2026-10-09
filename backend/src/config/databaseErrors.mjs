const transientMongoErrorNames = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTopologyClosedError',
  'MongoPoolClearedError',
  'MongoNotConnectedError',
  'MongooseServerSelectionError',
])

const transientNetworkCodes = new Set([
  'DATABASE_UNAVAILABLE',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR',
])

export function isDatabaseUnavailableError(error, depth = 0) {
  if (!error || typeof error !== 'object' || depth > 4) return false
  if (transientMongoErrorNames.has(error.name)) return true
  if (transientNetworkCodes.has(error.code)) return true
  if (Array.isArray(error.errorLabels) && error.errorLabels.includes('ResetPool')) return true
  if (error.name === 'MongooseError' && /buffering timed out|connection .* closed|topology .* closed/i.test(error.message || '')) {
    return true
  }
  return error.cause ? isDatabaseUnavailableError(error.cause, depth + 1) : false
}

export function databaseErrorDetails(error) {
  const rootCause = error?.cause && typeof error.cause === 'object' ? error.cause : null
  return {
    name: typeof error?.name === 'string' ? error.name : 'UnknownError',
    code: typeof error?.code === 'string' ? error.code : undefined,
    causeName: typeof rootCause?.name === 'string' ? rootCause.name : undefined,
    causeCode: typeof rootCause?.code === 'string' ? rootCause.code : undefined,
    message: typeof error?.message === 'string'
      ? error.message
        .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[redacted MongoDB URI]')
        .slice(0, 300)
      : undefined,
  }
}
