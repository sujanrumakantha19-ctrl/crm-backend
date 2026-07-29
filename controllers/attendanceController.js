const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Attendance = require('../models/Attendance');

// @desc    Get all attendance records
// @route   GET /api/v1/attendance
// @access  Public
exports.getAttendances = asyncHandler(async (req, res, next) => {
  if (req.query.month) {
    const monthPrefix = req.query.month;
    delete req.query.month;
    const query = { date: { $regex: `^${monthPrefix}` } };

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

  res.status(200).json({
    success: true,
    data: attendance,
  });
});

// @desc    Create attendance record (with 10-minute session window)
// @route   POST /api/v1/attendance
// @access  Private
exports.createAttendance = asyncHandler(async (req, res, next) => {
  const staffId = req.body.staffId;
  const today = req.body.date || new Date().toISOString().slice(0, 10);
  const now = new Date();

  // Check if a record exists for this staff member today created less than 10 minutes ago
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const recent = await Attendance.findOne({
    staffId,
    date: today,
    createdAt: { $gte: tenMinsAgo },
  }).sort({ createdAt: -1 });

  if (recent) {
    // Within 10-minute window -> Reopen/update existing session instead of creating duplicate
    recent.activityType = req.body.activityType || recent.activityType;
    if (req.body.projectId !== undefined) recent.projectId = req.body.projectId;
    if (req.body.projectName !== undefined) recent.projectName = req.body.projectName;
    recent.checkOut = undefined;
    recent.duration = undefined;
    await recent.save();

    return res.status(200).json({
      success: true,
      data: recent,
      message: 'Session resumed and activity updated within 10 minutes',
    });
  }

  // After 10 minutes or first check-in -> Create new attendance record
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

  const query = { staffId: req.params.staffId };

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
  const today = new Date().toISOString().slice(0, 10);
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;
  const query = { date: today };
  const total = await Attendance.countDocuments(query);
  const attendance = await Attendance.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: attendance.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: attendance,
  });
});