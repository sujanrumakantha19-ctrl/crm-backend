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

    it('should assign a staff member to a group and keep User.groupId and destination Group.members in sync', async () => {
      const Group = require('../../models/Group');
      const testGroup = await Group.create({ name: `Sales Team ${Date.now()}` });
      const user = await createTestUser({ name: 'Staff Assigned' });

      const res = await request(app)
        .put(`/api/v1/users/${user.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ groupId: testGroup._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify User.groupId and destination Group.members agree
      const freshUser = await User.findById(user.user._id);
      const freshGroup = await Group.findById(testGroup._id);

      expect(String(freshUser.groupId)).toBe(testGroup._id.toString());
      expect(freshGroup.members.map(String)).toContain(user.user._id.toString());
    });

    it('should move a staff member from Group A to Group B through profile editing without leaving them in Group A', async () => {
      const Group = require('../../models/Group');
      const groupA = await Group.create({ name: `Sales Alpha ${Date.now()}` });
      const groupB = await Group.create({ name: `Sales Beta ${Date.now()}` });
      const user = await createTestUser({ name: 'Staff Relocated' });

      // Initially assign to Group A
      await request(app)
        .put(`/api/v1/users/${user.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ groupId: groupA._id.toString() });

      const checkGroupA = await Group.findById(groupA._id);
      expect(checkGroupA.members.map(String)).toContain(user.user._id.toString());

      // Reassign to Group B via user profile update
      const res = await request(app)
        .put(`/api/v1/users/${user.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ groupId: groupB._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const freshUser = await User.findById(user.user._id);
      const freshGroupA = await Group.findById(groupA._id);
      const freshGroupB = await Group.findById(groupB._id);

      expect(String(freshUser.groupId)).toBe(groupB._id.toString());
      expect(freshGroupA.members.map(String)).not.toContain(user.user._id.toString());
      expect(freshGroupB.members.map(String)).toContain(user.user._id.toString());
    });

    it('should reject assigning to non-existent group without altering user', async () => {
      const mongoose = require('mongoose');
      const fakeGroupId = new mongoose.Types.ObjectId();
      const user = await createTestUser({ name: 'Staff Unaltered' });

      const res = await request(app)
        .put(`/api/v1/users/${user.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ groupId: fakeGroupId.toString() });

      expect(res.status).toBe(404);
      const freshUser = await User.findById(user.user._id);
      expect(freshUser.groupId).toBeUndefined();
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
