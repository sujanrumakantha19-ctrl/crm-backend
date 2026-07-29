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
  },
  {
    timestamps: true,
  }
);

GroupSchema.index({ name: 1 });

module.exports = mongoose.model('Group', GroupSchema);