const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const AttendanceOverride = require('../models/AttendanceOverride');
const { getTodayDateStringIST } = require('../utils/dateIST');
const {
  parseTimeToMinutes,
  formatMinutesToDuration,
  calculateDailyAttendance,
  getTodayPresenceRoster,
} = require('../utils/attendanceEngine');
const { queryDailyAttendance } = require('../services/attendanceDailyService');

// Staff users may only access their own attendance records
function staffUid(req) {
  if (req.user && req.user.role === 'staff') {
    return String(req.user.id || req.user._id || '');
  }
  return null;
}

// @desc    Get all attendance records
// @route   GET /api/v1/attendance
// @access  Public
exports.getAttendances = asyncHandler(async (req, res, next) => {
  const uid = staffUid(req);
  if (req.query.month) {
    const monthPrefix = req.query.month;
    delete req.query.month;
    const query = { date: { $regex: `^${monthPrefix}` } };

    if (uid) query.staffId = uid;
    if (req.query.staffId && !uid) query.staffId = req.query.staffId;

    if (req.query.status && req.query.status !== 'All') {
      const statusVal = req.query.status;
      if (statusVal === 'Half Day') {
        query.$or = [
          { status: 'Half Day' },
          { duration: { $regex: '^(4h\\s*(?:3[0-9]|4[0-9]|5[0-9])|5h|6h(?:\\s*0m)?$)', $options: 'i' } }
        ];
      } else if (statusVal === 'Below 4 Hours') {
        query.$or = [
          { status: 'Below 4 Hours' },
          { duration: { $regex: '^([0-3]h|[0-9]{1,2}m)', $options: 'i' } }
        ];
      } else if (statusVal === 'Present') {
        query.$or = [
          { status: 'Present' },
          { duration: { $regex: '^([1-9][0-9]*h)', $options: 'i' } }
        ];
      } else {
        query.status = statusVal;
      }
    }

    const records = await Attendance.find(query).sort('-createdAt');
    return res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  }
  res.status(200).json(res.advancedResults);
});

// @desc    Get single attendance record
// @route   GET /api/v1/attendance/:id
// @access  Public
exports.getAttendance = asyncHandler(async (req, res, next) => {
  const attendance = await Attendance.findById(req.params.id)
    .populate({
      path: 'staffId',
      select: 'name initials role',
    });

  if (!attendance) {
    return next(new ErrorResponse(`Attendance not found with id of ${req.params.id}`, 404));
  }

  const uid = staffUid(req);
  if (uid && String(attendance.staffId) !== uid) {
    return next(new ErrorResponse('You are not allowed to view this attendance record', 403));
  }

  res.status(200).json({
    success: true,
    data: attendance,
  });
});

// @desc    Create attendance record
// @route   POST /api/v1/attendance
// @access  Private
// Each check-in creates a new record. Enforces at most one active session per staff.
exports.createAttendance = asyncHandler(async (req, res, next) => {
  const uid = staffUid(req);
  const targetStaffId = uid || req.body.staffId;

  if (!targetStaffId) {
    return next(new ErrorResponse('Please provide staffId', 400));
  }

  const todayDate = req.body.date || getTodayDateStringIST();
  req.body.date = todayDate;

  // For normal staff punch: enforce staff ID and default server IST time if checkIn not provided
  if (req.user && req.user.role === 'staff') {
    req.body.staffId = uid;
    if (!req.body.checkIn) {
      const nowIST = new Date();
      req.body.checkIn = nowIST.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
      });
    }
    req.body.status = req.body.status || 'Present';
    delete req.body.duration;
    delete req.body.checkOut;
  }

  // Prevent duplicate concurrent check-ins:
  // If an unclosed session already exists with the EXACT same checkIn time, reject duplicate punch.
  if (req.user && req.user.role !== 'admin') {
    const duplicateActive = await Attendance.findOne({
      $and: [
        { $or: [{ staffId: targetStaffId }, { userId: targetStaffId }] },
        { date: todayDate },
        { checkIn: req.body.checkIn },
        {
          $or: [
            { checkOut: { $exists: false } },
            { checkOut: null },
            { checkOut: '' },
            { checkOut: '-' },
            { checkOut: '—' },
          ],
        },
      ],
    });

    if (duplicateActive) {
      return next(
        new ErrorResponse('Duplicate active check-in detected for this time. Please check out first.', 400)
      );
    }
  }

  const attendance = await Attendance.create(req.body);

  res.status(201).json({
    success: true,
    data: attendance,
  });
});

// @desc    Update attendance record
// @route   PUT /api/v1/attendance/:id
// @access  Private
exports.updateAttendance = asyncHandler(async (req, res, next) => {
  let attendance = await Attendance.findById(req.params.id);

  if (!attendance) {
    return next(new ErrorResponse(`Attendance not found with id of ${req.params.id}`, 404));
  }

  const uid = staffUid(req);
  if (uid) {
    if (String(attendance.staffId) !== uid) {
      return next(new ErrorResponse('You are not allowed to update this attendance record', 403));
    }
    // Staff may only touch their own check-in/out details, never reassign
    delete req.body.staffId;
  }

  const allowedFields = {
    staffId: req.body.staffId,
    staffName: req.body.staffName,
    date: req.body.date,
    checkIn: req.body.checkIn,
    checkOut: req.body.checkOut,
    duration: req.body.duration,
    status: req.body.status,
    role: req.body.role,
    activityType: req.body.activityType,
    projectId: req.body.projectId,
    projectName: req.body.projectName,
    location: req.body.location,
  };

  if (req.body.checkOut === '-') {
    attendance.checkOut = undefined;
    attendance.duration = undefined;
    if (req.body.activityType) attendance.activityType = req.body.activityType;
    if (req.body.projectId !== undefined) attendance.projectId = req.body.projectId;
    if (req.body.projectName !== undefined) attendance.projectName = req.body.projectName;
    if (req.body.location !== undefined) attendance.location = req.body.location;
    await attendance.save();
    return res.status(200).json({ success: true, data: attendance });
  }

  if (req.body.checkOut && req.body.checkOut !== '-' && req.body.checkOut !== '—') {
    // Idempotent checkout: if already closed, return existing record without mutating or extending
    if (attendance.checkOut && attendance.checkOut !== '-' && attendance.checkOut !== '—') {
      return res.status(200).json({ success: true, data: attendance });
    }

    const cIn = req.body.checkIn || attendance.checkIn;
    // Derive server-authoritative checkout time for staff
    const nowIST = new Date();
    const serverCheckOutTime = nowIST.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });
    const finalCheckOut = (req.user && req.user.role === 'staff')
      ? serverCheckOutTime
      : (req.body.checkOut || serverCheckOutTime);

    let calculatedDuration = undefined;
    const inM = parseTimeToMinutes(cIn);
    const outM = parseTimeToMinutes(finalCheckOut);
    if (inM !== null && outM !== null) {
      let diff = outM - inM;
      if (diff < 0 && attendance.isOvernight) diff += 24 * 60;
      calculatedDuration = formatMinutesToDuration(Math.max(diff, 0));
    }

    const checkoutFields = {
      checkOut: finalCheckOut,
      duration: calculatedDuration || req.body.duration,
      status: req.body.status || attendance.status,
      activityType: req.body.activityType || attendance.activityType,
      projectId: req.body.projectId !== undefined ? req.body.projectId : attendance.projectId,
      projectName: req.body.projectName !== undefined ? req.body.projectName : attendance.projectName,
      location: req.body.location !== undefined ? req.body.location : attendance.location,
    };
    Object.keys(checkoutFields).forEach(key => checkoutFields[key] === undefined && delete checkoutFields[key]);

    // Atomic conditional checkout: only succeeds if session has not already been checked out
    const updated = await Attendance.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { checkOut: { $exists: false } },
          { checkOut: null },
          { checkOut: '' },
          { checkOut: '-' },
          { checkOut: '—' },
        ],
      },
      checkoutFields,
      { returnDocument: 'after', runValidators: true }
    );

    if (!updated) {
      // Session was already closed concurrently; return existing closed session idempotently
      const closed = await Attendance.findById(req.params.id);
      return res.status(200).json({
        success: true,
        data: closed,
      });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  }

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  attendance = await Attendance.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: attendance,
  });
});

// @desc    Delete attendance record
// @route   DELETE /api/v1/attendance/:id
// @access  Private
exports.deleteAttendance = asyncHandler(async (req, res, next) => {
  const attendance = await Attendance.findById(req.params.id);

  if (!attendance) {
    return next(new ErrorResponse(`Attendance not found with id of ${req.params.id}`, 404));
  }

  const uid = staffUid(req);
  if (uid && String(attendance.staffId) !== uid) {
    return next(new ErrorResponse('You are not allowed to delete this attendance record', 403));
  }

  await attendance.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get attendance by staff (with backend date/month filtering & pagination)
// @route   GET /api/v1/attendance/staff/:staffId
// @access  Public
exports.getAttendanceByStaff = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 12;
  const skip = (page - 1) * limit;

  const uid = staffUid(req);
  const query = { staffId: uid || req.params.staffId };

  if (req.query.month) {
    query.date = { $regex: `^${req.query.month}` };
  } else if (req.query.date) {
    query.date = req.query.date;
  } else if (req.query.dateFrom || req.query.dateTo) {
    query.date = {};
    if (req.query.dateFrom) query.date.$gte = req.query.dateFrom;
    if (req.query.dateTo) query.date.$lte = req.query.dateTo;
  }

  if (req.query.status && req.query.status !== 'All') {
    const statusVal = req.query.status;
    if (statusVal === 'Half Day') {
      query.$or = [
        { status: 'Half Day' },
        { duration: { $regex: '^(4h\\s*(?:3[0-9]|4[0-9]|5[0-9])|5h|6h(?:\\s*0m)?$)', $options: 'i' } }
      ];
    } else if (statusVal === 'Below 4 Hours') {
      query.$or = [
        { status: 'Below 4 Hours' },
        { duration: { $regex: '^([0-3]h|[0-9]{1,2}m)', $options: 'i' } }
      ];
    } else if (statusVal === 'Present') {
      query.$or = [
        { status: 'Present' },
        { duration: { $regex: '^([1-9][0-9]*h)', $options: 'i' } }
      ];
    } else {
      query.status = statusVal;
    }
  }

  const total = await Attendance.countDocuments(query);
  const attendance = await Attendance.find(query).skip(skip).limit(limit).sort('-date -createdAt');

  res.status(200).json({
    success: true,
    count: attendance.length,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: attendance,
  });
});

// @desc    Get attendance by date
// @route   GET /api/v1/attendance/date/:date
// @access  Public
exports.getAttendanceByDate = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;
  const query = { date: req.params.date };
  const uid = staffUid(req);
  if (uid) query.staffId = uid;
  const total = await Attendance.countDocuments(query);
  const attendance = await Attendance.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: attendance.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: attendance,
  });
});

// @desc    Get today's attendance
// @route   GET /api/v1/attendance/today
// @access  Public
exports.getTodayAttendance = asyncHandler(async (req, res, next) => {
  const today = getTodayDateStringIST();
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;
  const query = { date: today };
  const uid = staffUid(req);
  if (uid) query.staffId = uid;
  const total = await Attendance.countDocuments(query);
  const attendance = await Attendance.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: attendance.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: attendance,
  });
});

// @desc    Get real-time today staff presence roster (all active staff)
// @route   GET /api/v1/attendance/presence/today
// @access  Private (Admin only)
exports.getTodayPresence = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to access presence roster', 403));
  }

  const today = getTodayDateStringIST();
  const activeStaff = await User.find({ role: 'staff', isActive: true })
    .select('name email initials phone designation avatar avatarBg')
    .sort('name')
    .lean();

  const todaySessions = await Attendance.find({ date: today })
    .populate('projectId', 'name location')
    .lean();

  const result = getTodayPresenceRoster(activeStaff, todaySessions);

  // Server pagination support if page or limit provided
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const total = result.roster.length;
  const skip = (page - 1) * limit;
  const pagedRoster = result.roster.slice(skip, skip + limit);

  res.status(200).json({
    success: true,
    data: pagedRoster,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    summary: {
      date: result.date,
      totalStaff: result.totalStaff,
      presentCount: result.presentCount,
      absentCount: result.absentCount,
      activeCount: result.activeCount,
    },
  });
});

// @desc    Get aggregated daily attendance outcomes
// @route   GET /api/v1/attendance/daily
// @access  Private
exports.getDailyAttendance = asyncHandler(async (req, res, next) => {
  const result = await queryDailyAttendance({
    staffId: req.query.staffId,
    date: req.query.date,
    month: req.query.month,
    year: req.query.year,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
    userRole: req.user ? req.user.role : 'staff',
    requestingUserId: req.user ? (req.user.id || req.user._id) : null,
    paginate: true,
  });

  res.status(200).json({
    success: true,
    ...result,
  });
});

// @desc    Set manual admin daily attendance override
// @route   POST /api/v1/attendance/override
// @access  Private (Admin only)
exports.setAttendanceOverride = asyncHandler(async (req, res, next) => {
  const { staffId, date, status, notes, confirmActiveOverride } = req.body;

  if (!staffId || !date) {
    return next(new ErrorResponse('Please provide staffId and date', 400));
  }

  // If status is empty or 'Remove', delete override
  if (!status || status === 'Remove' || status === 'Reset') {
    await AttendanceOverride.findOneAndDelete({ staffId, date });
    return res.status(200).json({
      success: true,
      message: 'Attendance override removed',
      data: null,
    });
  }

  const validStatuses = ['Present', 'Half Day', 'Absent'];
  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse(`Invalid status: ${status}. Must be one of ${validStatuses.join(', ')}`, 400));
  }

  // Active check-in override safeguard: if marking Absent for a staff member who currently has an open session on that date
  if (status === 'Absent') {
    const activeSessions = await Attendance.find({
      $and: [
        { $or: [{ staffId }, { userId: staffId }] },
        { date },
        { checkIn: { $exists: true, $ne: null, $nin: ['', '-', '—'] } },
        {
          $or: [
            { checkOut: { $exists: false } },
            { checkOut: null },
            { checkOut: '' },
            { checkOut: '-' },
            { checkOut: '—' },
          ],
        },
      ],
    });

    if (activeSessions.length > 0) {
      const activeSessionIds = activeSessions.map(s => s._id.toString());
      const checkInTimes = activeSessions.map(s => s.checkIn);

      const acknowledgedIds = Array.isArray(req.body.acknowledgedSessionIds)
        ? req.body.acknowledgedSessionIds.map(String)
        : (req.body.confirmActiveOverride === true ? activeSessionIds : []);

      const allAcknowledged = activeSessionIds.every(id => acknowledgedIds.includes(id));

      if (!allAcknowledged) {
        return res.status(409).json({
          success: false,
          code: 'ACTIVE_SESSION_OVERRIDE_CONFIRMATION_REQUIRED',
          message: 'This staff member is currently checked in. Marking this day Absent will override attendance without checking them out. Confirmation is required.',
          data: {
            activeSessionId: activeSessions[0]._id,
            activeSessionIds,
            checkIn: activeSessions[0].checkIn,
            checkInTimes,
            date,
          },
        });
      }
    }
  }

  const reasonNote = (notes || req.body.reason || '').trim();

  const override = await AttendanceOverride.findOneAndUpdate(
    { staffId, date },
    {
      status,
      notes: reasonNote,
      reason: reasonNote,
      overriddenBy: req.user ? (req.user.id || req.user._id) : undefined,
      overriddenAt: new Date(),
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    data: override,
  });
});