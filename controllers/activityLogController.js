const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const ActivityLog = require('../models/ActivityLog');

// @desc    Get all activity logs
// @route   GET /api/v1/activity-logs
// @access  Private/Admin
exports.getActivityLogs = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;
  const skip = (page - 1) * limit;

  const query = {};

  if (req.query.actorId) {
    const aid = req.query.actorId;
    query.$or = [{ actorId: aid }, { entityId: aid }];
  } else if (req.query.entityId) {
    query.entityId = req.query.entityId;
  }

  if (req.query.actorRole && req.query.actorRole !== 'All') {
    const roleVal = req.query.actorRole.replace(/_/g, ' ');
    query.actorRole = { $regex: new RegExp(`^${roleVal}$`, 'i') };
  }

  if (req.query.actionType && req.query.actionType !== 'All') {
    query.actionType = req.query.actionType;
  }

  if (req.query.search && req.query.search.trim()) {
    const s = req.query.search.trim();
    query.$or = [
      { actorName: { $regex: s, $options: 'i' } },
      { actorRole: { $regex: s, $options: 'i' } },
      { action: { $regex: s, $options: 'i' } },
      { entityName: { $regex: s, $options: 'i' } },
    ];
  }

  const total = await ActivityLog.countDocuments(query);
  const logs = await ActivityLog.find(query).sort('-createdAt -timestamp').skip(skip).limit(limit);

  res.status(200).json({
    success: true,
    count: logs.length,
    total,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
    data: logs,
  });
});

// @desc    Get single activity log
// @route   GET /api/v1/activity-logs/:id
// @access  Private/Admin
exports.getActivityLog = asyncHandler(async (req, res, next) => {
  const log = await ActivityLog.findById(req.params.id);

  if (!log) {
    return next(new ErrorResponse(`Activity log not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: log,
  });
});

// @desc    Create activity log
// @route   POST /api/v1/activity-logs
// @access  Private
exports.createActivityLog = asyncHandler(async (req, res, next) => {
  const log = await ActivityLog.create(req.body);

  res.status(201).json({
    success: true,
    data: log,
  });
});

// @desc    Delete activity log
// @route   DELETE /api/v1/activity-logs/:id
// @access  Private/Admin
exports.deleteActivityLog = asyncHandler(async (req, res, next) => {
  const log = await ActivityLog.findById(req.params.id);

  if (!log) {
    return next(new ErrorResponse(`Activity log not found with id of ${req.params.id}`, 404));
  }

  await log.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get activity logs by entity type
// @route   GET /api/v1/activity-logs/entity/:entityType
// @access  Private/Admin
exports.getActivityLogsByEntity = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { entityType: req.params.entityType };
  const total = await ActivityLog.countDocuments(query);
  const logs = await ActivityLog.find(query).sort('-timestamp').skip(skip).limit(limit);

  res.status(200).json({
    success: true,
    count: logs.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: logs,
  });
});

// @desc    Get activity logs by action type
// @route   GET /api/v1/activity-logs/action/:actionType
// @access  Private/Admin
exports.getActivityLogsByAction = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { actionType: req.params.actionType };
  const total = await ActivityLog.countDocuments(query);
  const logs = await ActivityLog.find(query).sort('-timestamp').skip(skip).limit(limit);

  res.status(200).json({
    success: true,
    count: logs.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: logs,
  });
});

// @desc    Get recent activity logs
// @route   GET /api/v1/activity-logs/recent
// @access  Private/Admin
exports.getRecentActivityLogs = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const total = await ActivityLog.countDocuments();
  const logs = await ActivityLog.find().sort('-timestamp').skip(skip).limit(limit);

  res.status(200).json({
    success: true,
    count: logs.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: logs,
  });
});
