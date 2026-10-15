/**
 * Attendance Calculation Engine
 * 
 * Centralized, authoritative attendance calculation service.
 * Standardizes daily attendance evaluation across:
 * - Real-time Admin Dashboard Presence Roster
 * - Daily Attendance Summary & Filters
 * - Staff Attendance Page
 * - Admin Reports & CSV/PDF Exports
 */

const { getTodayDateStringIST } = require('./dateIST');

/**
 * Parse a time string (12-hour AM/PM or 24-hour HH:MM) into minutes since midnight.
 * Returns null if unparseable.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;

  // Check 12-hour format: e.g. "09:30 AM", "9:30 PM", "12:15 pm"
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const mins = parseInt(match12[2], 10);
    const meridiem = match12[3].toUpperCase();
    if (hours === 12) {
      hours = meridiem === 'AM' ? 0 : 12;
    } else if (meridiem === 'PM') {
      hours += 12;
    }
    return hours * 60 + mins;
  }

  // Check 24-hour format: e.g. "14:30", "09:30", "09:30:00"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const mins = parseInt(match24[2], 10);
    if (hours >= 0 && hours < 24 && mins >= 0 && mins < 60) {
      return hours * 60 + mins;
    }
  }

  // Fallback: check if it's an ISO timestamp
  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      // Calculate IST hours and minutes (UTC+05:30)
      const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
      return istTime.getUTCHours() * 60 + istTime.getUTCMinutes();
    }
  } catch {
    // Ignore error
  }

  return null;
}

/**
 * Parse a formatted duration string like "4h 30m", "5h", "45m", "4.5 hrs" into total minutes.
 */
function parseDurationToMinutes(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const trimmed = durationStr.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return 0;

  let totalMinutes = 0;
  let matched = false;

  const hrMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
  if (hrMatch) {
    totalMinutes += Math.round(parseFloat(hrMatch[1]) * 60);
    matched = true;
  }

  const minMatch = trimmed.match(/(\d+)\s*m(?:in(?:ute)?s?)?/i);
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1], 10);
    matched = true;
  }

  if (matched) return totalMinutes;

  // Decimal number alone e.g. "4.5"
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 60);
  }

  return 0;
}

/**
 * Format minutes into standard "Xh Ym" or "Ym" format.
 */
function formatMinutesToDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '-';
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs > 0 && mins > 0) {
    return `${hrs}h ${mins}m`;
  } else if (hrs > 0) {
    return `${hrs}h 0m`;
  }
  return `${mins}m`;
}

/**
 * Calculate worked minutes for a single attendance session.
 * Returns: { minutes: number, isClosed: boolean, isInvalid: boolean }
 */
function calculateSessionMinutes(session, sessionDate, todayDateStr) {
  const isToday = sessionDate === todayDateStr;
  const hasCheckIn = !!(session.checkIn && session.checkIn !== '-' && session.checkIn !== '—');
  const hasCheckOut = !!(session.checkOut && session.checkOut !== '-' && session.checkOut !== '—');

  if (!hasCheckIn) {
    return { minutes: 0, isClosed: false, isInvalid: true, hasCheckIn: false };
  }

  const inMins = parseTimeToMinutes(session.checkIn);

  if (hasCheckOut) {
    const outMins = parseTimeToMinutes(session.checkOut);
    if (inMins !== null && outMins !== null) {
      let diff = outMins - inMins;
      if (diff < 0) {
        // Handled as crossing midnight or clock correction
        diff += 24 * 60;
      }
      return { minutes: diff, isClosed: true, isInvalid: false, hasCheckIn: true };
    }

    // Fallback to session.duration if stored as string
    if (session.duration && session.duration !== '-' && session.duration !== '—') {
      const parsedMins = parseDurationToMinutes(session.duration);
      if (parsedMins > 0) {
        return { minutes: parsedMins, isClosed: true, isInvalid: false, hasCheckIn: true };
      }
    }

    // Fallback to createdAt and updatedAt timestamps
    if (session.createdAt && session.updatedAt) {
      const start = new Date(session.createdAt).getTime();
      const end = new Date(session.updatedAt).getTime();
      if (end > start) {
        const diffMins = Math.round((end - start) / 60000);
        return { minutes: diffMins, isClosed: true, isInvalid: false, hasCheckIn: true };
      }
    }

    return { minutes: 0, isClosed: true, isInvalid: false, hasCheckIn: true };
  }

  // No checkout
  if (isToday) {
    // Active session in progress today: calculate elapsed minutes so far
    if (inMins !== null) {
      const nowIST = new Date();
      // UTC to IST
      const istHours = (nowIST.getUTCHours() + 5 + Math.floor((nowIST.getUTCMinutes() + 30) / 60)) % 24;
      const istMinutes = (nowIST.getUTCMinutes() + 30) % 60;
      const nowMins = istHours * 60 + istMinutes;
      let diff = nowMins - inMins;
      if (diff < 0) diff = 0;
      return { minutes: diff, isClosed: false, isInvalid: false, hasCheckIn: true };
    }
    return { minutes: 0, isClosed: false, isInvalid: false, hasCheckIn: true };
  }

  // Past session with no checkout -> needs review
  return { minutes: 0, isClosed: false, isInvalid: true, hasCheckIn: true };
}

/**
 * Standard Status Evaluation Constants
 */
const STATUS_THRESHOLDS = {
  HALF_DAY_MIN_MINUTES: 240, // 4 hours
  FULL_DAY_MIN_MINUTES: 480, // 8 hours
};

/**
 * Classify status based on completed minutes.
 * - < 240m (< 4h) => 'Absent'
 * - 240m to 480m (4h to 8h) => 'Half Day'
 * - > 480m (> 8h) => 'Present'
 */
function classifyMinutesToStatus(totalMinutes) {
  if (totalMinutes > STATUS_THRESHOLDS.FULL_DAY_MIN_MINUTES) {
    return 'Present';
  }
  if (totalMinutes >= STATUS_THRESHOLDS.HALF_DAY_MIN_MINUTES) {
    return 'Half Day';
  }
  return 'Absent';
}

/**
 * Calculate the consolidated daily attendance outcome for a staff member on a specific date.
 * 
 * Rules:
 * 1. Admin Override takes precedence for official outcome.
 * 2. Unclosed past session => 'Needs Review'.
 * 3. Active session today => 'In Progress' (unless already completed > 8 hours).
 * 4. Sum completed work minutes across all sessions for the day, excluding breaks.
 * 5. < 4 hours => 'Absent'
 *    4 to 8 hours => 'Half Day'
 *    > 8 hours => 'Present'
 * 6. Non-working day fallbacks:
 *    - Sunday with 0 sessions => 'Weekly Off'
 *    - Prior to joining date => 'Not Joined'
 *    - Future date => 'Scheduled'
 */
function calculateDailyAttendance(staffUser, dateStr, sessions = [], override = null) {
  const todayDateStr = getTodayDateStringIST();
  const isToday = dateStr === todayDateStr;
  const isFuture = dateStr > todayDateStr;

  const staffId = String(staffUser._id || staffUser.id || '');
  const staffName = staffUser.name || 'Staff User';
  const role = staffUser.designation || staffUser.role || 'Sales Executive';
  const email = staffUser.email || '';

  // Calculate day of week (0 = Sunday, 1 = Monday, ...)
  const dateParts = dateStr.split('-');
  const dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
  const dayOfWeek = dateObj.getDay();

  // Check joining date
  const joiningDateStr = staffUser.joiningDate
    ? new Date(staffUser.joiningDate).toISOString().split('T')[0]
    : null;
  const isBeforeJoining = joiningDateStr && dateStr < joiningDateStr;

  // Process sessions
  let totalCompletedMinutes = 0;
  let hasOpenSession = false;
  let hasNeedsReview = false;
  let firstCheckIn = null;
  let lastCheckOut = null;
  let activeActivity = null;
  let activeLocation = null;

  const validSessions = [];

  // Sort sessions chronologically
  const sortedSessions = [...sessions].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  sortedSessions.forEach(session => {
    const evalResult = calculateSessionMinutes(session, dateStr, todayDateStr);
    if (!evalResult.hasCheckIn) return; // Skip records with no checkIn

    validSessions.push({
      ...session,
      parsedMinutes: evalResult.minutes,
      isClosed: evalResult.isClosed,
    });

    if (!firstCheckIn && session.checkIn && session.checkIn !== '-' && session.checkIn !== '—') {
      firstCheckIn = session.checkIn;
    }

    if (session.checkOut && session.checkOut !== '-' && session.checkOut !== '—') {
      lastCheckOut = session.checkOut;
    }

    if (evalResult.isClosed) {
      totalCompletedMinutes += evalResult.minutes;
    } else {
      if (isToday) {
        hasOpenSession = true;
        activeActivity = session.activityType || 'On Duty';
        activeLocation = session.location || session.projectName || null;
      } else {
        // Past date with unclosed checkout
        hasNeedsReview = true;
      }
    }
  });

  // Check Admin Override
  if (override && override.status) {
    return {
      staffId,
      staffName,
      email,
      role,
      date: dateStr,
      status: override.status,
      isOverridden: true,
      overrideNotes: override.notes || '',
      overriddenBy: override.overriddenBy || null,
      totalMinutes: totalCompletedMinutes,
      formattedDuration: formatMinutesToDuration(totalCompletedMinutes),
      sessionsCount: validSessions.length,
      sessions: validSessions,
      firstCheckIn: firstCheckIn || '-',
      lastCheckOut: lastCheckOut || '-',
      hasActiveSession: hasOpenSession,
    };
  }

  // If no sessions exist for the date:
  if (validSessions.length === 0) {
    if (isBeforeJoining) {
      return {
        staffId,
        staffName,
        email,
        role,
        date: dateStr,
        status: 'Not Joined',
        isOverridden: false,
        totalMinutes: 0,
        formattedDuration: '-',
        sessionsCount: 0,
        sessions: [],
        firstCheckIn: '-',
        lastCheckOut: '-',
        hasActiveSession: false,
      };
    }

    if (dayOfWeek === 0) {
      return {
        staffId,
        staffName,
        email,
        role,
        date: dateStr,
        status: 'Weekly Off',
        isOverridden: false,
        totalMinutes: 0,
        formattedDuration: '-',
        sessionsCount: 0,
        sessions: [],
        firstCheckIn: '-',
        lastCheckOut: '-',
        hasActiveSession: false,
      };
    }

    if (isFuture) {
      return {
        staffId,
        staffName,
        email,
        role,
        date: dateStr,
        status: 'Scheduled',
        isOverridden: false,
        totalMinutes: 0,
        formattedDuration: '-',
        sessionsCount: 0,
        sessions: [],
        firstCheckIn: '-',
        lastCheckOut: '-',
        hasActiveSession: false,
      };
    }

    // Past working date with no check-in => Absent
    return {
      staffId,
      staffName,
      email,
      role,
      date: dateStr,
      status: 'Absent',
      isOverridden: false,
      totalMinutes: 0,
      formattedDuration: '-',
      sessionsCount: 0,
      sessions: [],
      firstCheckIn: '-',
      lastCheckOut: '-',
      hasActiveSession: false,
    };
  }

  // If historical sessions had an unclosed checkout
  if (hasNeedsReview) {
    return {
      staffId,
      staffName,
      email,
      role,
      date: dateStr,
      status: 'Needs Review',
      isOverridden: false,
      totalMinutes: totalCompletedMinutes,
      formattedDuration: formatMinutesToDuration(totalCompletedMinutes),
      sessionsCount: validSessions.length,
      sessions: validSessions,
      firstCheckIn: firstCheckIn || '-',
      lastCheckOut: lastCheckOut || '-',
      hasActiveSession: false,
    };
  }

  // If session is active today:
  if (hasOpenSession) {
    // If completed work already exceeds 8 hours, it's definitely Present
    if (totalCompletedMinutes > STATUS_THRESHOLDS.FULL_DAY_MIN_MINUTES) {
      return {
        staffId,
        staffName,
        email,
        role,
        date: dateStr,
        status: 'Present',
        isOverridden: false,
        totalMinutes: totalCompletedMinutes,
        formattedDuration: formatMinutesToDuration(totalCompletedMinutes),
        sessionsCount: validSessions.length,
        sessions: validSessions,
        firstCheckIn: firstCheckIn || '-',
        lastCheckOut: '-',
        hasActiveSession: true,
        currentActivity: activeActivity,
        currentLocation: activeLocation,
      };
    }

    return {
      staffId,
      staffName,
      email,
      role,
      date: dateStr,
      status: 'In Progress',
      isOverridden: false,
      totalMinutes: totalCompletedMinutes,
      formattedDuration: formatMinutesToDuration(totalCompletedMinutes),
      sessionsCount: validSessions.length,
      sessions: validSessions,
      firstCheckIn: firstCheckIn || '-',
      lastCheckOut: '-',
      hasActiveSession: true,
      currentActivity: activeActivity,
      currentLocation: activeLocation,
    };
  }

  // All sessions closed on this day:
  const calculatedStatus = classifyMinutesToStatus(totalCompletedMinutes);

  return {
    staffId,
    staffName,
    email,
    role,
    date: dateStr,
    status: calculatedStatus,
    isOverridden: false,
    totalMinutes: totalCompletedMinutes,
    formattedDuration: formatMinutesToDuration(totalCompletedMinutes),
    sessionsCount: validSessions.length,
    sessions: validSessions,
    firstCheckIn: firstCheckIn || '-',
    lastCheckOut: lastCheckOut || '-',
    hasActiveSession: false,
  };
}

/**
 * Generate Real-time Admin Dashboard Presence Roster for Today.
 * 
 * Answers: "Did this active employee check in at least once today?"
 * - Checked in at least once today => 'Present' (even after checking out).
 * - No check-in today => 'Absent'.
 * - Note: Manual attendance status without an actual check-in does not count as dashboard presence.
 */
function getTodayPresenceRoster(activeStaffList, todaySessions = []) {
  const todayDateStr = getTodayDateStringIST();

  // Group today's sessions by staffId
  const sessionsByStaff = new Map();
  todaySessions.forEach(session => {
    const sId = String(session.staffId?._id || session.staffId || session.userId || '');
    if (!sId) return;
    if (!sessionsByStaff.has(sId)) {
      sessionsByStaff.set(sId, []);
    }
    sessionsByStaff.get(sId).push(session);
  });

  let presentCount = 0;
  let absentCount = 0;
  let activeCount = 0;

  const roster = activeStaffList.map(staff => {
    const sId = String(staff._id || staff.id);
    const staffSessions = sessionsByStaff.get(sId) || [];

    // Filter to valid sessions with actual checkIn
    const validSessions = staffSessions.filter(s => s.checkIn && s.checkIn !== '-' && s.checkIn !== '—');

    const hasCheckedInToday = validSessions.length > 0;
    const hasActiveSession = validSessions.some(s => !s.checkOut || s.checkOut === '-' || s.checkOut === '—');

    // Find earliest checkIn time
    let firstCheckIn = null;
    let lastCheckOut = null;
    let latestActivity = null;
    let latestLocation = null;

    if (hasCheckedInToday) {
      // Sort chronologically
      validSessions.sort((a, b) => {
        const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aT - bT;
      });

      firstCheckIn = validSessions[0].checkIn;
      const latest = validSessions[validSessions.length - 1];
      latestActivity = latest.activityType || 'On Duty';
      latestLocation = latest.location || latest.projectName || (latest.projectId && typeof latest.projectId === 'object' ? latest.projectId.name : null);

      const closedSessions = validSessions.filter(s => s.checkOut && s.checkOut !== '-' && s.checkOut !== '—');
      if (closedSessions.length > 0) {
        lastCheckOut = closedSessions[closedSessions.length - 1].checkOut;
      }
    }

    const presence = hasCheckedInToday ? 'Present' : 'Absent';
    if (presence === 'Present') {
      presentCount++;
      if (hasActiveSession) activeCount++;
    } else {
      absentCount++;
    }

    return {
      staffId: sId,
      name: staff.name,
      email: staff.email || '',
      initials: staff.initials || '',
      designation: staff.designation || 'Sales Executive',
      phone: staff.phone || '',
      avatarBg: staff.avatarBg || null,
      todayDate: todayDateStr,
      presence, // 'Present' | 'Absent'
      firstCheckIn: firstCheckIn || null,
      lastCheckOut: lastCheckOut || null,
      hasActiveSession,
      currentActivity: latestActivity,
      currentLocation: latestLocation,
      sessionsCount: validSessions.length,
    };
  });

  // Sort: Active sessions first, then Present (checked out), then Absent. Secondary sort by Name.
  roster.sort((a, b) => {
    const rank = item => (item.hasActiveSession ? 1 : item.presence === 'Present' ? 2 : 3);
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  return {
    date: todayDateStr,
    totalStaff: activeStaffList.length,
    presentCount,
    absentCount,
    activeCount,
    roster,
  };
}

module.exports = {
  parseTimeToMinutes,
  parseDurationToMinutes,
  formatMinutesToDuration,
  calculateSessionMinutes,
  classifyMinutesToStatus,
  calculateDailyAttendance,
  getTodayPresenceRoster,
  STATUS_THRESHOLDS,
};
