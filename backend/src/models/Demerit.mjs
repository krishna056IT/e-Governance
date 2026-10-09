import mongoose from 'mongoose'

const demeritSchema = new mongoose.Schema({
  staffTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StaffTask',
    required: true,
    unique: true,
    immutable: true,
  },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, immutable: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, immutable: true },
  points: { type: Number, required: true, min: 1, default: 1, immutable: true },
  recordedAt: { type: Date, required: true, immutable: true },
  dueAt: { type: Date, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } })

demeritSchema.index({ staffId: 1, recordedAt: -1 })

const Demerit = mongoose.models.Demerit || mongoose.model('Demerit', demeritSchema)

export default Demerit
