const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Lead = require('../models/Lead');
const { sendPushToUser } = require('../utils/fcm');

// Helper to check and create birthday notifications for a specific admin
const checkAndCreateBirthdayNotifications = async (adminId) => {
  try {
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    const currentYear = today.getFullYear();

    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    // 1. Staff birthdays
    const allStaff = await User.find({
      role: 'staff',
      dob: { $ne: null }
    });

    const birthdayUsers = allStaff.filter(user => {
      if (!user.dob) return false;
      const parsed = new Date(user.dob);
      if (!isNaN(parsed.getTime())) {
        return (parsed.getMonth() + 1) === todayMonth && parsed.getDate() === todayDay;
      }
      return false;
    });

    for (const user of birthdayUsers) {
      const existing = await Notification.findOne({
        type: 'birthday',
        userId: adminId,
        entityId: user._id.toString(),
        entityType: 'User',
        createdAt: { $gte: startOfYear, $lte: endOfYear }
      });

      if (!existing) {
        await Notification.create({
          type: 'birthday',
          userId: adminId,
          entityId: user._id.toString(),
          entityType: 'User',
          message: `Today is ${user.name}'s (Staff) Birthday!`,
          actorName: user.name,
          isToday: true,
          isRead: false
        });
      }
    }

    // 2. Customer birthdays
    const allCustomers = await Lead.find({
      status: 'Customer',
      dob: { $ne: null }
    });

    const birthdayCustomers = allCustomers.filter(lead => {
      if (!lead.dob) return false;
      // Try string parsing (YYYY-MM-DD)
      const parts = lead.dob.split('-');
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (m === todayMonth && d === todayDay) return true;
      }
      // Fallback to standard Date parsing
      const parsed = new Date(lead.dob);
      if (!isNaN(parsed.getTime())) {
        return (parsed.getMonth() + 1) === todayMonth && parsed.getDate() === todayDay;
      }
      return false;
    });

    for (const lead of birthdayCustomers) {
      const existing = await Notification.findOne({
        type: 'birthday',
        userId: adminId,
        entityId: lead._id.toString(),
        entityType: 'Lead',
        createdAt: { $gte: startOfYear, $lte: endOfYear }
      });

      if (!existing) {
        await Notification.create({
          type: 'birthday',
          userId: adminId,
          entityId: lead._id.toString(),
          entityType: 'Lead',
          message: `Today is ${lead.customerName}'s (Customer) Birthday!`,
          actorName: lead.customerName,
          isToday: true,
          isRead: false
        });
      }
    }
  } catch (err) {
    console.error('Error in checkAndCreateBirthdayNotifications:', err);
  }
};

// @desc    Get all notifications for logged-in user
// @route   GET /api/v1/notifications
// @access  Private
exports.getNotifications = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Not authorized', 401));
  }

  if (req.user.role === 'admin') {
    await checkAndCreateBirthdayNotifications(req.user._id);
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

  res.status(200).json({
    success: true,
    data: notification,
  });
});

// @desc    Create notification
// @route   POST /api/v1/notifications
// @access  Private
exports.createNotification = asyncHandler(async (req, res, next) => {
  req.body.userId = req.user.id;

  const notification = await Notification.create(req.body);

  // Send FCM push notification to the target user's registered devices
  try {
    await sendPushToUser(req.body.userId, {
      title: 'New Notification',
      body: req.body.message || 'You have a new notification',
      data: {
        notificationId: notification._id.toString(),
        type: req.body.type || 'general',
        entityType: req.body.entityType || '',
        entityId: req.body.entityId || '',
      },
    });
  } catch (fcmErr) {
    // FCM failure should not break the API response
    console.error('FCM push error in createNotification:', fcmErr.message);
  }

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

  if (req.user.role === 'admin') {
    await checkAndCreateBirthdayNotifications(req.user._id);
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