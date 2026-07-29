const mongoose = require('mongoose');

const PlotSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Please add project ID'],
    },
    plotNumber: {
      type: String,
      required: [true, 'Please add plot number'],
    },
    status: {
      type: String,
      enum: ['Available', 'Booked', 'Registered', 'Canceled', 'Pending'],
      default: 'Available',
    },
    facing: {
      type: String,
      default: 'East',
    },
    size: {
      type: Number,
    },
    sizeUnit: {
      type: String,
      default: 'Sq Yards',
    },
    type: {
      type: String,
      enum: ['Residential', 'Commercial', 'Open Plot'],
      default: 'Residential',
    },
    price: {
      type: Number,
    },
    timeline: [
      {
        id: {
          type: String,
        },
        type: {
          type: String,
          enum: [
            'lead_added',
            'reserved',
            'qualified',
            'booking_confirmed',
            'booking_canceled',
            'new_booking',
          ],
        },
        label: {
          type: String,
        },
        actor: {
          type: String,
        },
        actorRole: {
          type: String,
        },
        date: {
          type: String,
        },
        details: {
          type: String,
        },
        color: {
          type: String,
          enum: ['green', 'blue', 'amber', 'red'],
        },
      },
    ],
    bookedBy: {
      name: { type: String },
      phone: { type: String },
      paymentStatus: { type: String, enum: ['Advance Paid', 'Advance Not Paid', 'Fully Paid', 'Partially Paid', 'Not Paid'] },
      paymentMethod: { type: String, enum: ['CASH', 'LOAN'] },
      type: { type: String, enum: ['customer', 'staff'] },
      advanceAmount: { type: Number, default: 0 },
      balanceAmount: { type: Number, default: 0 },
      bank: { type: String },
      bankFollowerName: { type: String },
      bankFollowerPhone: { type: String },
      loanStage: { type: String, default: 'Not Applied' },
      leadId: { type: String },
    },
    pendingApproval: {
      requestType: {
        type: String,
        enum: ['booking', 'cancellation'],
        default: 'booking',
      },
      leadId: {
        type: String,
      },
      customerName: {
        type: String,
      },
      phone: {
        type: String,
      },
      requestedBy: {
        type: String,
      },
      requestedAt: {
        type: String,
      },
      paymentStatus: {
        type: String,
        enum: ['Not Paid', 'Partially Paid', 'Fully Paid'],
      },
      paymentMethod: {
        type: String,
        enum: ['CASH', 'LOAN'],
      },
      notes: {
        type: String,
      },
    },
    expectedRegistrationDate: {
      type: String,
    },
    registrationDate: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for projectId and plotNumber
PlotSchema.index({ projectId: 1, plotNumber: 1 }, { unique: true });
PlotSchema.index({ status: 1 });

module.exports = mongoose.model('Plot', PlotSchema);