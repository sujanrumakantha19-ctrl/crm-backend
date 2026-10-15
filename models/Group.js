const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add group name'],
    },
    description: {
      type: String,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    membershipVersion: {
      type: Number,
      default: 0,
    },
    membershipOperationToken: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

GroupSchema.index({ name: 1 });

module.exports = mongoose.model('Group', GroupSchema);