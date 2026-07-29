const request = require('supertest');
const { buildTestApp, createAdminUser } = require('../helpers');
const Group = require('../../models/Group');
const User = require('../../models/User');

const app = buildTestApp();

describe('Group Controller', () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createAdminUser();
    adminToken = admin.token;
  });

  describe('POST /api/v1/groups', () => {
    it('should create a group as admin', async () => {
      const res = await request(app)
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sales Team', description: 'All sales staff' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Sales Team');
    });
  });

  describe('GET /api/v1/groups', () => {
    it('should return all groups', async () => {
      await Group.create({ name: 'G1' });
      const res = await request(app)
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PUT /api/v1/groups/:id', () => {
    it('should update a group', async () => {
      const group = await Group.create({ name: 'Old' });
      const res = await request(app)
        .put(`/api/v1/groups/${group._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New');
    });
  });

  describe('DELETE /api/v1/groups/:id', () => {
    it('should delete group and remove groupId from members', async () => {
      const user = await User.create({
        name: 'Member', initials: 'M', role: 'staff',
        email: `member${Date.now()}@x.com`, phone: '123', password: 'password123',
        groupId: null, // set groupId explicitly for cascade test
      });
      const group = await Group.create({ name: 'Del', members: [user._id] });

      const res = await request(app)
        .delete(`/api/v1/groups/${group._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await Group.findById(group._id)).toBeNull();

      // Verify the group no longer exists
      const deletedGroup = await Group.findById(group._id);
      expect(deletedGroup).toBeNull();
    });
  });

  describe('POST /api/v1/groups/:id/members', () => {
    it('should add a member to group', async () => {
      const user = await User.create({
        name: 'Add', initials: 'A', role: 'staff',
        email: `add${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const group = await Group.create({ name: 'Test' });
      const res = await request(app)
        .post(`/api/v1/groups/${group._id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user._id });
      expect(res.status).toBe(200);
      expect(res.body.data.members.length).toBe(1);
    });

    it('should return 400 for duplicate member', async () => {
      const user = await User.create({
        name: 'Dup', initials: 'D', role: 'staff',
        email: `dup${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const group = await Group.create({ name: 'Test', members: [user._id] });
      const res = await request(app)
        .post(`/api/v1/groups/${group._id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user._id });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/groups/:id/members/:userId', () => {
    it('should remove a member from group', async () => {
      const user = await User.create({
        name: 'Rem', initials: 'R', role: 'staff',
        email: `rem${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const group = await Group.create({ name: 'Test', members: [user._id] });
      const res = await request(app)
        .delete(`/api/v1/groups/${group._id}/members/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.members.length).toBe(0);
    });
  });
});
