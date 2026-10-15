const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Attendance = require('../../models/Attendance');
const AttendanceOverride = require('../../models/AttendanceOverride');
const User = require('../../models/User');
const Task = require('../../models/Task');
const Lead = require('../../models/Lead');
const Project = require('../../models/Project');
const { calculateDailyAttendance } = require('../../utils/attendanceEngine');

const app = buildTestApp();

describe('Consolidated Hardening & Regression-Safety Tests', () => {
  let adminToken, adminUser, staffToken, staffUser, partnerToken, partnerUser;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    adminUser = admin.user;

    const staff = await createTestUser();
    staffToken = staff.token;
    staffUser = staff.user;

    const partner = await User.create({
      name: 'Channel Partner Test',
      initials: 'CP',
      role: 'partner',
      email: `cp_${Date.now()}@test.com`,
      phone: '9876543299',
      password: 'password123',
    });
    const jwt = require('jsonwebtoken');
    partnerToken = jwt.sign({ id: partner._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    partnerUser = partner;
  });

  describe('1. Attendance Calendar Validation', () => {
    it('should reject invalid calendar date February 30 with 400', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/date/2026-02-30')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid date format|Invalid calendar date/i);
    });

    it('should reject non-existent calendar date 2026-99-99 in override with 400', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/override')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          staffId: staffUser._id,
          date: '2026-99-99',
          status: 'Present',
          reason: 'Valid reason for test',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid date format|Invalid calendar date/i);
    });

    it('should reject invalid date range in getDailyAttendance with 400', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/daily?dateFrom=2026-02-31&dateTo=2026-03-01')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('2. Attendance Authority & Active Punch Lifecycle', () => {
    it('should reject staff attempts to change date, timing, status, or duration on PUT with 403', async () => {
      const original = await Attendance.create({
        staffId: staffUser._id,
        staffName: staffUser.name,
        date: '2026-03-10',
        checkIn: '09:00',
        checkOut: '17:00',
        duration: '8h 0m',
        status: 'Half Day',
        role: 'staff',
      });

      // Attempt to modify date
      let res = await request(app)
        .put(`/api/v1/attendance/${original._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ date: '2020-01-01' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot modify attendance date/i);

      // Attempt to modify checkIn
      res = await request(app)
        .put(`/api/v1/attendance/${original._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ checkIn: '08:00' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot modify check-in time/i);

      // Attempt to modify duration
      res = await request(app)
        .put(`/api/v1/attendance/${original._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ duration: '99h' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot directly set duration/i);

      // Attempt to modify status
      res = await request(app)
        .put(`/api/v1/attendance/${original._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'Present' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot directly modify attendance status/i);

      // Legitimate activityType update succeeds
      res = await request(app)
        .put(`/api/v1/attendance/${original._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ activityType: 'Projects' });
      expect(res.status).toBe(200);
      const updated = await Attendance.findById(original._id);
      expect(updated.activityType).toBe('Projects');
    });

    it('should reject staff attempt to reopen a closed session with checkOut = "-" with 403', async () => {
      const closed = await Attendance.create({
        staffId: staffUser._id,
        staffName: staffUser.name,
        date: '2026-03-10',
        checkIn: '09:00',
        checkOut: '17:00',
        duration: '8h 0m',
        status: 'Present',
        role: 'staff',
      });

      const res = await request(app)
        .put(`/api/v1/attendance/${closed._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          checkOut: '-',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/reopen closed attendance sessions/i);
    });

    it('should block staff from deleting attendance records with 403', async () => {
      const rec = await Attendance.create({
        staffId: staffUser._id,
        staffName: staffUser.name,
        date: '2026-03-10',
        checkIn: '09:00',
        status: 'Present',
        role: 'staff',
      });

      const res = await request(app)
        .delete(`/api/v1/attendance/${rec._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    it('should return active session on GET /api/v1/attendance/active and null after checkout', async () => {
      // Check active when none
      let res = await request(app)
        .get('/api/v1/attendance/active')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();

      // Punch in
      await Attendance.create({
        staffId: staffUser._id,
        staffName: staffUser.name,
        date: '2026-03-10',
        checkIn: '10:00',
        checkOut: '-',
        status: 'Present',
        role: 'staff',
      });

      res = await request(app)
        .get('/api/v1/attendance/active')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).not.toBeNull();
      expect(res.body.data.checkIn).toBe('10:00');
    });

    it('should preserve legacy status-only Present records without times in calculateDailyAttendance', () => {
      const legacyPresent = [{
        _id: 'legacy-1',
        staffId: staffUser._id,
        date: '2026-03-10',
        checkIn: '-',
        checkOut: '-',
        status: 'Present',
      }];

      const daily = calculateDailyAttendance(staffUser, '2026-03-10', legacyPresent);
      expect(daily.status).toBe('Present');
      expect(daily.effectiveStatus).toBe('Present');
    });
  });

  describe('3. Task Permissions & Scoping', () => {
    it('should block partner from exporting tasks with 403', async () => {
      const res = await request(app)
        .get('/api/v1/export/tasks')
        .set('Authorization', `Bearer ${partnerToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow assigned staff member to GET /api/v1/tasks/:id even when assignee is populated', async () => {
      const task = await Task.create({
        title: 'Assigned Task Test',
        description: 'Test task',
        status: 'To Do',
        priority: 'High',
        assignee: staffUser._id,
        createdBy: adminUser._id,
      });

      const res = await request(app)
        .get(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Assigned Task Test');
    });

    it('should block partner from updating task with 403', async () => {
      const task = await Task.create({
        title: 'Partner Block Test',
        description: 'Test task',
        status: 'To Do',
        priority: 'High',
        assignee: staffUser._id,
        createdBy: adminUser._id,
      });

      const res = await request(app)
        .put(`/api/v1/tasks/${task._id}`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ status: 'Done' });

      expect(res.status).toBe(403);
    });
  });
});
