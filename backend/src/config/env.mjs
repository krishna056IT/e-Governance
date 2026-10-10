import dotenv from 'dotenv'

dotenv.config()

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me'
const nodeEnv = process.env.NODE_ENV || 'development'
if (nodeEnv === 'production' &&
    (jwtSecret === 'dev-secret-change-me' || Buffer.byteLength(jwtSecret, 'utf8') < 32)) {
  throw new Error('Production configuration requires a JWT_SECRET of at least 32 bytes.')
}

export const env = {
  PORT: Number(process.env.PORT || 4000),
  NODE_ENV: nodeEnv,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  OCR_THRESHOLD: process.env.OCR_THRESHOLD || '90',
  OCR_LANGUAGES: process.env.OCR_LANGUAGES || 'eng+hin',
  MONGODB_URI: process.env.MONGODB_URI || '',
  DOCUMENT_STORAGE_DIR: process.env.DOCUMENT_STORAGE_DIR || '',
  CORS_ORIGINS: (process.env.CORS_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  MAX_UPLOAD_SIZE_BYTES: Number(process.env.MAX_UPLOAD_SIZE_BYTES || 10 * 1024 * 1024),
  MAX_PDF_PAGES: Number(process.env.MAX_PDF_PAGES || 10),
  AI_CLASSIFICATION_API_URL: process.env.AI_CLASSIFICATION_API_URL || '',
  AI_CLASSIFICATION_API_KEY: process.env.AI_CLASSIFICATION_API_KEY || '',
  AI_CLASSIFICATION_MODEL: process.env.AI_CLASSIFICATION_MODEL || '',
  AI_CLASSIFICATION_TIMEOUT_MS: Number(process.env.AI_CLASSIFICATION_TIMEOUT_MS || 15000),
  DOCUMENT_EXTRACTION_PROVIDER: (process.env.DOCUMENT_EXTRACTION_PROVIDER || 'tesseract').toLowerCase(),
  DOCUMENT_EXTRACTION_TIMEOUT_MS: Number(process.env.DOCUMENT_EXTRACTION_TIMEOUT_MS || 15000),
  DOCUMENT_EXTRACTION_FALLBACK_TO_TESSERACT: process.env.DOCUMENT_EXTRACTION_FALLBACK_TO_TESSERACT || 'true',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  OCR_QUALITY_HARD_MINIMUM: process.env.OCR_QUALITY_HARD_MINIMUM || '50',
  OCR_QUALITY_MODERATE_FLOOR: process.env.OCR_QUALITY_MODERATE_FLOOR || '60',
  OCR_AUTOMATION_MIN_TEXT_LENGTH: process.env.OCR_AUTOMATION_MIN_TEXT_LENGTH || '80',
  OCR_QUALITY_MIN_TEXT_LENGTH: process.env.OCR_QUALITY_MIN_TEXT_LENGTH || '30',
  OCR_QUALITY_MIN_WORD_COUNT: process.env.OCR_QUALITY_MIN_WORD_COUNT || '4',
  OCR_QUALITY_MIN_SCORE: process.env.OCR_QUALITY_MIN_SCORE || '0.85',
  OCR_QUALITY_STRONG_SCORE: process.env.OCR_QUALITY_STRONG_SCORE || '0.95',
  OCR_QUALITY_MIN_COMPLETENESS: process.env.OCR_QUALITY_MIN_COMPLETENESS || '0.8',
  OCR_QUALITY_STRONG_COMPLETENESS: process.env.OCR_QUALITY_STRONG_COMPLETENESS || '0.95',
  OCR_QUALITY_MAX_NOISE: process.env.OCR_QUALITY_MAX_NOISE || '0.2',
  OCR_QUALITY_STRONG_MAX_NOISE: process.env.OCR_QUALITY_STRONG_MAX_NOISE || '0.05',
  AI_CLASSIFICATION_MIN_CONFIDENCE: process.env.AI_CLASSIFICATION_MIN_CONFIDENCE || '0.9',
  AI_CRITICAL_FIELD_MIN_CONFIDENCE: process.env.AI_CRITICAL_FIELD_MIN_CONFIDENCE || '0.95',
  // The chatbot reuses the existing classification provider credentials when
  // dedicated chatbot overrides are not supplied.
  GROQ_API_KEY: process.env.GROQ_API_KEY || process.env.AI_CLASSIFICATION_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || (
    (process.env.AI_CLASSIFICATION_API_URL || '').includes('api.groq.com')
      ? process.env.AI_CLASSIFICATION_MODEL || 'llama-3.3-70b-versatile'
      : 'llama-3.3-70b-versatile'
  ),
}
