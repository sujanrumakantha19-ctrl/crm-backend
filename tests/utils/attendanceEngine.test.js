const {
  parseTimeToMinutes,
  parseDurationToMinutes,
  formatMinutesToDuration,
  calculateSessionMinutes,
  classifyMinutesToStatus,
  calculateDailyAttendance,
  getTodayPresenceRoster,
  STATUS_THRESHOLDS,
} = require('../../utils/attendanceEngine');
const { getTodayDateStringIST } = require('../../utils/dateIST');

describe('Attendance Engine Unit Tests', () => {
  describe('parseTimeToMinutes', () => {
    it('should parse 12-hour AM/PM times correctly', () => {
      expect(parseTimeToMinutes('12:00 AM')).toBe(0);
      expect(parseTimeToMinutes('09:30 AM')).toBe(570);
      expect(parseTimeToMinutes('12:00 PM')).toBe(720);
      expect(parseTimeToMinutes('02:30 PM')).toBe(870);
      expect(parseTimeToMinutes('11:59 PM')).toBe(1439);
    });

    it('should parse 24-hour HH:MM times correctly', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('09:30')).toBe(570);
      expect(parseTimeToMinutes('14:30')).toBe(870);
      expect(parseTimeToMinutes('23:59')).toBe(1439);
    });

    it('should return null for invalid or empty time strings', () => {
      expect(parseTimeToMinutes('')).toBeNull();
      expect(parseTimeToMinutes('-')).toBeNull();
      expect(parseTimeToMinutes('—')).toBeNull();
      expect(parseTimeToMinutes('invalid')).toBeNull();
      expect(parseTimeToMinutes(null)).toBeNull();
    });
  });

  describe('parseDurationToMinutes', () => {
    it('should parse "Xh Ym" and "Xh" correctly', () => {
      expect(parseDurationToMinutes('4h 30m')).toBe(270);
      expect(parseDurationToMinutes('5h')).toBe(300);
      expect(parseDurationToMinutes('45m')).toBe(45);
      expect(parseDurationToMinutes('8h 0m')).toBe(480);
      expect(parseDurationToMinutes('4.5 hrs')).toBe(270);
    });

    it('should return 0 for empty or dash values', () => {
      expect(parseDurationToMinutes('-')).toBe(0);
      expect(parseDurationToMinutes('—')).toBe(0);
      expect(parseDurationToMinutes('')).toBe(0);
      expect(parseDurationToMinutes(null)).toBe(0);
    });
  });

  describe('formatMinutesToDuration', () => {
    it('should format minutes into human readable duration', () => {
      expect(formatMinutesToDuration(270)).toBe('4h 30m');
      expect(formatMinutesToDuration(480)).toBe('8h 0m');
      expect(formatMinutesToDuration(45)).toBe('45m');
      expect(formatMinutesToDuration(0)).toBe('-');
      expect(formatMinutesToDuration(-10)).toBe('-');
    });
  });

  describe('classifyMinutesToStatus', () => {
    it('should classify < 240 mins as Absent', () => {
      expect(classifyMinutesToStatus(0)).toBe('Absent');
      expect(classifyMinutesToStatus(120)).toBe('Absent');
      expect(classifyMinutesToStatus(239)).toBe('Absent');
    });

    it('should classify 240 to < 480 mins as Half Day', () => {
      expect(classifyMinutesToStatus(240)).toBe('Half Day');
      expect(classifyMinutesToStatus(360)).toBe('Half Day');
      expect(classifyMinutesToStatus(479)).toBe('Half Day');
    });

    it('should classify >= 480 mins as Present', () => {
      expect(classifyMinutesToStatus(480)).toBe('Present');
      expect(classifyMinutesToStatus(481)).toBe('Present');
      expect(classifyMinutesToStatus(540)).toBe('Present');
      expect(classifyMinutesToStatus(600)).toBe('Present');
    });
  });

  describe('calculateDailyAttendance', () => {
    const mockStaff = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test Staff',
      email: 'staff@example.com',
      role: 'staff',
      designation: 'Sales Executive',
      joiningDate: '2024-01-01',
    };

    it('should aggregate multiple sessions on same date (3h + 3h = 6h Half Day)', () => {
      const dateStr = '2024-05-10'; // Friday
      const sessions = [
        { checkIn: '09:00 AM', checkOut: '12:00 PM', duration: '3h 0m' },
        { checkIn: '02:00 PM', checkOut: '05:00 PM', duration: '3h 0m' },
      ];

      const res = calculateDailyAttendance(mockStaff, dateStr, sessions);
      expect(res.status).toBe('Half Day');
      expect(res.totalMinutes).toBe(360);
      expect(res.formattedDuration).toBe('6h 0m');
      expect(res.sessionsCount).toBe(2);
    });

    it('should classify single session > 8h as Present', () => {
      const dateStr = '2024-05-10';
      const sessions = [
        { checkIn: '09:00 AM', checkOut: '05:30 PM', duration: '8h 30m' },
      ];

      const res = calculateDailyAttendance(mockStaff, dateStr, sessions);
      expect(res.status).toBe('Present');
      expect(res.totalMinutes).toBe(510);
      expect(res.formattedDuration).toBe('8h 30m');
    });

    it('should classify total work < 4h as Absent', () => {
      const dateStr = '2024-05-10';
      const sessions = [
        { checkIn: '09:00 AM', checkOut: '11:00 AM', duration: '2h 0m' },
      ];

      const res = calculateDailyAttendance(mockStaff, dateStr, sessions);
      expect(res.status).toBe('Absent');
      expect(res.totalMinutes).toBe(120);
    });

    it('should flag unclosed session on past date as Needs Review', () => {
      const pastDateStr = '2024-05-10';
      const sessions = [
        { checkIn: '09:00 AM', checkOut: '-' },
      ];

      const res = calculateDailyAttendance(mockStaff, pastDateStr, sessions);
      expect(res.status).toBe('Needs Review');
    });

    it('should flag active session today as In Progress', () => {
      const todayStr = getTodayDateStringIST();
      const sessions = [
        { checkIn: '09:00 AM', checkOut: '-' },
      ];

      const res = calculateDailyAttendance(mockStaff, todayStr, sessions);
      expect(res.status).toBe('In Progress');
      expect(res.hasActiveSession).toBe(true);
    });

    it('should prioritize Admin Override over calculated hours', () => {
      const dateStr = '2024-05-10';
      const sessions = [
        { checkIn: '09:00 AM', checkOut: '10:00 AM', duration: '1h 0m' },
      ];
      const override = {
        status: 'Present',
        notes: 'Admin approved special on-duty work',
      };

      const res = calculateDailyAttendance(mockStaff, dateStr, sessions, override);
      expect(res.status).toBe('Present');
      expect(res.isOverridden).toBe(true);
      expect(res.overrideNotes).toBe('Admin approved special on-duty work');
    });
  });

  describe('getTodayPresenceRoster', () => {
    const activeStaff = [
      { _id: 'staff1', name: 'Alice', email: 'alice@example.com' },
      { _id: 'staff2', name: 'Bob', email: 'bob@example.com' },
      { _id: 'staff3', name: 'Charlie', email: 'charlie@example.com' },
    ];

    it('should return Present for checked-in staff (even after checkout) and Absent for unpunched staff', () => {
      const todaySessions = [
        { staffId: 'staff1', checkIn: '09:15 AM', checkOut: '05:30 PM' }, // Checked out
        { staffId: 'staff2', checkIn: '10:00 AM', checkOut: '-' },         // Currently active
      ];

      const result = getTodayPresenceRoster(activeStaff, todaySessions);
      expect(result.totalStaff).toBe(3);
      expect(result.presentCount).toBe(2);
      expect(result.absentCount).toBe(1);
      expect(result.activeCount).toBe(1);

      const alice = result.roster.find(r => r.staffId === 'staff1');
      expect(alice.presence).toBe('Present');
      expect(alice.firstCheckIn).toBe('09:15 AM');
      expect(alice.hasActiveSession).toBe(false);

      const bob = result.roster.find(r => r.staffId === 'staff2');
      expect(bob.presence).toBe('Present');
      expect(bob.firstCheckIn).toBe('10:00 AM');
      expect(bob.hasActiveSession).toBe(true);

      const charlie = result.roster.find(r => r.staffId === 'staff3');
      expect(charlie.presence).toBe('Absent');
      expect(charlie.firstCheckIn).toBeNull();
      expect(charlie.hasActiveSession).toBe(false);
    });
  });
});
