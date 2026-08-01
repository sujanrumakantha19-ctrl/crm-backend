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
});
