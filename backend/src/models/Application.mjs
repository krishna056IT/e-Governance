import mongoose from 'mongoose'

const applicationStatuses = [
  'DRAFT',
  'SUBMITTED',
  'PROCESSING',
  'HUMAN_VERIFICATION',
  'OFFICER_REVIEW',
  'ROUTED',
  'WAITING_FOR_OFFICER',
  'ASSIGNED',
  'UNDER_REVIEW',
  'ESCALATED',
  'GENERAL_OFFICER_REVIEW',
  'CORRECTION_REQUIRED',
  'RESUBMITTED',
  'APPROVED',
  'REJECTED',
]

const officerReviewNoteSchema = new mongoose.Schema(
  {
    officerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['STARTED', 'APPROVED', 'REJECTED', 'ESCALATED'], required: true },
    note: { type: String, maxlength: 2000, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
)

const generalOfficerReviewNoteSchema = new mongoose.Schema(
  {
    generalOfficerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['APPROVED', 'REJECTED'], required: true },
    reason: { type: String, maxlength: 2000, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
)

const applicationSchema = new mongoose.Schema(
  {
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    applicationType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    applicationData: {
      title: { type: String, required: true, trim: true, maxlength: 160 },
      applicantName: { type: String, required: true, trim: true, maxlength: 160 },
      contactEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
      details: { type: String, required: true, trim: true, maxlength: 10000 },
    },
    status: {
      type: String,
      enum: applicationStatuses,
      default: 'DRAFT',
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    assignedOfficerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    humanVerificationRequired: {
      type: Boolean,
      default: false,
      index: true,
    },
    humanVerificationStatus: {
      type: String,
      enum: ['PENDING', 'IN_REVIEW', 'PASSED', 'REJECTED', null],
      default: null,
    },
    humanVerificationReason: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    humanVerificationDecision: {
      type: String,
      enum: ['PASS', 'REJECT', null],
      default: null,
    },
    humanVerifierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
    humanVerifiedAt: {
      type: Date,
      default: null,
    },
    humanVerificationRejectionReason: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    officerReview: {
      startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      startedAt: { type: Date, default: null },
      decision: { type: String, enum: ['APPROVED', 'REJECTED', 'ESCALATED', null], default: null },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      decidedAt: { type: Date, default: null },
      reason: { type: String, maxlength: 2000, default: null },
      notes: { type: [officerReviewNoteSchema], default: [] },
    },
    generalOfficerReview: {
      decision: { type: String, enum: ['APPROVED', 'REJECTED', null], default: null },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      decidedAt: { type: Date, default: null },
      reason: { type: String, maxlength: 2000, default: null },
      notes: { type: [generalOfficerReviewNoteSchema], default: [] },
    },
  },
  { timestamps: true },
)

const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema)

export default Application
