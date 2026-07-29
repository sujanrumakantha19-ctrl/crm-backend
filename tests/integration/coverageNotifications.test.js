const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const Lead = require('../../models/Lead');

const app = buildTestApp();

describe('Notification Controller Coverage', () => {
  describe('GET /api/v1/notifications/:id', () => {
    it('should get a single notification', async () => {
      const admin = await createAdminUser();
      const notif = await Notification.create({
        type: 'new_lead', message: 'Test', userId: admin.user._id,
      });
      const res = await request(app)
        .get(`/api/v1/notifications/${notif._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe('new_lead');
    });

    it('should return 404 for non-existent notification', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .get(`/api/v1/notifications/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/notifications/:id', () => {
    it('should update notification (only isRead)', async () => {
      const admin = await createAdminUser();
      const notif = await Notification.create({
        type: 'booking', message: 'Booking', userId: admin.user._id,
      });
      const res = await request(app)
        .put(`/api/v1/notifications/${notif._id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isRead: true, type: 'birthday', message: 'Hacked' });
      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);
      // Verify type and message were not changed (mass assignment protection)
      const updated = await Notification.findById(notif._id);
      expect(updated.type).toBe('booking');
      expect(updated.message).toBe('Booking');
    });

    it('should return 404 for non-existent notification', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .put(`/api/v1/notifications/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isRead: true });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/notifications/:id', () => {
    it('should delete a notification', async () => {
      const admin = await createAdminUser();
      const notif = await Notification.create({
        type: 'attendance', message: 'Delete me', userId: admin.user._id,
      });
      const res = await request(app)
        .delete(`/api/v1/notifications/${notif._id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(await Notification.findById(notif._id)).toBeNull();
    });

    it('should return 404 for non-existent notification', async () => {
      const admin = await createAdminUser();
      const fakeId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .delete(`/api/v1/notifications/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/notifications/unread pagination', () => {
    it('should support page and limit params', async () => {
      const admin = await createAdminUser();
      for (let i = 0; i < 5; i++) {
        await Notification.create({
          type: 'new_lead', message: `Notif ${i}`, userId: admin.user._id,
        });
      }
      const res = await request(app)
        .get('/api/v1/notifications/unread?page=1&limit=2')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(5);
      expect(res.body.pagination.pages).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Birthday notification creation', () => {
    it('should create birthday notifications for staff with today birthday', async () => {
      const admin = await createAdminUser();
      const today = new Date();
      const dob = `${today.getFullYear() - 30}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      await User.create({
        name: 'Birthday Staff', initials: 'BS', role: 'staff',
        email: `bday${Date.now()}@x.com`, phone: '123', password: 'pass123', dob,
      });

      // Trigger birthday check via GET notifications
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);

      // Check if birthday notification was created
      const birthdayNotifs = await Notification.find({
        userId: admin.user._id, type: 'birthday', entityType: 'User',
      });
      expect(birthdayNotifs.length).toBeGreaterThanOrEqual(1);
      expect(birthdayNotifs[0].message).toContain('Birthday');
    });

    it('should create birthday notifications for customers with today birthday', async () => {
      const admin = await createAdminUser();
      const today = new Date();
      const dob = `${today.getFullYear() - 30}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      await Lead.create({
        customerName: 'Birthday Customer', phone: '999',
        email: `bcust${Date.now()}@x.com`, status: 'Customer', dob,
      });

      await request(app)
        .get('/api/v1/notifications/unread')
        .set('Authorization', `Bearer ${admin.token}`);

      const birthdayNotifs = await Notification.find({
        userId: admin.user._id, type: 'birthday', entityType: 'Lead',
      });
      expect(birthdayNotifs.length).toBeGreaterThanOrEqual(1);
    });

    it('should not duplicate birthday notifications', async () => {
      const admin = await createAdminUser();
      const today = new Date();
      const dob = `${today.getFullYear() - 30}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      await User.create({
        name: 'Dup Staff', initials: 'DS', role: 'staff',
        email: `dupbday${Date.now()}@x.com`, phone: '123', password: 'pass123', dob,
      });

      // Trigger twice
      await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${admin.token}`);
      await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${admin.token}`);

      const birthdayNotifs = await Notification.find({
        userId: admin.user._id, type: 'birthday', entityType: 'User',
      });
      // Should not create duplicates
      expect(birthdayNotifs.length).toBe(1);
    });
  });
});
