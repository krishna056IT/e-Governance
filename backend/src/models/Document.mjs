import mongoose from 'mongoose'

const correctedFieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    value: { type: String, required: true, maxlength: 10000 },
  },
  { _id: false },
)

const documentSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalFilename: {
      type: String,
      required: true,
      maxlength: 255,
    },
    documentType: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    mimeType: {
      type: String,
      required: true,
      enum: ['application/pdf', 'image/png', 'image/jpeg'],
    },
    fileSize: {
      type: Number,
      required: true,
      min: 1,
    },
    originalStorageId: {
      type: String,
      required: true,
      select: false,
    },
    extractedTextStorageId: {
      type: String,
      default: null,
      select: false,
    },
    ocrStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'LOW_CONFIDENCE', 'FAILED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    ocrConfidence: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    ocrThreshold: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    humanVerificationRequired: {
      type: Boolean,
      default: false,
    },
    humanVerificationStatus: {
      type: String,
      enum: ['PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED', null],
      default: null,
    },
    humanVerificationReason: {
      type: String,
      default: null,
      select: false,
    },
    humanVerificationDecision: {
      type: String,
      enum: ['VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED', null],
      default: null,
    },
    humanReviewStartedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    humanReviewStartedAt: {
      type: Date,
      default: null,
    },
    humanVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    humanVerifiedAt: {
      type: Date,
      default: null,
    },
    humanVerificationNote: {
      type: String,
      maxlength: 2000,
      default: null,
      select: false,
    },
    correctedExtractedData: {
      type: [correctedFieldSchema],
      default: [],
      select: false,
    },
    ocrFailureCode: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
)

documentSchema.index({
  ocrStatus: 1,
  humanVerificationRequired: 1,
  humanVerificationStatus: 1,
  createdAt: 1,
})

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema)

export default Document
