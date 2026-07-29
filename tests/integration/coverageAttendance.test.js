const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Attendance = require('../../models/Attendance');
const User = require('../../models/User');

const app = buildTestApp();

describe('Attendance Controller Coverage', () => {
  describe('GET /api/v1/attendance/:id', () => {
    it('should get a single attendance record', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `att${Date.now()}@x.com` });
      const att = await Attendance.create({
        staffId: staff.user._id, staffName: staff.user.name,
        date: '2024-06-15', checkIn: '09:00', status: 'Present',
      });
      const res = await request(app)
        .get(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent attendance', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/attendance/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/attendance/:id', () => {
    it('should update attendance', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `attu${Date.now()}@x.com` });
      const att = await Attendance.create({
        staffId: staff.user._id, staffName: staff.user.name,
        date: '2024-06-15', status: 'Present',
      });
      const res = await request(app)
        .put(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ checkOut: '18:00', duration: '9h' });
      expect(res.status).toBe(200);
      expect(res.body.data.checkOut).toBe('18:00');
    });

    it('should return 404 for non-existent attendance', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/attendance/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ checkOut: '18:00' });
      expect(res.status).toBe(404);
    });

    it('should strip undefined fields', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `atts${Date.now()}@x.com` });
      const att = await Attendance.create({
        staffId: staff.user._id, staffName: staff.user.name,
        date: '2024-06-15', status: 'Present',
      });
      const res = await request(app)
        .put(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ duration: '8h', checkIn: undefined, checkOut: undefined });
      expect(res.status).toBe(200);
      expect(res.body.data.duration).toBe('8h');
    });
  });

  describe('DELETE /api/v1/attendance/:id', () => {
    it('should delete attendance', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `attd${Date.now()}@x.com` });
      const att = await Attendance.create({
        staffId: staff.user._id, staffName: staff.user.name,
        date: '2024-06-15', status: 'Present',
      });
      const res = await request(app)
        .delete(`/api/v1/attendance/${att._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(await Attendance.findById(att._id)).toBeNull();
    });

    it('should return 404 for non-existent attendance', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/v1/attendance/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/attendance/staff/:staffId pagination', () => {
    it('should support page and limit params', async () => {
      const admin = await createAdminUser();
      const staff = await createTestUser({ email: `attp${Date.now()}@x.com` });
      for (let i = 0; i < 5; i++) {
        await Attendance.create({
          staffId: staff.user._id, staffName: staff.user.name,
          date: `2024-06-${15 + i}`, status: 'Present',
        });
      }
      const res = await request(app)
        .get(`/api/v1/attendance/staff/${staff.user._id}?page=1&limit=2`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(5);
    });
  });

  describe('GET /api/v1/attendance/date/:date pagination', () => {
    it('should support page and limit params', async () => {
      const admin = await createAdminUser();
      const staff1 = await createTestUser({ email: `atd1${Date.now()}@x.com` });
      const staff2 = await createTestUser({ email: `atd2${Date.now()}@x.com` });
      await Attendance.create([
        { staffId: staff1.user._id, staffName: staff1.user.name, date: '2024-07-01', status: 'Present' },
        { staffId: staff2.user._id, staffName: staff2.user.name, date: '2024-07-01', status: 'Absent' },
      ]);
      const res = await request(app)
        .get('/api/v1/attendance/date/2024-07-01?page=1&limit=1')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.total).toBe(2);
    });
  });

  describe('GET /api/v1/attendance/today', () => {
    it('should return today attendance', async () => {
      const admin = await createAdminUser();
      const today = new Date().toISOString().slice(0, 10);
      const staff = await createTestUser({ email: `attt${Date.now()}@x.com` });
      await Attendance.create({
        staffId: staff.user._id, staffName: staff.user.name,
        date: today, status: 'Present',
      });
      const res = await request(app)
        .get('/api/v1/attendance/today')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      const admin = await createAdminUser();
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get('/api/v1/attendance/today?page=1&limit=10')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
    });
  });
});
