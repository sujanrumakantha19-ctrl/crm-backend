const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Attendance = require('../../models/Attendance');
const User = require('../../models/User');
const { markAbsentForDate } = require('../../utils/cronJobs');

const app = buildTestApp();

describe('Attendance Controller', () => {
  let adminToken, staffToken, staffUser;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
    staffUser = staff.user;
  });

  describe('POST /api/v1/attendance', () => {
    it('should create attendance record', async () => {
      const res = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staffId: staffUser._id,
          staffName: staffUser.name,
          date: '2024-01-15',
          checkIn: '09:00',
          status: 'Present',
          role: 'staff',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('Present');
    });
  });

  describe('GET /api/v1/attendance', () => {
    it('should return paginated records', async () => {
      await Attendance.create([
        { staffId: staffUser._id, staffName: 'S', date: '2024-01-15', status: 'Present' },
        { staffId: staffUser._id, staffName: 'S', date: '2024-01-16', status: 'Absent' },
      ]);
      const res = await request(app)
        .get('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/attendance/staff/:staffId', () => {
    it('should filter by staff', async () => {
      const other = await User.create({
        name: 'Other', initials: 'OT', role: 'staff', email: `o${Date.now()}@x.com`, phone: '222', password: 'password123',
      });
      await Attendance.create([
        { staffId: staffUser._id, staffName: 'S', date: '2024-01-15', status: 'Present' },
        { staffId: other._id, staffName: 'O', date: '2024-01-15', status: 'Absent' },
      ]);
      const res = await request(app)
        .get(`/api/v1/attendance/staff/${staffUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(a => a.staffId.toString() === staffUser._id.toString())).toBe(true);
    });
  });

  describe('GET /api/v1/attendance/date/:date', () => {
    it('should filter by date', async () => {
      await Attendance.create([
        { staffId: staffUser._id, staffName: 'S', date: '2024-01-15', status: 'Present' },
        { staffId: staffUser._id, staffName: 'S', date: '2024-01-16', status: 'Absent' },
      ]);
      const res = await request(app)
        .get('/api/v1/attendance/date/2024-01-15')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(a => a.date && a.date.toString().startsWith('2024-01-15'))).toBe(true);
    });
  });

  describe('PUT /api/v1/attendance/:id', () => {
    it('should update attendance record', async () => {
      const att = await Attendance.create({
        staffId: staffUser._id, staffName: 'S', date: '2024-01-15', status: 'Present',
      });
      const res = await request(app)
        .put(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ checkOut: '18:00', duration: '9h' });
      expect(res.status).toBe(200);
      expect(res.body.data.checkOut).toBe('18:00');
    });
  });

  describe('DELETE /api/v1/attendance/:id', () => {
    it('should delete attendance record', async () => {
      const att = await Attendance.create({
        staffId: staffUser._id, staffName: 'S', date: '2024-01-15', status: 'Present',
      });
      const res = await request(app)
        .delete(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await Attendance.findById(att._id)).toBeNull();
    });
  });

  describe('Rapid re-check-in (issue 29)', () => {
    it('should create a NEW record on repeated check-in instead of merging previous one', async () => {
      const date = new Date().toISOString().slice(0, 10);

      const first = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ staffId: staffUser._id, staffName: staffUser.name, date, checkIn: '09:00', status: 'Present', role: 'staff' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ staffId: staffUser._id, staffName: staffUser.name, date, checkIn: '09:05', status: 'Present', role: 'staff' });

      expect(second.status).toBe(201);
      expect(String(second.body.data.id)).not.toBe(String(first.body.data.id));

      const count = await Attendance.countDocuments({ staffId: staffUser._id, date });
      expect(count).toBe(2);

      // The first record must keep its original check-in and not be cleared
      const firstDoc = await Attendance.findById(first.body.data.id);
      expect(firstDoc.checkIn).toBe('09:00');
    });
  });

  describe('Admin status editing (issue 28)', () => {
    it('should allow marking a staff member Absent for a date', async () => {
      const att = await Attendance.create({
        staffId: staffUser._id, staffName: staffUser.name, date: '2024-01-16', status: 'Present',
      });
      const res = await request(app)
        .put(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Absent' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Absent');
    });

    it('should allow creating an Absent record for a day with no check-in', async () => {
      const res = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ staffId: staffUser._id, staffName: staffUser.name, date: '2024-01-17', status: 'Absent', role: 'staff' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('Absent');
    });
  });

  describe('Absent cron (issue 28a)', () => {
    it('should mark Absent staff with no attendance on a non-Sunday working date', async () => {
      const target = new Date('2024-01-15'); // a Monday
      await markAbsentForDate(target);

      const rec = await Attendance.findOne({ staffId: staffUser._id, date: '2024-01-15' });
      expect(rec).not.toBeNull();
      expect(rec.status).toBe('Absent');
    });

    it('should NOT create Absent records on Sundays (weekly off)', async () => {
      const target = new Date('2024-01-14'); // a Sunday
      await markAbsentForDate(target);
      const count = await Attendance.countDocuments({ date: '2024-01-14' });
      expect(count).toBe(0);
    });

    it('should not overwrite an existing record for the date', async () => {
      await Attendance.create({
        staffId: staffUser._id, staffName: staffUser.name, date: '2024-01-15', status: 'Present',
      });
      await markAbsentForDate(new Date('2024-01-15'));
      const count = await Attendance.countDocuments({ staffId: staffUser._id, date: '2024-01-15' });
      expect(count).toBe(1);
    });
  });

  describe('GET /api/v1/attendance/presence/today', () => {
    it('should return complete active staff roster with presence status', async () => {
      const { getTodayDateStringIST } = require('../../utils/dateIST');
      const today = getTodayDateStringIST();

      await Attendance.create({
        staffId: staffUser._id,
        staffName: staffUser.name,
        date: today,
        checkIn: '09:15 AM',
        status: 'Present',
        role: 'staff',
      });

      const res = await request(app)
        .get('/api/v1/attendance/presence/today')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.presentCount).toBeGreaterThanOrEqual(1);
      const staffMember = res.body.data.find(s => String(s.staffId) === String(staffUser._id));
      expect(staffMember).toBeDefined();
      expect(staffMember.presence).toBe('Present');
      expect(staffMember.firstCheckIn).toBe('09:15 AM');
    });
  });

  describe('GET /api/v1/attendance/daily', () => {
    it('should return aggregated daily attendance outcome for staff', async () => {
      await Attendance.create([
        {
          staffId: staffUser._id,
          staffName: staffUser.name,
          date: '2024-06-10',
          checkIn: '09:00 AM',
          checkOut: '12:00 PM',
          duration: '3h 0m',
          status: 'Present',
          role: 'staff',
        },
        {
          staffId: staffUser._id,
          staffName: staffUser.name,
          date: '2024-06-10',
          checkIn: '02:00 PM',
          checkOut: '05:00 PM',
          duration: '3h 0m',
          status: 'Present',
          role: 'staff',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/attendance/daily?date=2024-06-10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const record = res.body.data.find(r => String(r.staffId) === String(staffUser._id));
      expect(record).toBeDefined();
      // 3h + 3h = 6h => Half Day
      expect(record.status).toBe('Half Day');
      expect(record.totalMinutes).toBe(360);
      expect(record.formattedDuration).toBe('6h 0m');
    });
  });

  describe('POST /api/v1/attendance/override', () => {
    it('should allow admin to set and remove daily attendance override', async () => {
      // 1. Set override
      const res = await request(app)
        .post('/api/v1/attendance/override')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staffId: staffUser._id,
          date: '2024-06-10',
          status: 'Present',
          notes: 'Special admin approval for on-duty work',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Present');

      // Check daily endpoint reflects the override
      const dailyRes = await request(app)
        .get('/api/v1/attendance/daily?date=2024-06-10')
        .set('Authorization', `Bearer ${adminToken}`);
      const record = dailyRes.body.data.find(r => String(r.staffId) === String(staffUser._id));
      expect(record.status).toBe('Present');
      expect(record.isOverridden).toBe(true);
      expect(record.overrideNotes).toBe('Special admin approval for on-duty work');

      // 2. Remove override
      const removeRes = await request(app)
        .post('/api/v1/attendance/override')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staffId: staffUser._id,
          date: '2024-06-10',
          status: 'Remove',
        });
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.data).toBeNull();
    });
  });

  describe('Attendance Hardening & Permissions', () => {
    it('should return 403 Forbidden when a channel partner accesses attendance endpoints', async () => {
      const { createPartnerUser } = require('../helpers');
      const partner = await createPartnerUser();

      const getRes = await request(app)
        .get('/api/v1/attendance')
        .set('Authorization', `Bearer ${partner.token}`);
      expect(getRes.status).toBe(403);

      const exportRes = await request(app)
        .get('/api/v1/export/attendance')
        .set('Authorization', `Bearer ${partner.token}`);
      expect(exportRes.status).toBe(403);
    });

    it('should perform checkout idempotently without re-extending duration on repeated requests', async () => {
      const att = await Attendance.create({
        staffId: staffUser._id,
        staffName: staffUser.name,
        date: '2024-06-15',
        checkIn: '09:00',
        checkOut: '17:00',
        duration: '8h 0m',
        status: 'Present',
        role: 'staff',
      });

      // Calling update again on an already checked-out session returns the existing document
      const res = await request(app)
        .put(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ checkOut: '19:00' });

      expect(res.status).toBe(200);
      expect(res.body.data.checkOut).toBe('17:00');
      expect(res.body.data.duration).toBe('8h 0m');
    });

    it('should reject inverted date ranges with 400 in getDailyAttendance', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/daily?dateFrom=2024-06-25&dateTo=2024-06-10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/start date cannot be after end date/i);
    });

    it('should stream attendance summary CSV with 1 row per staff/day and details CSV with session breakdown', async () => {
      await Attendance.create([
        { staffId: staffUser._id, staffName: staffUser.name, date: '2024-06-18', checkIn: '09:00', checkOut: '12:00', duration: '3h 0m', status: 'Present', role: 'staff' },
        { staffId: staffUser._id, staffName: staffUser.name, date: '2024-06-18', checkIn: '13:00', checkOut: '16:00', duration: '3h 0m', status: 'Present', role: 'staff' },
      ]);

      // Summary export
      const summaryRes = await request(app)
        .get('/api/v1/export/attendance?date=2024-06-18')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.text).toContain('"Staff","Role","Date","Status"');
      // Should have 1 row for staffUser on that date
      const summaryLines = summaryRes.text.trim().split('\n');
      expect(summaryLines.length).toBe(2); // Header + 1 staff row
      expect(summaryRes.text).toContain('Half Day'); // 3h + 3h = 6h Half Day

      // Details export
      const detailsRes = await request(app)
        .get('/api/v1/export/attendance?date=2024-06-18&tab=details')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(detailsRes.status).toBe(200);
      expect(detailsRes.text).toContain('"Session Duration","Daily Duration","Daily Status"');
      const detailLines = detailsRes.text.trim().split('\n');
      expect(detailLines.length).toBe(3); // Header + 2 sessions
    });

    it('should return 409 when marking Absent for staff with active running session unless confirmed', async () => {
      // Create an open active session
      await Attendance.create({
        staffId: staffUser._id,
        staffName: staffUser.name,
        date: '2024-07-01',
        checkIn: '09:30',
        checkOut: '-',
        status: 'Present',
        role: 'staff',
      });

      // Attempting to set override status to Absent without confirmation
      const res1 = await request(app)
        .post('/api/v1/attendance/override')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staffId: staffUser._id,
          date: '2024-07-01',
          status: 'Absent',
        });
      expect(res1.status).toBe(409);
      expect(res1.body.code).toBe('ACTIVE_SESSION_OVERRIDE_CONFIRMATION_REQUIRED');

      // Attempting with confirmActiveOverride: true
      const res2 = await request(app)
        .post('/api/v1/attendance/override')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staffId: staffUser._id,
          date: '2024-07-01',
          status: 'Absent',
          confirmActiveOverride: true,
        });
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('Absent');

      // Verify the running session still exists and was not corrupted
      const session = await Attendance.findOne({ staffId: staffUser._id, date: '2024-07-01', checkOut: '-' });
      expect(session).not.toBeNull();
      expect(session.checkIn).toBe('09:30');
    });
  });
});


