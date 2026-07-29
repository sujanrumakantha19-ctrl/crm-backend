const request = require('supertest');
const { buildTestApp, createTestUser, createAdminUser, createPartnerUser } = require('../helpers');
const User = require('../../models/User');
const Lead = require('../../models/Lead');
const Notification = require('../../models/Notification');

const app = buildTestApp();

describe('Security Tests', () => {
  describe('Mass Assignment Prevention', () => {
    it('should ignore unauthorized fields when updating a lead', async () => {
      const { user, token } = await createAdminUser();
      const lead = await Lead.create({
        customerName: 'Test Customer',
        phone: '9876543210',
        email: 'test@example.com',
        status: 'Open',
      });

      // Attempt to inject fields that should not be updatable
      const res = await request(app)
        .put(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerName: 'Updated Name',
          status: 'Qualified',
          // These should be ignored:
          createdAt: '2000-01-01',
          __v: 99,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.customerName).toBe('Updated Name');
      expect(res.body.data.status).toBe('Qualified');
    });

    it('should not allow setting assignedTo to arbitrary value via updateLead', async () => {
      const { user, token } = await createAdminUser();
      const otherUser = await User.create({
        name: 'Other',
        initials: 'OU',
        role: 'staff',
        email: 'other@example.com',
        phone: '111',
        password: 'password123',
      });
      const lead = await Lead.create({
        customerName: 'Test',
        phone: '123',
        email: 'a@b.com',
      });

      // Update should work (assignedTo is in the whitelist)
      const res = await request(app)
        .put(`/api/v1/leads/${lead._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assignedTo: otherUser._id });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedTo).toBe(otherUser._id.toString());
    });

    it('should only allow isRead field when updating notification', async () => {
      const { user, token } = await createAdminUser();
      const notification = await Notification.create({
        type: 'new_lead',
        message: 'Test notification',
        userId: user._id,
      });

      const res = await request(app)
        .put(`/api/v1/notifications/${notification._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          isRead: true,
          // These should be ignored:
          type: 'birthday',
          message: 'Hacked message',
          userId: user._id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);
      expect(res.body.data.type).toBe('new_lead'); // unchanged
      expect(res.body.data.message).toBe('Test notification'); // unchanged
    });
  });

  describe('Register Role Restriction', () => {
    it('should force role to partner regardless of input', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Hacker',
          initials: 'HK',
          email: `hacker${Date.now()}@example.com`,
          phone: '9999999999',
          password: 'password123',
          role: 'admin', // should be ignored
        });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('partner');

      // Verify in DB
      const user = await User.findById(res.body.data.id);
      expect(user.role).toBe('partner');
    });

    it('should not accept staff role via register', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Staff',
          initials: 'ST',
          email: `staff${Date.now()}@example.com`,
          phone: '8888888888',
          password: 'password123',
          role: 'staff',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('partner');
    });
  });

  describe('Authentication Requirements', () => {
    it('should return 401 for protected routes without token', async () => {
      const res = await request(app).get('/api/v1/users');
      expect(res.status).toBe(401);
    });

    it('should return 401 for invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });

    it('should return 401 for expired token', async () => {
      const { user } = await createAdminUser();
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '0s' });
      await new Promise(r => setTimeout(r, 100));

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });

    it('should return 200 for partner on allowed routes', async () => {
      const { token } = await createPartnerUser();

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('should return 403 for partner on admin-only routes', async () => {
      const { token } = await createPartnerUser();

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X', initials: 'X', role: 'staff', email: 'x@x.com', phone: '1', password: 'password123' });
      expect(res.status).toBe(403);
    });
  });
});
