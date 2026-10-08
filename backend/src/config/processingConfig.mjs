export const DEFAULT_OCR_THRESHOLD = 90

export function getOcrThreshold(env = process.env) {
  const configuredValue = env.OCR_THRESHOLD
  if (configuredValue === undefined || configuredValue.trim() === '') {
    return DEFAULT_OCR_THRESHOLD
  }

  const threshold = Number(configuredValue)
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error('OCR_THRESHOLD must be a number between 0 and 100.')
  }
  return threshold
}
