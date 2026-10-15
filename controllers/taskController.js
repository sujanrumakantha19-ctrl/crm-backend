const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Task = require('../models/Task');
const { getTodayDateStringIST } = require('../utils/dateIST');

function isValidCalendarDateString(str) {
  if (!str) return true;
  if (typeof str !== 'string') {
    if (str instanceof Date) return !isNaN(str.getTime());
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && (d.getUTCMonth() + 1) === month && d.getUTCDate() === day;
}

function toDateStr(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return '';
}

// Staff users may only access tasks assigned to them
function staffUid(req) {
  if (req.user && req.user.role === 'staff') {
    return String(req.user.id || req.user._id || '');
  }
  return null;
}

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
  if (req.query.pendingOnly === 'true' || req.query.pendingOnly === true) {
    query.status = { $ne: 'Done' };
  } else if (req.query.status && req.query.status !== 'All' && req.query.status !== 'all') {
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

  const uid = staffUid(req);
  const assigneeId = (task.assignee && typeof task.assignee === 'object' && (task.assignee._id || task.assignee.id))
    ? String(task.assignee._id || task.assignee.id)
    : String(task.assignee || '');
  if (uid && assigneeId !== uid) {
    return next(new ErrorResponse('You are not allowed to view this task', 403));
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
  let { title, description, status, priority, assignee, assigneeInitials, dueDate, dueTime, project, comments } = req.body;

  if (project !== undefined && project !== null && project !== '' && project !== 'General') {
    if (!mongoose.Types.ObjectId.isValid(project)) {
      return next(new ErrorResponse('Invalid project ID format', 400));
    }
  }

  const todayIST = getTodayDateStringIST();

  if (dueDate) {
    if (!isValidCalendarDateString(dueDate)) {
      return next(new ErrorResponse('Invalid calendar date for task deadline', 400));
    }
    const dueStr = toDateStr(dueDate);
    if (dueStr && dueStr < todayIST) {
      return next(new ErrorResponse('Task deadline cannot be in the past', 400));
    }
  }

  // Staff creation constraints: forced to 'To Do' and self-assigned
  if (req.user && req.user.role === 'staff') {
    status = 'To Do';
    assignee = req.user.id || req.user._id;
    assigneeInitials = req.user.initials || 'ST';
  }

  const validProject = (project && project !== 'General' && mongoose.Types.ObjectId.isValid(project)) ? project : undefined;

  const task = await Task.create({
    title,
    description,
    status: status || 'To Do',
    priority: priority || 'Medium',
    assignee,
    assigneeInitials,
    dueDate,
    dueTime,
    project: validProject,
    comments,
  });

  // Notify assigned staff member (the Notification post-save hook sends FCM, issue 37)
  if (req.body.assignee) {
    try {
      const Notification = require('../models/Notification');
      const User = require('../models/User');
      const assigneeUser = await User.findById(req.body.assignee);
      if (assigneeUser && assigneeUser.role === 'staff') {
        await Notification.create({
          type: 'task_assigned',
          userId: assigneeUser._id,
          entityId: task._id.toString(),
          entityType: 'Task',
          message: `You have been assigned a new task: "${task.title}"`,
          actorName: req.user?.name || 'Admin',
          isToday: true,
          isRead: false,
        });
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

  // Optimistic concurrency check
  if (req.body.version !== undefined && req.body.version !== null) {
    if (Number(req.body.version) !== (task.version || 0)) {
      return next(new ErrorResponse('Task has been modified by another user. Please refresh and try again.', 409));
    }
  }

  const todayIST = getTodayDateStringIST();

  // Validate deadline if dueDate is provided and modified to a new date
  if (req.body.dueDate !== undefined && req.body.dueDate !== null && req.body.dueDate !== '') {
    if (!isValidCalendarDateString(req.body.dueDate)) {
      return next(new ErrorResponse('Invalid calendar date for task deadline', 400));
    }
    const newDueStr = toDateStr(req.body.dueDate);
    const oldDueStr = toDateStr(task.dueDate);
    if (newDueStr && newDueStr !== oldDueStr && newDueStr < todayIST) {
      return next(new ErrorResponse('Task deadline cannot be in the past', 400));
    }
  }

  if (req.body.project !== undefined && req.body.project !== null && req.body.project !== '' && req.body.project !== 'General') {
    if (!mongoose.Types.ObjectId.isValid(req.body.project)) {
      return next(new ErrorResponse('Invalid project ID format', 400));
    }
  }

  if (req.user && req.user.role === 'partner') {
    return next(new ErrorResponse('Channel partners are not allowed to update tasks', 403));
  }

  const isStaff = req.user && req.user.role === 'staff';
  const isAdmin = req.user && req.user.role === 'admin';

  // Staff may only update tasks assigned to them (issue 30). Admins can update any task.
  if (isStaff) {
    const uid = String(req.user.id || (req.user._id || ''));
    const assigneeId = task.assignee ? String(task.assignee) : '';
    if (!assigneeId || assigneeId !== uid) {
      return next(new ErrorResponse('You are not allowed to update this task', 403));
    }

    if (task.status === 'Done') {
      // Staff cannot modify status, title, description, etc. on Done tasks, but CAN add comments
      const nonCommentKeys = Object.keys(req.body).filter(k => k !== 'comments' && k !== 'version');
      const isAttemptingOtherChange = nonCommentKeys.some(k => {
        if (req.body[k] === undefined) return false;
        if (k === 'status' && req.body[k] !== 'Done') return true;
        if (k === 'title' && req.body[k] !== task.title) return true;
        if (k === 'description' && req.body[k] !== (task.description || '')) return true;
        if (k === 'priority' && req.body[k] !== task.priority) return true;
        if (k === 'dueDate') return toDateStr(req.body[k]) !== toDateStr(task.dueDate);
        if (k === 'assignee' || k === 'assigneeInitials' || k === 'project' || k === 'dueTime') return true;
        return false;
      });

      if (isAttemptingOtherChange) {
        return next(new ErrorResponse('Completed tasks cannot be modified by staff', 403));
      }

      for (const k of nonCommentKeys) {
        delete req.body[k];
      }
    } else {
      // Unfinished tasks: staff can edit title and description, and submit comments
      // Staff cannot reassign a task, change its project/priority, or change deadline
      delete req.body.assignee;
      delete req.body.assigneeInitials;
      delete req.body.project;
      delete req.body.priority;
      delete req.body.dueDate;
      delete req.body.dueTime;

      if (req.body.status) {
        if (req.body.status === 'Done') {
          return next(new ErrorResponse('Only administrators can mark tasks as Done', 403));
        }
        const allowedStaffStatuses = ['To Do', 'In Progress', 'In Review'];
        if (!allowedStaffStatuses.includes(req.body.status)) {
          return next(new ErrorResponse(`Invalid status for staff: ${req.body.status}`, 400));
        }
      }
    }
  }

  // Admin approval & reopen logic
  let approvedBy = undefined;
  let approvedAt = undefined;
  let reopenedBy = undefined;
  let reopenedAt = undefined;
  let reopenReason = undefined;

  if (isAdmin) {
    if (req.body.status === 'Done' && task.status !== 'Done') {
      approvedBy = req.user.id || req.user._id;
      approvedAt = new Date();
    } else if (task.status === 'Done' && req.body.status && req.body.status !== 'Done') {
      // Admin is reopening a Done task
      if (!req.body.reopenReason || !req.body.reopenReason.trim()) {
        return next(new ErrorResponse('Reopening a completed task requires a confirmed reason', 400));
      }
      reopenedBy = req.user.id || req.user._id;
      reopenedAt = new Date();
      reopenReason = req.body.reopenReason.trim();
    }
  }

  // Check if comments are being updated (a new comment is added)
  const oldCommentsCount = task.comments ? task.comments.length : 0;
  const newCommentsCount = req.body.comments ? req.body.comments.length : 0;
  const commentAdded = newCommentsCount > oldCommentsCount;

  const updateQuery = { _id: req.params.id };
  if (req.body.version !== undefined && req.body.version !== null) {
    updateQuery.version = Number(req.body.version);
  }

  const allowedFields = {
    title: req.body.title,
    description: req.body.description,
    status: req.body.status,
    priority: req.body.priority,
    assignee: req.body.assignee,
    assigneeInitials: req.body.assigneeInitials,
    dueDate: req.body.dueDate,
    dueTime: req.body.dueTime,
    project: (req.body.project === 'General' || req.body.project === '') ? null : req.body.project,
    approvedBy,
    approvedAt,
    reopenedBy,
    reopenedAt,
    reopenReason,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  const updateOp = {
    $set: allowedFields,
    $inc: { version: 1 },
  };

  // Safe comment append: $push new comments rather than full replace
  if (req.body.newComment) {
    updateOp.$push = { comments: req.body.newComment };
  } else if (Array.isArray(req.body.comments) && req.body.comments.length > oldCommentsCount) {
    const newComments = req.body.comments.slice(oldCommentsCount);
    updateOp.$push = { comments: { $each: newComments } };
  } else if (req.body.comments && oldCommentsCount === 0) {
    updateOp.$set.comments = req.body.comments;
  }

  const updatedTask = await Task.findOneAndUpdate(updateQuery, updateOp, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (!updatedTask) {
    if (req.body.version !== undefined && req.body.version !== null) {
      return next(new ErrorResponse('Task has been modified by another user. Please refresh and try again.', 409));
    }
    return next(new ErrorResponse(`Task not found with id of ${req.params.id}`, 404));
  }

  task = updatedTask;

  // If a comment was added, send notification (fault-tolerant, notification failure must not fail comment save)
  if (commentAdded) {
    try {
      const Notification = require('../models/Notification');
      const User = require('../models/User');

      if (req.user.role === 'staff') {
        // Notify all admins
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
          await Notification.create({
            type: 'task_comment',
            userId: admin._id,
            entityId: task._id.toString(),
            entityType: 'Task',
            message: `Staff member ${req.user.name} commented on task: "${task.title}"`,
            actorName: req.user.name,
            isToday: true,
            isRead: false,
          });
        }
      } else if (req.user.role === 'admin') {
        // Notify the task's assignee if it's a staff member
        if (task.assignee) {
          const assigneeUser = await User.findById(task.assignee);
          if (assigneeUser && assigneeUser.role === 'staff') {
            await Notification.create({
              type: 'task_comment',
              userId: assigneeUser._id,
              entityId: task._id.toString(),
              entityType: 'Task',
              message: `Admin ${req.user.name} commented on task: "${task.title}"`,
              actorName: req.user.name,
              isToday: true,
              isRead: false,
            });
          }
        }
      }
    } catch (notifErr) {
      console.error('Failed to send task comment notification:', notifErr.message);
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
  const uid = staffUid(req);
  if (uid) query.assignee = uid;
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
  const uid = staffUid(req);
  const query = { assignee: uid || req.params.assigneeId };
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
  const uid = staffUid(req);
  if (uid) query.assignee = uid;
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
  const uid = staffUid(req);
  if (uid) query.assignee = uid;
  const total = await Task.countDocuments(query);
  const tasks = await Task.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: tasks.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: tasks,
  });
});