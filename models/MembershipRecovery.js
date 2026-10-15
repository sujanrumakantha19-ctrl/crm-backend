const mongoose = require('mongoose');

const MembershipRecoverySchema = new mongoose.Schema(
  {
    operationType: {
      type: String,
      enum: ['assign', 'sync', 'remove', 'delete_group'],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      index: true,
    },
    previousGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
    },
    targetGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
    },
    operationToken: {
      type: String,
      index: true,
    },
    expectedUserVersions: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    expectedGroupVersion: {
      type: Number,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: String,
      default: null,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'rolled_back', 'failed', 'conflict'],
      default: 'pending',
      index: true,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MembershipRecovery', MembershipRecoverySchema);
