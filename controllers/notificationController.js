const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Notification = require('../models/Notification');

// @desc    Get all notifications for logged-in user
// @route   GET /api/v1/notifications
// @access  Private
exports.getNotifications = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Not authorized', 401));
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;

  // Strict user scoping - only fetch notifications for the authenticated user
  const query = { userId: req.user._id };

  const total = await Notification.countDocuments(query);
  const notifications = await Notification.find(query)
    .skip(skip)
    .limit(limit)
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: notifications,
  });
});

// @desc    Get single notification
// @route   GET /api/v1/notifications/:id
// @access  Public
exports.getNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorResponse(`Notification not found with id of ${req.params.id}`, 404));
  }

  // Ownership check (issue 36)
  if (!isOwnerOrAdmin(notification, req.user)) {
    return next(new ErrorResponse('You are not allowed to access this notification', 403));
  }

  res.status(200).json({
    success: true,
    data: notification,
  });
});

// Ownership guard: only the notification owner (or an admin) may manage it (issue 36).
function isOwnerOrAdmin(notification, user) {
  if (!notification || !user) return false;
  if (user.role === 'admin') return true;
  return String(notification.userId) === String(user.id || user._id);
}

// @desc    Create notification
// @route   POST /api/v1/notifications
// @access  Private
// Notifications target the caller by default (issue 35). Admins may target any
// user so lead/task assignment alerts reach the actual assignee. The Notification
// post-save hook handles FCM push - no explicit sendPushToUser here (issue 37).
exports.createNotification = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin || !req.body.userId) {
    req.body.userId = req.user.id;
  }

  const notification = await Notification.create(req.body);

  res.status(201).json({
    success: true,
    data: notification,
  });
});

// @desc    Update notification
// @route   PUT /api/v1/notifications/:id
// @access  Private
exports.updateNotification = asyncHandler(async (req, res, next) => {
  let notification = await Notification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorResponse(`Notification not found with id of ${req.params.id}`, 404));
  }

  // Ownership check (issue 36)
  if (!isOwnerOrAdmin(notification, req.user)) {
    return next(new ErrorResponse('You are not allowed to update this notification', 403));
  }

  // Only allow updating isRead — prevent userId/type/message tampering
  const allowedFields = {
    isRead: req.body.isRead,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  notification = await Notification.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: notification,
  });
});

// @desc    Delete notification
// @route   DELETE /api/v1/notifications/:id
// @access  Private
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorResponse(`Notification not found with id of ${req.params.id}`, 404));
  }

  // Ownership check (issue 36)
  if (!isOwnerOrAdmin(notification, req.user)) {
    return next(new ErrorResponse('You are not allowed to delete this notification', 403));
  }

  await notification.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get unread notifications
// @route   GET /api/v1/notifications/unread
// @access  Private
exports.getUnreadNotifications = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Not authorized', 401));
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { isRead: false, userId: req.user._id };
  const total = await Notification.countDocuments(query);
  const notifications = await Notification.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: notifications.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: notifications,
  });
});

// @desc    Mark notification as read
// @route   PUT /api/v1/notifications/:id/read
// @access  Private
exports.markAsRead = asyncHandler(async (req, res, next) => {
  let notification = await Notification.findById(req.params.id);

  if (!notification) {
    return next(new ErrorResponse(`Notification not found with id of ${req.params.id}`, 404));
  }

  // Ownership check (issue 36)
  if (!isOwnerOrAdmin(notification, req.user)) {
    return next(new ErrorResponse('You are not allowed to mark this notification as read', 403));
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    success: true,
    data: notification,
  });
});

// @desc    Mark all notifications as read
// @route   PUT /api/v1/notifications/read/all
// @access  Private
exports.markAllAsRead = asyncHandler(async (req, res, next) => {
  await Notification.updateMany({ userId: req.user.id, isRead: false }, { isRead: true });

  res.status(200).json({
    success: true,
    data: {},
  });
});