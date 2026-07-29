const request = require('supertest');
const { buildTestApp, createAdminUser, createTestUser, createPartnerUser } = require('../helpers');
const User = require('../../models/User');

const app = buildTestApp();

describe('User Controller', () => {
  let adminToken, staffToken, partnerToken;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
    const staff = await createTestUser();
    staffToken = staff.token;
    const partner = await createPartnerUser();
    partnerToken = partner.token;
  });

  describe('POST /api/v1/users', () => {
    it('should create a user as admin', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Staff', initials: 'NS', role: 'staff',
          email: `newstaff${Date.now()}@example.com`, phone: '123', password: 'password123',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('staff');
    });

    it('should return 403 for staff creating user', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'X', initials: 'X', role: 'staff', email: `x${Date.now()}@x.com`, phone: '1', password: 'password123',
        });
      expect(res.status).toBe(403);
    });

    it('should return 403 for partner creating user', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({
          name: 'X', initials: 'X', role: 'staff', email: `p${Date.now()}@x.com`, phone: '1', password: 'password123',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/users', () => {
    it('should return all users for admin', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should return users for partner (allowed role)', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${partnerToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    it('should update a user as admin', async () => {
      const user = await createTestUser({ name: 'Original' });
      const res = await request(app)
        .put(`/api/v1/users/${user.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated', initials: 'UP' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
    });

    it('should return 403 for staff updating user', async () => {
      const user = await createTestUser({ name: 'Target', email: `tgt${Date.now()}@x.com` });
      const res = await request(app)
        .put(`/api/v1/users/${user.user._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Hacked' });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should delete a user as admin', async () => {
      const created = await createTestUser({ email: `del${Date.now()}@x.com` });
      // Verify user exists before deleting
      const found = await User.findById(created.user._id);
      expect(found).not.toBeNull();
      const res = await request(app)
        .delete(`/api/v1/users/${created.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await User.findById(created.user._id)).toBeNull();
    });

    it('should return 403 for staff deleting user', async () => {
      const created = await createTestUser({ email: `del2${Date.now()}@x.com` });
      const res = await request(app)
        .delete(`/api/v1/users/${created.user._id}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });
  });
});
