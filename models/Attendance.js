const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please add staff ID'],
    },
    staffName: {
      type: String,
      required: [true, 'Please add staff name'],
    },
    date: {
      type: String,
      required: [true, 'Please add date'],
    },
    checkIn: {
      type: String,
    },
    checkOut: {
      type: String,
    },
    duration: {
      type: String,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Half Day'],
      required: [true, 'Please add attendance status'],
    },
    role: {
      type: String,
    },
    activityType: {
      type: String,
      enum: ['On Duty', 'Projects', 'Bank', 'Outside Work', 'Office'],
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    projectName: {
      type: String,
    },
    location: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    checkInTime: {
      type: Date,
    },
    checkOutTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Create index for staffId and date for quicker lookups
AttendanceSchema.index({ staffId: 1, date: 1 });

// Database-backed single-active-session guard per staff member
AttendanceSchema.index(
  { staffId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

AttendanceSchema.pre('validate', function () {
  const isClosed = !!(this.checkOut && this.checkOut !== '-' && this.checkOut !== '—');
  const hasCheckIn = !!(this.checkIn && this.checkIn !== '-' && this.checkIn !== '—');
  if (isClosed || !hasCheckIn || this.status === 'Absent') {
    this.isActive = false;
  }
});

module.exports = mongoose.model('Attendance', AttendanceSchema);