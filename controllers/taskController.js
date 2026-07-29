const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Task = require('../models/Task');
const { sendPushToUser } = require('../utils/fcm');

// @desc    Get all tasks (with backend project, date, assignee & search filtering)
// @route   GET /api/v1/tasks
// @access  Public
exports.getTasks = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;

  let query = {};

  // Staff role constraint vs admin assignee filter
  if (req.user && req.user.role === 'staff') {
    const uid = req.user.id || (req.user._id ? req.user._id.toString() : null);
    if (uid) {
      query.assignee = uid;
    }
  } else if (req.query.assignee && req.query.assignee !== 'All' && req.query.assignee !== 'all') {
    query.assignee = req.query.assignee;
  } else if (req.query.assigneeId && req.query.assigneeId !== 'All' && req.query.assigneeId !== 'all') {
    query.assignee = req.query.assigneeId;
  }

  // Project filter
  if (req.query.project && req.query.project !== 'All' && req.query.project !== 'all') {
    query.project = req.query.project;
  } else if (req.query.projectId && req.query.projectId !== 'All' && req.query.projectId !== 'all') {
    query.project = req.query.projectId;
  }

  // Status & Priority filters
  if (req.query.status && req.query.status !== 'All' && req.query.status !== 'all') {
    query.status = req.query.status;
  }
  if (req.query.priority && req.query.priority !== 'All' && req.query.priority !== 'all') {
    query.priority = req.query.priority;
  }

  // Deadline / Date range filtering
  if (req.query.deadline && req.query.deadline !== 'All' && req.query.deadline !== 'all') {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (req.query.deadline === 'today') {
      query.dueDate = { $gte: todayStart, $lte: todayEnd };
    } else if (req.query.deadline === 'this_week') {
      const nextWeek = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      query.dueDate = { $gte: todayStart, $lte: nextWeek };
    } else if (req.query.deadline === 'overdue') {
      query.dueDate = { $lt: todayStart };
      if (!query.status) query.status = { $ne: 'Done' };
    } else if (req.query.deadline === 'upcoming') {
      query.dueDate = { $gte: todayStart };
      if (!query.status) query.status = { $ne: 'Done' };
    }
  } else if (req.query.dueDate) {
    const d = new Date(req.query.dueDate);
    if (!isNaN(d.getTime())) {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      query.dueDate = { $gte: dayStart, $lte: dayEnd };
    }
  } else if (req.query.dateFrom || req.query.dateTo) {
    query.dueDate = {};
    if (req.query.dateFrom) query.dueDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) query.dueDate.$lte = new Date(req.query.dateTo);
  }

  // Search filter
  if (req.query.search && req.query.search.trim()) {
    const searchRegex = { $regex: req.query.search.trim(), $options: 'i' };
    query.$or = [{ title: searchRegex }, { description: searchRegex }];
  }

  const sortOption = req.query.sort || '-createdAt';

  const total = await Task.countDocuments(query);
  const tasks = await Task.find(query)
    .populate({ path: 'assignee', select: 'name initials role displayId' })
    .populate({ path: 'project', select: 'name displayId' })
    .skip(skip)
    .limit(limit)
    .sort(sortOption);

  res.status(200).json({
    success: true,
    count: tasks.length,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: tasks,
  });
});

// @desc    Get single task
// @route   GET /api/v1/tasks/:id
// @access  Public
exports.getTask = asyncHandler(async (req, res, next) => {
  const task = await Task.findById(req.params.id)
    .populate({
      path: 'assignee',
      select: 'name initials role',
    });

  if (!task) {
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: task,
  });
});

// @desc    Create task
// @route   POST /api/v1/tasks
// @access  Private
exports.createTask = asyncHandler(async (req, res, next) => {
  const task = await Task.create(req.body);

  // Notify assigned staff member via FCM push
  if (req.body.assignee) {
    try {
      const Notification = require('../models/Notification');
      const User = require('../models/User');
      const assigneeUser = await User.findById(req.body.assignee);
      if (assigneeUser && assigneeUser.role === 'staff') {
        const notif = await Notification.create({
          type: 'task_assigned',
          userId: assigneeUser._id,
          entityId: task._id.toString(),
          entityType: 'Task',
          message: `You have been assigned a new task: "${task.title}"`,
          actorName: req.user?.name || 'Admin',
          isToday: true,
          isRead: false,
        });
        sendPushToUser(assigneeUser._id, {
          title: '📋 New Task Assigned',
          body: `"${task.title}" has been assigned to you`,
          data: { notificationId: notif._id.toString(), type: 'task_assigned', entityType: 'Task', entityId: task._id.toString() },
        }).catch(e => console.error('FCM push error (task assign):', e.message));
      }
    } catch (notifErr) {
      console.error('Failed to notify staff on task creation:', notifErr.message);
    }
  }

  res.status(201).json({
    success: true,
    data: task,
  });
});

// @desc    Update task
// @route   PUT /api/v1/tasks/:id
// @access  Private
exports.updateTask = asyncHandler(async (req, res, next) => {
  let task = await Task.findById(req.params.id);

  if (!task) {
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }

  // Check if comments are being updated (a new comment is added)
  const oldCommentsCount = task.comments ? task.comments.length : 0;
  const newCommentsCount = req.body.comments ? req.body.comments.length : 0;
  const commentAdded = newCommentsCount > oldCommentsCount;

  const allowedFields = {
    title: req.body.title,
    description: req.body.description,
    status: req.body.status,
    priority: req.body.priority,
    assignee: req.body.assignee,
    assigneeInitials: req.body.assigneeInitials,
    dueDate: req.body.dueDate,
    dueTime: req.body.dueTime,
    project: req.body.project,
    comments: req.body.comments,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  task = await Task.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  // If a comment was added, send notification
  if (commentAdded) {
    const Notification = require('../models/Notification');
    const User = require('../models/User');

    if (req.user.role === 'staff') {
      // Notify all admins
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        const notif = await Notification.create({
          type: 'task_assigned',
          userId: admin._id,
          entityId: task._id.toString(),
          entityType: 'Task',
          message: `Staff member ${req.user.name} commented on task: "${task.title}"`,
          actorName: req.user.name,
          isToday: true,
          isRead: false,
        });
        sendPushToUser(admin._id, {
          title: '💬 Task Comment',
          body: `${req.user.name} commented on "${task.title}"`,
          data: { notificationId: notif._id.toString(), type: 'task_assigned', entityType: 'Task', entityId: task._id.toString() },
        }).catch(e => console.error('FCM push error (comment->admin):', e.message));
      }
    } else if (req.user.role === 'admin') {
      // Notify the task's assignee if it's a staff member
      if (task.assignee) {
        const assigneeUser = await User.findById(task.assignee);
        if (assigneeUser && assigneeUser.role === 'staff') {
          const notif = await Notification.create({
            type: 'task_assigned',
            userId: assigneeUser._id,
            entityId: task._id.toString(),
            entityType: 'Task',
            message: `Admin ${req.user.name} commented on task: "${task.title}"`,
            actorName: req.user.name,
            isToday: true,
            isRead: false,
          });
          sendPushToUser(assigneeUser._id, {
            title: '💬 Task Comment',
            body: `Admin commented on "${task.title}"`,
            data: { notificationId: notif._id.toString(), type: 'task_assigned', entityType: 'Task', entityId: task._id.toString() },
          }).catch(e => console.error('FCM push error (comment->staff):', e.message));
        }
      }
    }
  }

  res.status(200).json({
    success: true,
    data: task,
  });
});

// @desc    Delete task
// @route   DELETE /api/v1/tasks/:id
// @access  Private
exports.deleteTask = asyncHandler(async (req, res, next) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }

  await task.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get tasks by project
// @route   GET /api/v1/projects/:projectId/tasks
// @access  Public
exports.getTasksByProject = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { project: req.params.projectId };
  const total = await Task.countDocuments(query);
  const tasks = await Task.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: tasks.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: tasks,
  });
});

// @desc    Get tasks by assignee
// @route   GET /api/v1/tasks/assignee/:assigneeId
// @access  Public
exports.getTasksByAssignee = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { assignee: req.params.assigneeId };
  const total = await Task.countDocuments(query);
  const tasks = await Task.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: tasks.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: tasks,
  });
});

// @desc    Get tasks by status
// @route   GET /api/v1/tasks/status/:status
// @access  Public
exports.getTasksByStatus = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { status: req.params.status };
  const total = await Task.countDocuments(query);
  const tasks = await Task.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: tasks.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: tasks,
  });
});

// @desc    Get tasks by priority
// @route   GET /api/v1/tasks/priority/:priority
// @access  Public
exports.getTasksByPriority = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { priority: req.params.priority };
  const total = await Task.countDocuments(query);
  const tasks = await Task.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: tasks.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: tasks,
  });
});