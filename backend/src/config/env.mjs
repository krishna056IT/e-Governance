import dotenv from 'dotenv'

dotenv.config()

export const env = {
  PORT: Number(process.env.PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  OCR_THRESHOLD: process.env.OCR_THRESHOLD || '90',
  MONGODB_URI: process.env.MONGODB_URI || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  MAX_UPLOAD_SIZE_BYTES: Number(process.env.MAX_UPLOAD_SIZE_BYTES || 10 * 1024 * 1024),
  MAX_PDF_PAGES: Number(process.env.MAX_PDF_PAGES || 10),
}
