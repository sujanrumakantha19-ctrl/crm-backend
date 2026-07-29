const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Group = require('../models/Group');

// @desc    Get all groups
// @route   GET /api/v1/groups
// @access  Private/Admin
exports.getGroups = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single group
// @route   GET /api/v1/groups/:id
// @access  Private/Admin
exports.getGroup = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id).populate('members', 'name initials role');

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: group,
  });
});

// @desc    Create group
// @route   POST /api/v1/groups
// @access  Private/Admin
exports.createGroup = asyncHandler(async (req, res, next) => {
  const group = await Group.create(req.body);

  res.status(201).json({
    success: true,
    data: group,
  });
});

// @desc    Update group
// @route   PUT /api/v1/groups/:id
// @access  Private/Admin
exports.updateGroup = asyncHandler(async (req, res, next) => {
  let group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  const allowedFields = {
    name: req.body.name,
    description: req.body.description,
    members: req.body.members,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  group = await Group.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: group,
  });
});

// @desc    Delete group
// @route   DELETE /api/v1/groups/:id
// @access  Private/Admin
exports.deleteGroup = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  // Cascade cleanup: remove groupId from all members
  const User = require('../models/User');
  await User.updateMany({ groupId: group._id }, { groupId: null });

  await group.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Add member to group
// @route   POST /api/v1/groups/:id/members
// @access  Private/Admin
exports.addMember = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  const { userId } = req.body;

  if (!userId) {
    return next(new ErrorResponse('Please provide a userId', 400));
  }

  // Check if member already exists
  if (group.members.includes(userId)) {
    return next(new ErrorResponse('User is already a member of this group', 400));
  }

  group.members.push(userId);
  await group.save();

  res.status(200).json({
    success: true,
    data: group,
  });
});

// @desc    Remove member from group
// @route   DELETE /api/v1/groups/:id/members/:userId
// @access  Private/Admin
exports.removeMember = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  const memberIndex = group.members.indexOf(req.params.userId);

  if (memberIndex === -1) {
    return next(new ErrorResponse('User is not a member of this group', 400));
  }

  group.members.splice(memberIndex, 1);
  await group.save();

  res.status(200).json({
    success: true,
    data: group,
  });
});
