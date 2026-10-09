import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DocumentExtractionError,
  extractDocumentInformation,
} from '../src/services/documentExtractionService.mjs'
import { validateExtractedFields } from '../src/services/documentQualityService.mjs'

function providerResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload },
  }
}

const incomeResult = {
  documentType: 'Income Certificate',
  fields: [
    {
      name: 'applicantName',
      status: 'CLEAR',
      confidence: 0.98,
      value: 'Asha Sharma',
      evidence: 'Applicant: Asha Sharma',
    },
  ],
}

test('Gemini structured response is parsed using a mocked API request', async () => {
  let sentRequest
  const result = await extractDocumentInformation({
    text: 'INCOME CERTIFICATE\nApplicant: Asha Sharma',
    apiKey: 'test-only-key',
    model: 'gemini-test',
    fetchImpl: async (url, options) => {
      sentRequest = { url, options, body: JSON.parse(options.body) }
      return providerResponse({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify(incomeResult) }] },
        }],
      })
    },
  })

  assert.equal(result.documentType, 'Income Certificate')
  assert.equal(result.fields[0].value, 'Asha Sharma')
  assert.match(sentRequest.url, /gemini-test:generateContent$/)
  assert.equal(sentRequest.options.headers['x-goog-api-key'], 'test-only-key')
  assert.doesNotMatch(sentRequest.body.contents[0].parts[0].text, /Selected government service/)
  assert.match(sentRequest.body.contents[0].parts[0].text, /OCR text:\nINCOME CERTIFICATE/)
  assert.equal(sentRequest.body.generationConfig.responseMimeType, 'application/json')
})

test('missing required document fields remain null and route-worthy', () => {
  const fields = validateExtractedFields({
    documentType: 'Income Certificate',
    fields: incomeResult.fields,
    ocrText: 'INCOME CERTIFICATE\nApplicant: Asha Sharma',
    minimumFieldConfidence: 0.95,
  })

  const annualIncome = fields.find((field) => field.name === 'annualIncome')
  assert.equal(annualIncome.status, 'MISSING')
  assert.equal(annualIncome.value, null)
  assert.equal(annualIncome.validationIssue, 'Value is missing.')
  assert.equal(fields.find((field) => field.name === 'applicantName').status, 'CLEAR')
})

test('invalid date formats and unsupported evidence are marked uncertain', () => {
  const fields = validateExtractedFields({
    documentType: 'Birth Certificate',
    fields: [
      {
        name: 'dateOfBirth',
        status: 'CLEAR',
        confidence: 0.99,
        value: '31 February 2001',
        evidence: 'Date of birth: 31 February 2001',
      },
    ],
    ocrText: 'BIRTH CERTIFICATE\nDate of birth: 31 February 2001',
    minimumFieldConfidence: 0.95,
  })
  const dateOfBirth = fields.find((field) => field.name === 'dateOfBirth')
  assert.equal(dateOfBirth.status, 'UNCERTAIN')
  assert.equal(dateOfBirth.validationIssue, 'Date format is invalid or unsupported.')
  assert.equal(fields.find((field) => field.name === 'applicantName').value, null)
})

test('common field labels normalize to the verifier field names and low confidence stays uncertain', () => {
  const fields = validateExtractedFields({
    documentType: 'Income Certificate',
    fields: [{
      name: 'Applicant Name',
      status: 'CLEAR',
      confidence: 0.7,
      value: 'Asha Sharma',
      evidence: 'Applicant: Asha Sharma',
    }],
    ocrText: 'Applicant: Asha Sharma',
    minimumFieldConfidence: 0.95,
  })
  const applicantName = fields.find((field) => field.name === 'applicantName')
  assert.equal(applicantName.status, 'UNCERTAIN')
  assert.match(applicantName.validationIssue, /confidence/)
  assert.equal(fields.filter((field) => field.name === 'applicantName').length, 1)
})

test('rate limits and malformed provider output become explicit extraction errors', async () => {
  await assert.rejects(
    extractDocumentInformation({
      text: 'synthetic OCR text',
      apiKey: 'test-only-key',
      fetchImpl: async () => providerResponse({}, 429),
    }),
    (error) => error instanceof DocumentExtractionError && error.code === 'RATE_LIMITED',
  )
  await assert.rejects(
    extractDocumentInformation({
      text: 'synthetic OCR text',
      apiKey: 'test-only-key',
      fetchImpl: async () => providerResponse({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"fields": []}' }] } }],
      }),
    }),
    (error) => error instanceof DocumentExtractionError && error.code === 'INVALID_RESPONSE',
  )
})

test('provider timeout and missing credentials never return a successful extraction', async () => {
  await assert.rejects(
    extractDocumentInformation({
      text: 'synthetic OCR text',
      apiKey: 'test-only-key',
      fetchImpl: async () => {
        const error = new Error('timeout')
        error.name = 'AbortError'
        throw error
      },
    }),
    (error) => error instanceof DocumentExtractionError && error.code === 'TIMEOUT',
  )
  await assert.rejects(
    extractDocumentInformation({
      text: 'synthetic OCR text',
      apiKey: '',
    }),
    (error) => error instanceof DocumentExtractionError && error.code === 'NOT_CONFIGURED',
  )
})
