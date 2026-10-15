/**
 * Attendance Daily Service
 * 
 * Centralized business service for daily attendance outcomes.
 * Used by:
 * - Attendance Controller (getDailyAttendance)
 * - Report Controller (buildAttendanceReportRows / getAttendanceReport)
 * - Export Controller (exportAttendance)
 */

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const AttendanceOverride = require('../models/AttendanceOverride');
const ErrorResponse = require('../utils/errorResponse');
const { getTodayDateStringIST } = require('../utils/dateIST');
const { calculateDailyAttendance } = require('../utils/attendanceEngine');

/**
 * Validate and query daily attendance records with permissions, filtering, and pagination.
 */
async function queryDailyAttendance(options = {}) {
  const {
    staffId,
    date,
    month,
    year,
    dateFrom,
    dateTo,
    status,
    page = 1,
    limit = 50,
    userRole = 'admin',
    requestingUserId,
    paginate = true,
  } = options;

  // 1. Role enforcement
  if (userRole === 'partner') {
    throw new ErrorResponse('Channel partners are not authorized to access attendance', 403);
  }

  let targetStaffId = staffId || null;
  if (userRole === 'staff') {
    if (!requestingUserId) {
      throw new ErrorResponse('Staff identity is required', 401);
    }
    if (targetStaffId && String(targetStaffId) !== String(requestingUserId)) {
      throw new ErrorResponse('Staff members are only allowed to view their own attendance', 403);
    }
    targetStaffId = String(requestingUserId);
  }

  // 2. Date Range Resolution & Validation
  const { isValidCalendarDateString } = require('../utils/dateIST');
  const today = getTodayDateStringIST();
  let startStr = today;
  let endStr = today;

  if (date) {
    if (!isValidCalendarDateString(date)) {
      throw new ErrorResponse('Invalid date format. Expected valid YYYY-MM-DD', 400);
    }
    startStr = date;
    endStr = date;
  } else if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new ErrorResponse('Invalid month format. Expected YYYY-MM', 400);
    }
    const [y, m] = month.split('-').map(Number);
    if (m < 1 || m > 12) {
      throw new ErrorResponse('Invalid month format. Expected YYYY-MM', 400);
    }
    const lastDay = new Date(y, m, 0).getDate();
    startStr = `${month}-01`;
    endStr = `${month}-${String(lastDay).padStart(2, '0')}`;
  } else if (year) {
    if (!/^\d{4}$/.test(String(year))) {
      throw new ErrorResponse('Invalid year format. Expected YYYY', 400);
    }
    startStr = `${year}-01-01`;
    endStr = `${year}-12-31`;
  } else if (dateFrom || dateTo) {
    if (dateFrom && !isValidCalendarDateString(dateFrom)) {
      throw new ErrorResponse('Invalid dateFrom format. Expected valid YYYY-MM-DD', 400);
    }
    if (dateTo && !isValidCalendarDateString(dateTo)) {
      throw new ErrorResponse('Invalid dateTo format. Expected valid YYYY-MM-DD', 400);
    }
    startStr = dateFrom || dateTo;
    endStr = dateTo || dateFrom;
  } else {
    // Unfiltered query: Derive date bounds from recorded history in the database!
    const histQuery = targetStaffId ? { staffId: targetStaffId } : {};
    const [minAtt, maxAtt, minOvr, maxOvr] = await Promise.all([
      Attendance.findOne(histQuery).sort('date').select('date').lean(),
      Attendance.findOne(histQuery).sort('-date').select('date').lean(),
      AttendanceOverride.findOne(histQuery).sort('date').select('date').lean(),
      AttendanceOverride.findOne(histQuery).sort('-date').select('date').lean(),
    ]);

    const recordedDates = [minAtt?.date, maxAtt?.date, minOvr?.date, maxOvr?.date].filter(Boolean);
    if (recordedDates.length > 0) {
      recordedDates.sort();
      startStr = recordedDates[0];
      const maxRecorded = recordedDates[recordedDates.length - 1];
      endStr = maxRecorded > today ? maxRecorded : today;
    }
  }

  if (startStr > endStr) {
    throw new ErrorResponse('Start date cannot be after end date', 400);
  }

  let startDateObj = new Date(startStr);
  let endDateObj = new Date(endStr);
  const diffDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 366) {
    if (!date && !month && !year && !dateFrom && !dateTo) {
      // For automatic unfiltered history, cap startStr to 366 days before endStr instead of failing
      const cappedStart = new Date(endDateObj.getTime() - 365 * 24 * 60 * 60 * 1000);
      const cy = cappedStart.getFullYear();
      const cm = String(cappedStart.getMonth() + 1).padStart(2, '0');
      const cd = String(cappedStart.getDate()).padStart(2, '0');
      startStr = `${cy}-${cm}-${cd}`;
      startDateObj = new Date(startStr);
    } else {
      throw new ErrorResponse('Date range cannot exceed 366 days', 400);
    }
  }

  // 3. Load staff members
  let staffList = [];
  if (targetStaffId) {
    const singleStaff = await User.findById(targetStaffId)
      .select('name email designation role joiningDate avatar avatarBg isActive')
      .lean();
    if (singleStaff) {
      staffList = [singleStaff];
    }
  } else {
    // If range is only today, active staff is sufficient
    if (startStr === today && endStr === today) {
      staffList = await User.find({ role: 'staff', isActive: true })
        .select('name email designation role joiningDate avatar avatarBg isActive')
        .sort('name')
        .lean();
    } else {
      // For historical ranges: include active staff PLUS any staff who have attendance
      // records or overrides in this range, even if currently inactive (so history is preserved)
      const [activeStaff, pastSessionStaffIds, pastOverrideStaffIds] = await Promise.all([
        User.find({ role: 'staff', isActive: true })
          .select('name email designation role joiningDate avatar avatarBg isActive')
          .sort('name')
          .lean(),
        Attendance.distinct('staffId', { date: { $gte: startStr, $lte: endStr } }),
        AttendanceOverride.distinct('staffId', { date: { $gte: startStr, $lte: endStr } }),
      ]);

      const staffMap = new Map();
      activeStaff.forEach(s => staffMap.set(String(s._id), s));

      const extraIds = [...new Set([...pastSessionStaffIds, ...pastOverrideStaffIds])]
        .filter(id => id && !staffMap.has(String(id)));

      if (extraIds.length > 0) {
        const extraStaff = await User.find({ _id: { $in: extraIds } })
          .select('name email designation role joiningDate avatar avatarBg isActive')
          .lean();
        extraStaff.forEach(s => staffMap.set(String(s._id), s));
      }

      staffList = Array.from(staffMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
  }

  // 4. Load raw punch sessions and overrides
  const sessionQuery = {
    date: { $gte: startStr, $lte: endStr },
  };
  if (targetStaffId) {
    sessionQuery.staffId = targetStaffId;
  }

  const overrideQuery = {
    date: { $gte: startStr, $lte: endStr },
  };
  if (targetStaffId) {
    overrideQuery.staffId = targetStaffId;
  }

  const [rawSessions, rawOverrides] = await Promise.all([
    Attendance.find(sessionQuery).populate('projectId', 'name location').lean(),
    AttendanceOverride.find(overrideQuery).lean(),
  ]);

  // Index sessions and overrides by `${staffId}_${date}`
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

  // 5. Generate date list from endDate down to startDate
  const dateList = [];
  for (let d = new Date(endDateObj); d >= startDateObj; d.setDate(d.getDate() - 1)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dateList.push(`${yyyy}-${mm}-${dd}`);
  }

  // 6. Calculate daily outcomes
  let calculatedRecords = [];
  for (const dateItem of dateList) {
    for (const staff of staffList) {
      const sId = String(staff._id);
      const key = `${sId}_${dateItem}`;
      const sessions = sessionsMap.get(key) || [];
      const override = overridesMap.get(key) || null;

      const dailyResult = calculateDailyAttendance(staff, dateItem, sessions, override);
      calculatedRecords.push(dailyResult);
    }
  }

  // 7. Aggregate Summary Counts across ALL calculated records before status filter
  const summary = {
    totalRecords: calculatedRecords.length,
    presentCount: calculatedRecords.filter(r => r.status === 'Present').length,
    halfDayCount: calculatedRecords.filter(r => r.status === 'Half Day').length,
    absentCount: calculatedRecords.filter(r => r.status === 'Absent').length,
    inProgressCount: calculatedRecords.filter(r => r.status === 'In Progress').length,
    needsReviewCount: calculatedRecords.filter(r => r.status === 'Needs Review').length,
    weeklyOffCount: calculatedRecords.filter(r => r.status === 'Weekly Off').length,
  };

  // 8. Apply status filter
  if (status && status !== 'All' && status !== 'all') {
    if (status === 'Half Day') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Half Day');
    } else if (status === 'Present') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Present');
    } else if (status === 'Absent' || status === 'Below 4 Hours') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Absent');
    } else if (status === 'In Progress') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'In Progress');
    } else if (status === 'Needs Review') {
      calculatedRecords = calculatedRecords.filter(r => r.status === 'Needs Review');
    } else {
      calculatedRecords = calculatedRecords.filter(r => r.status === status);
    }
  }

  const total = calculatedRecords.length;

  if (!paginate) {
    return {
      total,
      summary,
      data: calculatedRecords,
      allRecords: calculatedRecords,
    };
  }

  // 9. Pagination
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.max(Math.min(parseInt(limit, 10) || 20, 500), 1);
  const skip = (safePage - 1) * safeLimit;
  const pagedRecords = calculatedRecords.slice(skip, skip + safeLimit);

  return {
    total,
    count: pagedRecords.length,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
    },
    summary,
    data: pagedRecords,
    allRecords: calculatedRecords,
  };
}

module.exports = {
  queryDailyAttendance,
};
