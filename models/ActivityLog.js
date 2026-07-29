const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: String,
      required: [true, 'Please add actor ID'],
    },
    actorName: {
      type: String,
      required: [true, 'Please add actor name'],
    },
    actorRole: {
      type: String,
      required: [true, 'Please add actor role'],
    },
    actorInitials: {
      type: String,
    },
    actorAvatarBg: {
      type: String,
    },
    action: {
      type: String,
      required: [true, 'Please add action'],
    },
    actionType: {
      type: String,
      enum: ['Created', 'Updated', 'Deleted', 'Status Change'],
      required: [true, 'Please add action type'],
    },
    entityType: {
      type: String,
      required: [true, 'Please add entity type'],
    },
    entityId: {
      type: String,
    },
    entityName: {
      type: String,
    },
    timestamp: {
      type: String,
      required: [true, 'Please add timestamp'],
    },
    ipAddress: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Create index for quicker lookups
ActivityLogSchema.index({ entityType: 1, entityId: 1 });
ActivityLogSchema.index({ timestamp: -1 }); // For recent activities

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);