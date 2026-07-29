const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser } = require('../helpers');
const Notification = require('../../models/Notification');

const app = buildTestApp();

describe('Notification Controller', () => {
  let adminToken, staffToken, adminUser;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    adminUser = admin.user;
    const staff = await createTestUser();
    staffToken = staff.token;
  });

  describe('POST /api/v1/notifications', () => {
    it('should create a notification', async () => {
      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'new_lead', message: 'New lead assigned' });
      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('new_lead');
    });
  });

  describe('GET /api/v1/notifications', () => {
    it('should return notifications for current user', async () => {
      await Notification.create({
        type: 'new_lead', message: 'Test', userId: adminUser._id,
      });
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/notifications/unread', () => {
    it('should return only unread notifications', async () => {
      await Notification.create([
        { type: 'new_lead', message: 'Unread', userId: adminUser._id, isRead: false },
        { type: 'birthday', message: 'Read', userId: adminUser._id, isRead: true },
      ]);
      const res = await request(app)
        .get('/api/v1/notifications/unread')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(n => n.isRead === false)).toBe(true);
    });
  });

  describe('PUT /api/v1/notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const notif = await Notification.create({
        type: 'task_assigned', message: 'Task', userId: adminUser._id, isRead: false,
      });
      const res = await request(app)
        .put(`/api/v1/notifications/${notif._id}/read`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);
    });
  });

  describe('PUT /api/v1/notifications/read/all', () => {
    it('should mark all user notifications as read', async () => {
      await Notification.create([
        { type: 'new_lead', message: 'N1', userId: adminUser._id, isRead: false },
        { type: 'birthday', message: 'N2', userId: adminUser._id, isRead: false },
      ]);
      const res = await request(app)
        .put('/api/v1/notifications/read/all')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const check = await Notification.find({ userId: adminUser._id, isRead: false });
      expect(check.length).toBe(0);
    });
  });

  describe('DELETE /api/v1/notifications/:id', () => {
    it('should delete a notification', async () => {
      const notif = await Notification.create({
        type: 'attendance', message: 'Delete me', userId: adminUser._id,
      });
      const res = await request(app)
        .delete(`/api/v1/notifications/${notif._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await Notification.findById(notif._id)).toBeNull();
    });
  });
});
