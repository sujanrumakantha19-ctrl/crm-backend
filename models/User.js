const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Counter = require('./Counter');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
    },
    displayId: {
      type: String,
      unique: true,
      sparse: true,
    },
    initials: {
      type: String,
      required: [true, 'Please add initials'],
      maxlength: [2, 'Initials cannot be more than 2 characters'],
    },
    role: {
      type: String,
      enum: ['admin', 'staff', 'partner'],
      required: [true, 'Please add a role'],
    },
    designation: {
      type: String,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    phone: {
      type: String,
      required: [true, 'Please add a phone number'],
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      default: 'Male',
    },
    avatarBg: {
      type: String,
    },
    avatar: {
      type: String,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
    },
    dob: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
    pushTokens: [
      {
        token: { type: String, required: true },
        platform: { type: String, enum: ['web', 'ios', 'android'], default: 'android' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ groupId: 1 });

// Auto-generate employeeId (atomic to prevent race conditions)
UserSchema.pre('save', async function () {
  if (!this.employeeId) {
    const prefix = this.role === 'admin' ? 'AD' : this.role === 'partner' ? 'CP' : 'EMP';
    // Use atomic counter to prevent race conditions in concurrent registrations
    const Counter = mongoose.model('Counter');
    const counterName = `employeeId_${prefix}`;
    const counter = await Counter.findOneAndUpdate(
      { name: counterName },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    this.employeeId = `${prefix}${String(counter.seq).padStart(3, '0')}`;
  }
});

// Auto-generate displayId (atomic to prevent race conditions)
UserSchema.pre('save', async function () {
  if (this.isModified('displayId')) return;
  if (!this.displayId) {
    const prefix = this.role === 'admin' ? 'AD' : this.role === 'partner' ? 'CP' : 'STAFF';
    const Counter = mongoose.model('Counter');
    const counterName = `displayId_${prefix}`;
    const counter = await Counter.findOneAndUpdate(
      { name: counterName },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    this.displayId = `${prefix}-${counter.seq}`;
  }
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
UserSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

module.exports = mongoose.model('User', UserSchema);
