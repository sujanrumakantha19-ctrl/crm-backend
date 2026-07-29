const mongoose = require('mongoose');
const Counter = require('./Counter');

const LeadSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'Please add customer name'],
    },
    phone: {
      type: String,
      required: [true, 'Please add phone number'],
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Not Specified'],
      default: 'Not Specified',
    },
    email: {
      type: String,
    },
    city: {
      type: String,
    },
    budgetMin: {
      type: Number,
    },
    budgetMax: {
      type: Number,
    },
    budget: {
      type: mongoose.Schema.Types.Mixed,
    },
    category: {
      type: String,
    },
    propertyInterest: {
      type: String,
    },
    notes: {
      type: String,
    },
    source: {
      type: String,
    },
    sourceType: {
      type: String,
      enum: ['Channel Partner', 'Staff', 'Direct', 'Walk-in', 'Phone Call', 'Instagram', 'Facebook', 'Website', 'Leads Portal', 'Own Client', 'Office Referral', 'Client Referral', 'Admin', 'Admin Added'],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedToName: {
      type: String,
    },
    assignedToDisplayId: {
      type: String,
    },
    displayId: {
      type: String,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ['Open', 'Qualified', 'Unqualified', 'Customer'],
      default: 'Open',
    },
    dateAdded: {
      type: Date,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    plotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plot',
    },
    paymentStatus: {
      type: String,
      enum: ['Advance Paid', 'Advance Not Paid', 'Fully Paid', 'Partially Paid', 'Not Paid'],
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'LOAN'],
      default: 'CASH',
    },
    advanceAmount: {
      type: Number,
      default: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
    },
    bank: {
      type: String,
    },
    bankFollowerName: {
      type: String,
    },
    bankFollowerPhone: {
      type: String,
    },
    loanStage: {
      type: String,
      default: 'Not Applied',
    },
    dob: {
      type: String,
    },
    nextFollowUpDate: {
      type: String,
    },
    followUps: [
      {
        id: {
          type: String,
        },
        date: {
          type: String,
        },
        nextFollowUpDate: {
          type: String,
        },
        notes: {
          type: String,
        },
        outcome: {
          type: String,
        },
        nextAction: {
          type: String,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

LeadSchema.index({ status: 1, assignedTo: 1 }); // compound for Open/Reserved tab queries
LeadSchema.index({ status: 1, createdAt: -1 });  // compound for status + sort queries
LeadSchema.index({ assignedTo: 1 });
LeadSchema.index({ sourceType: 1 });
LeadSchema.index({ projectId: 1 });
LeadSchema.index({ phone: 1 });

// Auto-generate displayId (atomic to prevent race conditions)
LeadSchema.pre('save', async function () {
  if (this.isModified('displayId')) return;
  if (!this.displayId) {
    const Counter = mongoose.model('Counter');
    const counter = await Counter.findOneAndUpdate(
      { name: 'displayId_L' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    this.displayId = `L-${counter.seq}`;
  }
});

module.exports = mongoose.model('Lead', LeadSchema);