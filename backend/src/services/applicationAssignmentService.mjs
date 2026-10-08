import mongoose from 'mongoose'
import Application from '../models/Application.mjs'
import Department from '../models/Department.mjs'
import User from '../models/User.mjs'
import { recordApplicationStatusTransition } from './applicationLifecycleService.mjs'

function requestError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export async function assignApplication(applicationId, departmentId, actor) {
  if (!mongoose.isValidObjectId(applicationId)) return null
  if (!mongoose.isValidObjectId(departmentId)) {
    throw requestError('Choose a valid Department.', 400)
  }
  const department = await Department.findOne({ _id: departmentId, isActive: true }).lean()
  if (!department) throw requestError('The selected Department is inactive or does not exist.', 400)

  const application = await Application.findOne({
    _id: applicationId,
    status: 'HUMAN_VERIFICATION',
    humanVerificationRequired: true,
    humanVerificationStatus: 'IN_REVIEW',
  }).lean()
  if (!application) throw requestError('This application is no longer under Human Verification review.', 409)

  const eligibleOfficers = await User.find({
    role: 'OFFICER',
    departmentId: String(department._id),
    accountStatus: 'ACTIVE',
    isActive: true,
    mustChangePassword: false,
  }).select('_id').sort({ _id: 1 }).lean()
  const assignedAt = new Date()

  let selectedOfficer = null
  if (eligibleOfficers.length) {
    const officerIds = eligibleOfficers.map(({ _id }) => _id)
    const assignedApplications = await Application.find({
      assignedOfficerId: { $in: officerIds },
      status: { $in: ['ASSIGNED', 'UNDER_REVIEW'] },
    }).select('assignedOfficerId assignedAt').lean()
    const workloadByOfficer = new Map(
      eligibleOfficers.map(({ _id }) => [String(_id), { pending: 0, lastAssignedAt: null }]),
    )
    for (const assigned of assignedApplications) {
      const workload = workloadByOfficer.get(String(assigned.assignedOfficerId))
      if (!workload) continue
      workload.pending += 1
      if (!workload.lastAssignedAt ||
          (assigned.assignedAt && assigned.assignedAt > workload.lastAssignedAt)) {
        workload.lastAssignedAt = assigned.assignedAt || assigned.createdAt || new Date(0)
      }
    }
    selectedOfficer = [...eligibleOfficers].sort((left, right) => {
      const leftWorkload = workloadByOfficer.get(String(left._id))
      const rightWorkload = workloadByOfficer.get(String(right._id))
      if (leftWorkload.pending !== rightWorkload.pending) {
        return leftWorkload.pending - rightWorkload.pending
      }
      const leftLastAssigned = leftWorkload.lastAssignedAt?.getTime() || 0
      const rightLastAssigned = rightWorkload.lastAssignedAt?.getTime() || 0
      if (leftLastAssigned !== rightLastAssigned) return leftLastAssigned - rightLastAssigned
      return String(left._id).localeCompare(String(right._id))
    })[0]
  }

  const nextStatus = selectedOfficer ? 'ASSIGNED' : 'WAITING_FOR_OFFICER'
  const updated = await Application.findOneAndUpdate(
    {
      _id: application._id,
      status: 'HUMAN_VERIFICATION',
      humanVerificationStatus: 'IN_REVIEW',
    },
    {
      $set: {
        status: nextStatus,
        departmentId: department._id,
        assignedOfficerId: selectedOfficer?._id || null,
        assignedAt: selectedOfficer ? assignedAt : null,
        humanVerificationRequired: true,
        humanVerificationStatus: 'PASSED',
        humanVerificationDecision: 'PASS',
        humanVerifierId: actor.id,
        humanVerifiedAt: assignedAt,
        humanVerificationRejectionReason: null,
      },
    },
    { new: true, runValidators: true },
  ).lean()
  if (!updated) throw requestError('This application was updated by another reviewer.', 409)

  await recordApplicationStatusTransition({
    applicationId: updated._id,
    previousStatus: 'HUMAN_VERIFICATION',
    newStatus: nextStatus,
    actor,
    action: selectedOfficer
      ? 'HUMAN_VERIFIED_APPLICATION_ASSIGNED'
      : 'HUMAN_VERIFIED_APPLICATION_WAITING_FOR_OFFICER',
    reason: `Human Verifier manually selected Department ${department.name}.`,
  })

  return {
    application: updated,
    department: { id: String(department._id), name: department.name, code: department.code },
    assignedOfficer: selectedOfficer ? String(selectedOfficer._id) : null,
  }
}
