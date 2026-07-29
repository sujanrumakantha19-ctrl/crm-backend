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
  const allowedFields = {
    name: req.body.name,
    initials: req.body.initials,
    role: req.body.role,
    designation: req.body.designation,
    email: req.body.email,
    phone: req.body.phone,
    avatarBg: req.body.avatarBg,
    groupId: req.body.groupId,
    dob: req.body.dob,
    isActive: req.body.isActive,
    password: req.body.password,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  const user = await User.create(allowedFields);

  res.status(201).json({
    success: true,
    data: user,
  });
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  const allowedFields = {
    name: req.body.name,
    initials: req.body.initials,
    designation: req.body.designation,
    email: req.body.email,
    phone: req.body.phone,
    avatarBg: req.body.avatarBg,
    groupId: req.body.groupId,
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
    const Group = require('../models/Group');
    await Group.updateMany({ members: user._id }, { $pull: { members: user._id } });
    if (req.body.groupId) {
      await Group.findByIdAndUpdate(req.body.groupId, { $addToSet: { members: user._id } });
    }
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
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
    Lead.updateMany({ assignedTo: user._id }, { assignedTo: null, assignedToName: undefined }),
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