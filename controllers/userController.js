const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/v1/users
// @access  Private/Admin
exports.getUsers = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single user
// @route   GET /api/v1/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Create user
// @route   POST /api/v1/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  const { generateRandomPassword } = require('../utils/passwordGen');

  let password = req.body.password;
  let generatedPassword = false;
  if (!password || password.trim() === '') {
    password = generateRandomPassword(10);
    generatedPassword = true;
  }

  // Pre-validate target group if groupId specified on user creation
  if (req.body.groupId && req.body.groupId !== 'none' && req.body.groupId !== '') {
    const Group = require('../models/Group');
    if (!mongoose.Types.ObjectId.isValid(String(req.body.groupId))) {
      return next(new ErrorResponse('Invalid target group ID format', 400));
    }
    const targetGroup = await Group.findById(req.body.groupId);
    if (!targetGroup) {
      return next(new ErrorResponse(`Target group not found with id of ${req.body.groupId}`, 404));
    }
  }

  const allowedFields = {
    name: req.body.name,
    initials: req.body.initials,
    role: req.body.role,
    designation: req.body.designation,
    email: req.body.email ? String(req.body.email).trim().toLowerCase() : undefined,
    phone: req.body.phone,
    gender: req.body.gender,
    avatarBg: req.body.avatarBg,
    groupId: req.body.groupId,
    dob: req.body.dob,
    isActive: req.body.isActive,
    password,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  const user = await User.create(allowedFields);

  // Sync group membership if groupId was assigned on creation
  if (user.groupId && user.role === 'staff') {
    const { assignUserToGroup } = require('../services/groupMembershipService');
    try {
      await assignUserToGroup(user._id, user.groupId);
    } catch (err) {
      // Prevent partially persisted user if group assignment fails
      await User.findByIdAndDelete(user._id);
      throw err;
    }
  }

  // Send credentials email (best-effort — never blocks or fails the request)
  let emailSent = false;
  if (user.email) {
    try {
      const { getAccountCredentialsTemplate } = require('../utils/emailTemplates');
      const sendEmail = require('../utils/sendEmail');
      const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
      const roleLabel = user.role === 'partner' ? 'Channel Partner' : user.role === 'admin' ? 'Admin' : 'Staff';

      await sendEmail({
        email: user.email,
        subject: `Your ${roleLabel} Account - ${process.env.FROM_NAME || 'Samy&Co'}`,
        message: getAccountCredentialsTemplate({
          userName: user.name,
          email: user.email,
          password,
          loginUrl,
          roleLabel,
        }),
      });
      emailSent = true;
    } catch (err) {
      const logger = require('../utils/logger');
      logger.error(`Failed to send credentials email to ${user.email}: ${err.message}`);
    }
  }

  res.status(201).json({
    success: true,
    data: user,
    emailSent,
    ...(generatedPassword ? { passwordGenerated: true } : {}),
  });
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  // Pre-validate target group if groupId is being updated
  if (req.body.groupId !== undefined && req.body.groupId !== null && req.body.groupId !== '' && req.body.groupId !== 'none') {
    const Group = require('../models/Group');
    if (!mongoose.Types.ObjectId.isValid(String(req.body.groupId))) {
      return next(new ErrorResponse('Invalid target group ID format', 400));
    }
    const targetGroup = await Group.findById(req.body.groupId);
    if (!targetGroup) {
      return next(new ErrorResponse(`Target group not found with id of ${req.body.groupId}`, 404));
    }
  }

  const allowedFields = {
    name: req.body.name,
    initials: req.body.initials,
    designation: req.body.designation,
    email: req.body.email ? String(req.body.email).trim().toLowerCase() : undefined,
    phone: req.body.phone,
    gender: req.body.gender,
    avatarBg: req.body.avatarBg,
    dob: req.body.dob,
    isActive: req.body.isActive,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  const user = await User.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  // Sync Group membership if groupId was specified
  if (req.body.groupId !== undefined) {
    const { assignUserToGroup } = require('../services/groupMembershipService');
    await assignUserToGroup(user._id, req.body.groupId || null);
  }

  const freshUser = await User.findById(user._id).select('-password');

  res.status(200).json({
    success: true,
    data: freshUser,
  });
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  // Prevent admin from accidentally deleting their own logged-in account
  if (req.user && String(req.user._id) === String(req.params.id)) {
    return next(new ErrorResponse('You cannot delete your own admin account', 400));
  }

  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  // Cascade cleanup: unassign leads, remove from groups, delete attendance/tasks
  const Lead = require('../models/Lead');
  const Task = require('../models/Task');
  const Attendance = require('../models/Attendance');
  const Group = require('../models/Group');
  const Notification = require('../models/Notification');

  await Promise.allSettled([
    Lead.updateMany(
      { assignedTo: user._id },
      { $set: { assignedTo: null }, $unset: { assignedToName: 1, assignedToDisplayId: 1 } }
    ),
    Task.deleteMany({ assignee: user._id }),
    Attendance.deleteMany({ staffId: user._id }),
    Group.updateMany({ members: user._id }, { $pull: { members: user._id } }),
    Notification.deleteMany({ userId: user._id }),
  ]);

  res.status(200).json({
    success: true,
    data: {},
  });
});