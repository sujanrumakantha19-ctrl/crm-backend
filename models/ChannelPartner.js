const mongoose = require('mongoose');
const Counter = require('./Counter');

const ChannelPartnerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    partnerId: {
      type: String,
      unique: true,
      sparse: true,
    },
    displayId: {
      type: String,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: [true, 'Please add partner name'],
    },
    companyName: {
      type: String,
    },
    phone: {
      type: String,
      required: [true, 'Please add phone number'],
    },
    email: {
      type: String,
      required: [true, 'Please add email'],
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    city: {
      type: String,
    },
    reraId: {
      type: String,
    },
    totalLeads: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    initials: {
      type: String,
      maxlength: [2, 'Initials cannot be more than 2 characters'],
    },
    avatarBg: {
      type: String,
    },
    notes: {
      type: String,
    },
    dob: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

ChannelPartnerSchema.index({ city: 1 });
ChannelPartnerSchema.index({ isActive: 1 });

// Auto-generate displayId (atomic to prevent race conditions)
ChannelPartnerSchema.pre('save', async function () {
  if (this.isModified('displayId')) return;
  if (!this.displayId) {
    const Counter = mongoose.model('Counter');
    const counter = await Counter.findOneAndUpdate(
      { name: 'displayId_CP' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    this.displayId = `CP-${counter.seq}`;
  }
});

module.exports = mongoose.model('ChannelPartner', ChannelPartnerSchema);