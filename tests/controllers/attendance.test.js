const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Attendance = require('../../models/Attendance');
const User = require('../../models/User');

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
});
