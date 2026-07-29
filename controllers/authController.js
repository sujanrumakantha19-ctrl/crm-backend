const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const crypto = require('crypto');

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public (defaults to 'partner' role — admin registration must go through POST /api/v1/users)
exports.register = asyncHandler(async (req, res, next) => {
  const {
    name,
    initials,
    designation,
    email,
    phone,
    avatarBg,
    groupId,
    dob,
    password,
  } = req.body;

  // Security: Force role to 'partner' for public registration.
  // Admin/staff accounts must be created by an existing admin via POST /api/v1/users.
  const role = 'partner';

  // Create user
  const user = await User.create({
    name,
    initials,
    role,
    designation,
    email,
    phone,
    avatarBg,
    groupId,
    dob,
    isActive: true,
    password,
  });

  // Create token
  const token = user.getSignedJwtToken();

  res.status(201).json({
    success: true,
    token,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      initials: user.initials,
      designation: user.designation,
      phone: user.phone,
      avatarBg: user.avatarBg,
    },
  });
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  const token = user.getSignedJwtToken();

  res.status(200).json({
    success: true,
    token,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      initials: user.initials,
      designation: user.designation,
      phone: user.phone,
      avatarBg: user.avatarBg,
      employeeId: user.employeeId,
    },
  });
});

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorResponse('Please provide an email', 400));
  }

  const user = await User.findOne({ email });

  // Generic success message to prevent user enumeration
  const successMessage = 'If the email exists, a reset link has been sent.';

  if (!user) {
    // Return early but with success to prevent user enumeration
    return res.status(200).json({ success: true, message: successMessage });
  }

  // Get reset token
  const resetToken = user.getResetPasswordToken();

  await user.save({ validateBeforeSave: false });

  // Create reset url (using frontend url from env, fallback to req object)
  const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const { getPasswordResetTemplate } = require('../utils/emailTemplates');
  const htmlMessage = getPasswordResetTemplate({
    userName: user.name,
    resetUrl,
    validMinutes: 10,
  });

  try {
    const sendEmail = require('../utils/sendEmail');
    await sendEmail({
      email: user.email,
      subject: `Reset Your Password - ${process.env.FROM_NAME || 'Samy&Co'}`,
      message: htmlMessage,
    });

    res.status(200).json({
      success: true,
      message: successMessage,
    });
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('Error sending email:', err);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save({ validateBeforeSave: false });

    return next(new ErrorResponse('Email could not be sent', 500));
  }
});

// @desc    Reset password
// @route   POST /api/v1/auth/reset-password
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return next(new ErrorResponse('Please provide a token and a new password', 400));
  }

  // Get hashed token from req body instead of params
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired token', 400));
  }

  // Set new password (the pre-save middleware in the User model will hash it)
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Send response
  res.status(200).json({
    success: true,
    message: 'Password successfully updated.',
  });
});

// @desc    Update own profile
// @route   PUT /api/v1/auth/update-profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res, next) => {
  const { name, email, phone, dob, avatarBg, avatar } = req.body;
  const fieldsToUpdate = {};
  if (name) fieldsToUpdate.name = name;
  if (email) {
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(String(email).trim())) {
      return next(new ErrorResponse('Please provide a valid email address', 400));
    }
    fieldsToUpdate.email = String(email).trim();
  }
  if (phone) {
    const phoneRegex = /^(?:\+91[\-\s]?)?[6-9]\d{2}[\-\s]?\d{3}[\-\s]?\d{4}$/;
    const digits = String(phone).trim().replace(/\D/g, '');
    const isValidPhone = phoneRegex.test(String(phone).trim()) || (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) || (digits.length === 12 && digits.startsWith('91'));
    if (!isValidPhone) {
      return next(new ErrorResponse('Please provide a valid 10-digit phone number', 400));
    }
    fieldsToUpdate.phone = phone;
  }
  if (dob !== undefined) fieldsToUpdate.dob = dob;
  if (avatarBg) fieldsToUpdate.avatarBg = avatarBg;
  if (avatar !== undefined) fieldsToUpdate.avatar = avatar;

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({ success: true, data: user });
});

// @desc    Change password (authenticated)
// @route   PUT /api/v1/auth/change-password
// @access  Private
exports.changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new ErrorResponse('Please provide current and new password', 400));
  }

  const user = await User.findById(req.user.id).select('+password');

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  user.password = newPassword;
  await user.save();

  const token = user.getSignedJwtToken();
  res.status(200).json({ success: true, token, message: 'Password updated successfully' });
});

// @desc    Add / update user push token
// @route   PUT /api/v1/auth/push-token
// @access  Private
exports.addPushToken = asyncHandler(async (req, res, next) => {
  const { token, platform } = req.body;

  if (!token) {
    return next(new ErrorResponse('Please provide a push token', 400));
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Check if token already exists in user's pushTokens
  const tokenExists = user.pushTokens.some(t => t.token === token);
  if (!tokenExists) {
    user.pushTokens.push({ token, platform: platform || 'android' });
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: 'Push token registered successfully',
    data: user.pushTokens
  });
});

// @desc    Remove user push token
// @route   DELETE /api/v1/auth/push-token
// @access  Private
exports.removePushToken = asyncHandler(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new ErrorResponse('Please provide a push token to remove', 400));
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  user.pushTokens = user.pushTokens.filter(t => t.token !== token);
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Push token removed successfully',
    data: user.pushTokens
  });
});
