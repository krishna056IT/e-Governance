const documentFieldProfiles = new Map([
  ['health certificate', [
    'patientName',
    'certificateNumber',
    'issueDate',
    'issuingDoctor',
    'healthInstitution',
    'certificationPurpose',
  ]],
  ['medical certificate', [
    'patientName',
    'certificateNumber',
    'issueDate',
    'issuingDoctor',
    'healthInstitution',
    'certificationPurpose',
  ]],
  ['income certificate', [
    'applicantName',
    'certificateNumber',
    'annualIncome',
    'issueDate',
    'issuingAuthority',
  ]],
  ['birth certificate', [
    'applicantName',
    'certificateNumber',
    'dateOfBirth',
    'placeOfBirth',
    'parentNames',
    'issueDate',
    'issuingAuthority',
  ]],
  ['driving licence', [
    'applicantName',
    'licenseNumber',
    'dateOfBirth',
    'address',
    'vehicleClass',
    'issueDate',
    'expiryDate',
    'issuingAuthority',
  ]],
  ['driving license', [
    'applicantName',
    'licenseNumber',
    'dateOfBirth',
    'address',
    'vehicleClass',
    'issueDate',
    'expiryDate',
    'issuingAuthority',
  ]],
  ['caste certificate', [
    'applicantName',
    'certificateNumber',
    'caste',
    'community',
    'issueDate',
    'issuingAuthority',
  ]],
  ['domicile certificate', [
    'applicantName',
    'certificateNumber',
    'dateOfBirth',
    'address',
    'issueDate',
    'issuingAuthority',
  ]],
])

function normalizeDocumentType(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeComparableText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

const fieldNameAliases = new Map([
  ['applicant name', 'applicantName'],
  ['name of applicant', 'applicantName'],
  ['patient name', 'patientName'],
  ['certificate no', 'certificateNumber'],
  ['certificate number', 'certificateNumber'],
  ['cert no', 'certificateNumber'],
  ['date of birth', 'dateOfBirth'],
  ['dob', 'dateOfBirth'],
  ['date of issue', 'issueDate'],
  ['date of issuance', 'issueDate'],
  ['expiry date', 'expiryDate'],
  ['expiration date', 'expiryDate'],
  ['valid until', 'expiryDate'],
  ['residential address', 'address'],
  ['issuing authority', 'issuingAuthority'],
  ['annual income', 'annualIncome'],
  ['income', 'annualIncome'],
  ['license number', 'licenseNumber'],
  ['licence number', 'licenseNumber'],
  ['driving licence number', 'licenseNumber'],
  ['driving license number', 'licenseNumber'],
  ['vehicle class', 'vehicleClass'],
  ['place of birth', 'placeOfBirth'],
  ['parent names', 'parentNames'],
  ['issuing doctor', 'issuingDoctor'],
  ['health institution', 'healthInstitution'],
  ['certification purpose', 'certificationPurpose'],
])

function canonicalFieldName(value) {
  const name = String(value || '').trim()
  return fieldNameAliases.get(normalizeDocumentType(name)) || name
}

export function getExpectedDocumentFields(documentType) {
  return documentFieldProfiles.get(normalizeDocumentType(documentType)) || null
}

function isValidDateValue(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) ||
    value.match(/^(\d{2})[/. -](\d{2})[/. -](\d{4})$/)
  if (!match) return false
  const [, first, second, third] = match
  const year = first.length === 4 ? Number(first) : Number(third)
  const month = first.length === 4 ? Number(second) : Number(second)
  const day = first.length === 4 ? Number(third) : Number(first)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function getFieldFormatIssue(name, value) {
  if (['dateOfBirth', 'issueDate', 'expiryDate'].includes(name) && !isValidDateValue(value)) {
    return 'Date format is invalid or unsupported.'
  }
  if (['certificateNumber', 'licenseNumber'].includes(name) &&
      !/^[\p{L}\p{N}][\p{L}\p{N} ./_-]{0,99}$/u.test(value)) {
    return 'Certificate or licence number format is invalid.'
  }
  if (name === 'annualIncome' &&
      !/^(?:(?:INR|Rs\.?|₹|[$€£])\s*)?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:INR|Rs\.?|per annum|per year|\/-))?$/iu.test(value)) {
    return 'Income amount format is invalid.'
  }
  return null
}

export function validateExtractedFields({
  documentType,
  fields,
  ocrText,
  minimumFieldConfidence,
}) {
  const expectedFields = getExpectedDocumentFields(documentType) || []
  const byName = new Map()
  for (const field of Array.isArray(fields) ? fields : []) {
    const name = canonicalFieldName(field.name)
    if (!byName.has(name)) byName.set(name, { ...field, name })
  }
  const names = [...new Set([...expectedFields, ...byName.keys()])]
  return names.map((name) => {
    const source = byName.get(name)
    const value = typeof source?.value === 'string' && source.value.trim() ? source.value.trim() : null
    const evidence = typeof source?.evidence === 'string' && source.evidence.trim() ? source.evidence.trim() : null
    let status = source?.status || 'MISSING'
    let validationIssue = null
    const formatIssue = value ? getFieldFormatIssue(name, value) : null
    if (!value || status === 'MISSING') {
      status = 'MISSING'
      validationIssue = 'Value is missing.'
    } else if (formatIssue) {
      status = 'UNCERTAIN'
      validationIssue = formatIssue
    } else if (status === 'CLEAR' && (
      !Number.isFinite(source?.confidence) ||
      source.confidence < minimumFieldConfidence
    )) {
      status = 'UNCERTAIN'
      validationIssue = 'Field confidence is below the required threshold.'
    } else if (status === 'CLEAR' && (
      !evidence ||
      !String(ocrText || '').includes(evidence) ||
      !normalizeComparableText(evidence).includes(normalizeComparableText(value))
    )) {
      status = 'UNCERTAIN'
      validationIssue = 'Supporting evidence does not exactly match the OCR text.'
    } else if (status !== 'CLEAR') {
      status = 'UNCERTAIN'
      validationIssue = 'The extracted value is uncertain.'
    }
    return {
      name,
      status,
      confidence: Number.isFinite(source?.confidence) ? source.confidence : null,
      value,
      evidence,
      validationIssue,
    }
  })
}

export function calculateOcrQualityMetrics(text) {
  const value = typeof text === 'string' ? text : ''
  const visibleCharacters = value.replace(/\s/g, '')
  const tokens = value.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) || []
  const words = value.match(/[\p{L}\p{N}]+/gu) || []
  let repeatedTokenCount = 0
  for (let index = 0; index < words.length;) {
    let end = index + 1
    const normalized = words[index].normalize('NFKC').toLowerCase()
    while (end < words.length && words[end].normalize('NFKC').toLowerCase() === normalized) end += 1
    if (end - index > 1) repeatedTokenCount += end - index
    index = end
  }
  const lines = value.split(/\r?\n/).map((line) =>
    line.match(/[\p{L}\p{N}]+/gu) || [],
  )
  const lineCounts = new Map()
  for (const lineWords of lines) {
    if (!lineWords.length) continue
    const key = lineWords.map((word) => word.normalize('NFKC').toLowerCase()).join(' ')
    lineCounts.set(key, {
      count: (lineCounts.get(key)?.count || 0) + 1,
      wordCount: lineWords.length,
    })
  }
  for (const { count, wordCount } of lineCounts.values()) {
    if (count > 1) repeatedTokenCount += wordCount * (count - 1)
  }
  const suspiciousTokenCount = tokens.filter((token) =>
    token.includes('\uFFFD') ||
    /[^\p{L}\p{N}]{3,}/u.test(token) ||
    /(.)\1{4,}/u.test(token),
  ).length

  return {
    textLength: value.length,
    wordCount: words.length,
    alphanumericRatio: visibleCharacters.length
      ? (value.match(/[\p{L}\p{N}]/gu) || []).length / visibleCharacters.length
      : 0,
    replacementCharacterRatio: visibleCharacters.length
      ? (value.match(/\uFFFD/gu) || []).length / visibleCharacters.length
      : 0,
    suspiciousTokenRatio: tokens.length ? suspiciousTokenCount / tokens.length : 0,
    repeatedTokenRatio: words.length ? repeatedTokenCount / words.length : 0,
  }
}

export function hasSevereOcrNoise(metrics, config) {
  return metrics.replacementCharacterRatio > config.qualityMaximumNoise ||
    metrics.suspiciousTokenRatio > config.qualityMaximumNoise ||
    metrics.repeatedTokenRatio > config.qualityMaximumNoise ||
    metrics.alphanumericRatio < 1 - config.qualityMaximumNoise
}

export function calculateVerifiedFieldCompleteness({
  documentType,
  fields,
  ocrText,
  minimumFieldConfidence,
}) {
  const expectedFields = getExpectedDocumentFields(documentType)
  if (!expectedFields) {
    return {
      supported: false,
      expectedFieldCount: 0,
      completeFieldCount: 0,
      fieldCompleteness: 0,
      evidenceSupportedFieldCount: 0,
      confidenceQualifiedFieldCount: 0,
      fieldNames: [],
    }
  }

  const byName = new Map((Array.isArray(fields) ? fields : []).map((field) => [field.name, field]))
  let completeFieldCount = 0
  let evidenceSupportedFieldCount = 0
  let confidenceQualifiedFieldCount = 0
  let verifiedFieldCount = 0
  const fieldNames = []
  for (const name of expectedFields) {
    const field = byName.get(name)
    const clearValue = field?.status === 'CLEAR' &&
      typeof field.value === 'string' && Boolean(field.value.trim())
    const exactEvidence = clearValue && typeof field.evidence === 'string' &&
      field.evidence.length > 0 &&
      String(ocrText).includes(field.evidence) &&
      normalizeComparableText(field.evidence).includes(normalizeComparableText(field.value))
    const confidenceQualified = Number.isFinite(field?.confidence) &&
      field.confidence >= minimumFieldConfidence

    if (clearValue) completeFieldCount += 1
    if (exactEvidence) evidenceSupportedFieldCount += 1
    if (clearValue && confidenceQualified) confidenceQualifiedFieldCount += 1
    if (exactEvidence && confidenceQualified) verifiedFieldCount += 1
    if (!clearValue || !exactEvidence || !confidenceQualified) fieldNames.push(name)
  }

  return {
    supported: true,
    expectedFieldCount: expectedFields.length,
    completeFieldCount,
    fieldCompleteness: expectedFields.length ? verifiedFieldCount / expectedFields.length : 0,
    verifiedFieldCount,
    evidenceSupportedFieldCount,
    confidenceQualifiedFieldCount,
    fieldNames,
  }
}

export function decideDocumentQuality({
  ocrConfidence,
  ocrMetrics,
  qualityAssessment,
  verifiedFieldCompleteness,
  config,
}) {
  const fallback = (code) => ({ eligible: false, reasonCode: code })
  if (!Number.isFinite(ocrConfidence) || ocrConfidence < config.confidenceFloor) {
    return fallback('OCR_LOW_CONFIDENCE')
  }
  if (ocrConfidence >= config.ocrThreshold) {
    return { eligible: true, reasonCode: null, band: 'NORMAL_CONFIDENCE' }
  }
  if (ocrMetrics.textLength < config.qualityMinimumTextLength ||
      ocrMetrics.wordCount < config.qualityMinimumWordCount) {
    return fallback('INSUFFICIENT_OCR_TEXT')
  }
  if (hasSevereOcrNoise(ocrMetrics, config) ||
      qualityAssessment.ocrNoiseScore > config.qualityMaximumNoise) {
    return fallback('AI_DOCUMENT_QUALITY_LOW')
  }
  if (!qualityAssessment.isReadable ||
      qualityAssessment.qualityScore < config.qualityMinimumScore ||
      !qualityAssessment.safeForAutomation ||
      qualityAssessment.consistency !== 'CONSISTENT') {
    return fallback('AI_DOCUMENT_QUALITY_LOW')
  }

  if (!verifiedFieldCompleteness.supported) return fallback('LOW_CONFIDENCE_AUTOMATION_UNSUPPORTED')
  if (verifiedFieldCompleteness.fieldCompleteness < config.qualityMinimumCompleteness) {
    return fallback('INSUFFICIENT_FIELDS')
  }
  return { eligible: true, reasonCode: null, band: 'MODERATE_CONFIDENCE' }
}
