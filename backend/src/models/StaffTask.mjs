import mongoose from 'mongoose'

const extensionSchema = new mongoose.Schema({
  previousDueAt: { type: Date, required: true, immutable: true },
  newDueAt: { type: Date, required: true, immutable: true },
  reason: { type: String, required: true, maxlength: 2000, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  extendedAt: { type: Date, required: true, immutable: true },
}, { _id: false })

const staffTaskSchema = new mongoose.Schema({
  taskType: {
    type: String,
    enum: ['OFFICER_APPLICATION', 'HUMAN_VERIFICATION_APPLICATION', 'HUMAN_VERIFICATION_DOCUMENT'],
    required: true,
    immutable: true,
  },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  staffRole: { type: String, enum: ['OFFICER', 'HUMAN_VERIFIER', 'GENERAL_OFFICER'], required: true, immutable: true },
  assignedAt: { type: Date, required: true, immutable: true },
  dueAt: { type: Date, required: true },
  completedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ['ASSIGNED', 'COMPLETED', 'OVERDUE', 'COMPLETED_OVERDUE', 'REASSIGNED', 'REASSIGNED_OVERDUE'],
    default: 'ASSIGNED',
    required: true,
    index: true,
  },
  reassignedAt: { type: Date, default: null },
  extensions: { type: [extensionSchema], default: [] },
}, { timestamps: true })

staffTaskSchema.index({ status: 1, dueAt: 1 })
staffTaskSchema.index({ staffId: 1, createdAt: -1 })
staffTaskSchema.index({ taskType: 1, applicationId: 1, documentId: 1, assignedAt: -1 })

const StaffTask = mongoose.models.StaffTask || mongoose.model('StaffTask', staffTaskSchema)

export default StaffTask
