import mongoose from 'mongoose'
import AuditEvent from '../models/AuditEvent.mjs'

export async function createAuditEvent({
  applicationId = null,
  documentId = null,
  actor,
  action,
  previousStatus = null,
  newStatus = null,
  reason = null,
  idempotencyKey,
}) {
  if (actor?.role !== 'SYSTEM' && (!actor?.id || !mongoose.isValidObjectId(actor.id))) {
    throw new Error('An authenticated actor is required to create an audit event.')
  }
  if (!actor.role) throw new Error('An authenticated actor role is required to create an audit event.')

  const event = {
    applicationId,
    documentId,
    actorId: actor.id,
    actorRole: actor.role,
    action,
    previousStatus,
    newStatus,
    reason,
    occurredAt: new Date(),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }
  try {
    return await AuditEvent.create(event)
  } catch (error) {
    if (idempotencyKey && error?.code === 11000) {
      const existing = await AuditEvent.findOne({ idempotencyKey })
      if (existing) return existing
    }
    throw error
  }
}
