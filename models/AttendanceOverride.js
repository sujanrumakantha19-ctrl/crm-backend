const mongoose = require('mongoose');

const AttendanceOverrideSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please add staff ID'],
    },
    date: {
      type: String,
      required: [true, 'Please add date (YYYY-MM-DD)'],
    },
    status: {
      type: String,
      enum: ['Present', 'Half Day', 'Absent'],
      required: [true, 'Please add attendance status'],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    overriddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique override per staff member per calendar date
AttendanceOverrideSchema.index({ staffId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceOverride', AttendanceOverrideSchema);
