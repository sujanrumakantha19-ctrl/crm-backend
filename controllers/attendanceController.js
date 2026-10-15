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
// Each check-in always creates a new record - the old 10-minute "resume"
// merge silently wiped checkOut/duration and distorted the day's history (issue 29).
exports.createAttendance = asyncHandler(async (req, res, next) => {
  const uid = staffUid(req);
  if (uid) req.body.staffId = uid;

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
    const cIn = req.body.checkIn || attendance.checkIn;
    const inM = parseTimeToMinutes(cIn);
    const outM = parseTimeToMinutes(req.body.checkOut);
    if (inM !== null && outM !== null) {
      let diff = outM - inM;
      if (diff < 0) diff += 24 * 60;
      allowedFields.duration = formatMinutesToDuration(diff);
    }
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
// @access  Private (Admin & Staff)
exports.getTodayPresence = asyncHandler(async (req, res, next) => {
  const today = getTodayDateStringIST();
  const activeStaff = await User.find({ role: 'staff', isActive: true })
    .select('name email initials phone designation avatar avatarBg')
    .sort('name')
    .lean();

  const todaySessions = await Attendance.find({ date: today })
    .populate('projectId', 'name location')
    .lean();

  const result = getTodayPresenceRoster(activeStaff, todaySessions);

  res.status(200).json({
    success: true,
    data: result.roster,
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
  const uid = staffUid(req);
  const targetStaffId = uid || req.query.staffId;
  const today = getTodayDateStringIST();

  let startStr = today;
  let endStr = today;

  if (req.query.date) {
    startStr = req.query.date;
    endStr = req.query.date;
  } else if (req.query.month) {
    const monthPrefix = req.query.month; // YYYY-MM
    const [y, m] = monthPrefix.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    startStr = `${monthPrefix}-01`;
    endStr = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;
  } else if (req.query.dateFrom || req.query.dateTo) {
    if (req.query.dateFrom) startStr = req.query.dateFrom;
    if (req.query.dateTo) endStr = req.query.dateTo;
  }

  // Load staff members
  let staffList = [];
  if (targetStaffId) {
    const singleStaff = await User.findById(targetStaffId).select('name email designation role joiningDate avatar avatarBg').lean();
    if (singleStaff) staffList = [singleStaff];
  } else {
    staffList = await User.find({ role: 'staff', isActive: true })
      .select('name email designation role joiningDate avatar avatarBg')
      .sort('name')
      .lean();
  }

  // Load raw attendance sessions for date range
  const sessionQuery = {
    date: { $gte: startStr, $lte: endStr },
  };
  if (targetStaffId) {
    sessionQuery.staffId = targetStaffId;
  }
  const rawSessions = await Attendance.find(sessionQuery)
    .populate('projectId', 'name location')
    .lean();

  // Load overrides for date range
  const overrideQuery = {
    date: { $gte: startStr, $lte: endStr },
  };
  if (targetStaffId) {
    overrideQuery.staffId = targetStaffId;
  }
  const rawOverrides = await AttendanceOverride.find(overrideQuery).lean();

  // Map sessions and overrides by key: `${staffId}_${date}`
  const sessionsMap = new Map();
  rawSessions.forEach(s => {
    const key = `${String(s.staffId)}_${s.date}`;
    if (!sessionsMap.has(key)) sessionsMap.set(key, []);
    sessionsMap.get(key).push(s);
  });

  const overridesMap = new Map();
  rawOverrides.forEach(o => {
    const key = `${String(o.staffId)}_${o.date}`;
    overridesMap.set(key, o);
  });

  // Generate date list from endStr down to startStr
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  const dateList = [];
  for (let d = new Date(endDate); d >= startDate; d.setDate(d.getDate() - 1)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dateList.push(`${yyyy}-${mm}-${dd}`);
  }

  // Compute daily outcome for each staff and each date
  let calculatedRecords = [];
  for (const dateStr of dateList) {
    for (const staff of staffList) {
      const sId = String(staff._id);
      const key = `${sId}_${dateStr}`;
      const sessions = sessionsMap.get(key) || [];
      const override = overridesMap.get(key) || null;

      const dailyResult = calculateDailyAttendance(staff, dateStr, sessions, override);
      calculatedRecords.push(dailyResult);
    }
  }

  // Summary counts across all calculated records before pagination
  const summary = {
    totalRecords: calculatedRecords.length,
    presentCount: calculatedRecords.filter(r => r.status === 'Present').length,
    halfDayCount: calculatedRecords.filter(r => r.status === 'Half Day').length,
    absentCount: calculatedRecords.filter(r => r.status === 'Absent').length,
    inProgressCount: calculatedRecords.filter(r => r.status === 'In Progress').length,
    needsReviewCount: calculatedRecords.filter(r => r.status === 'Needs Review').length,
    weeklyOffCount: calculatedRecords.filter(r => r.status === 'Weekly Off').length,
  };

  // Status filtering
  if (req.query.status && req.query.status !== 'All') {
    const statusVal = req.query.status;
    if (statusVal === 'Half Day') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Half Day');
    } else if (statusVal === 'Present') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Present');
    } else if (statusVal === 'Absent' || statusVal === 'Below 4 Hours') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Absent');
    } else if (statusVal === 'In Progress') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'In Progress');
    } else if (statusVal === 'Needs Review') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Needs Review');
    } else {
      calculatedRecords = calculatedRecords.filter(r => r.status === statusVal);
    }
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 500);
  const total = calculatedRecords.length;
  const skip = (page - 1) * limit;
  const pagedRecords = calculatedRecords.slice(skip, skip + limit);

  res.status(200).json({
    success: true,
    count: pagedRecords.length,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    summary,
    data: pagedRecords,
  });
});

// @desc    Set manual admin daily attendance override
// @route   POST /api/v1/attendance/override
// @access  Private (Admin only)
exports.setAttendanceOverride = asyncHandler(async (req, res, next) => {
  const { staffId, date, status, notes } = req.body;

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

  const override = await AttendanceOverride.findOneAndUpdate(
    { staffId, date },
    {
      status,
      notes: notes || '',
      overriddenBy: req.user ? req.user.id : undefined,
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    data: override,
  });
});