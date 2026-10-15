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

    it('should create group with initial members and synchronize user groupIds', async () => {
      const user1 = await User.create({
        name: 'InitialStaff1', initials: 'I1', role: 'staff',
        email: `is1_${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const user2 = await User.create({
        name: 'InitialStaff2', initials: 'I2', role: 'staff',
        email: `is2_${Date.now()}@x.com`, phone: '123', password: 'password123',
      });

      const res = await request(app)
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Initial Group ${Date.now()}`,
          description: 'Group with initial members',
          members: [String(user1._id), String(user2._id)],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.members.length).toBe(2);

      const createdGroupId = res.body.data._id || res.body.data.id;
      const refreshedU1 = await User.findById(user1._id);
      const refreshedU2 = await User.findById(user2._id);
      expect(String(refreshedU1.groupId)).toBe(String(createdGroupId));
      expect(String(refreshedU2.groupId)).toBe(String(createdGroupId));
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

    it('should handle exact payload produced by assignment dialog { expectedCurrentGroupId: null }', async () => {
      const user = await User.create({
        name: 'DialogUser', initials: 'DU', role: 'staff',
        email: `dialog${Date.now()}@x.com`, phone: '123', password: 'password123',
        groupId: null,
      });
      const group = await Group.create({ name: 'DialogGroup' });

      // Exact payload from assignment dialog:
      const res = await request(app)
        .post(`/api/v1/groups/${group._id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: user._id,
          expectedCurrentGroupId: { expectedCurrentGroupId: null },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const refreshedUser = await User.findById(user._id);
      expect(String(refreshedUser.groupId)).toBe(String(group._id));
    });

    it('should handle expectedCurrentGroupId passed as string or null', async () => {
      const oldGroup = await Group.create({ name: 'OldG' });
      const newGroup = await Group.create({ name: 'NewG' });
      const user = await User.create({
        name: 'MoveUser', initials: 'MU', role: 'staff',
        email: `move${Date.now()}@x.com`, phone: '123', password: 'password123',
        groupId: oldGroup._id,
      });
      oldGroup.members.push(user._id);
      await oldGroup.save();

      const res = await request(app)
        .post(`/api/v1/groups/${newGroup._id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: user._id,
          expectedCurrentGroupId: String(oldGroup._id),
        });

      expect(res.status).toBe(200);

      const refreshedUser = await User.findById(user._id);
      expect(String(refreshedUser.groupId)).toBe(String(newGroup._id));

      const refreshedOld = await Group.findById(oldGroup._id);
      expect(refreshedOld.members.map(String)).not.toContain(String(user._id));
    });

    it('should return 400 on malformed input (non-ObjectId strings)', async () => {
      const group = await Group.create({ name: 'ValGroup' });
      const res1 = await request(app)
        .post(`/api/v1/groups/${group._id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 'not-an-object-id' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post(`/api/v1/groups/invalid-group-id/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: '507f1f77bcf86cd799439011' });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .post(`/api/v1/groups/${group._id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: '507f1f77bcf86cd799439011',
          expectedCurrentGroupId: 'malformed-expected-id',
        });
      expect(res3.status).toBe(400);
    });
  });

  describe('Group editing and failure-safe member sync (PUT /api/v1/groups/:id)', () => {
    it('should synchronize members and user groupIds when editing a group', async () => {
      const user1 = await User.create({
        name: 'EditStaff1', initials: 'S1', role: 'staff',
        email: `s1_${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const user2 = await User.create({
        name: 'EditStaff2', initials: 'S2', role: 'staff',
        email: `s2_${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const groupA = await Group.create({ name: 'GroupA', members: [user1._id] });
      user1.groupId = groupA._id;
      await user1.save();

      const groupB = await Group.create({ name: 'GroupB' });

      // Move user1 to groupB and add user2 to groupB via group edit:
      const res = await request(app)
        .put(`/api/v1/groups/${groupB._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'GroupB Updated',
          members: [String(user1._id), String(user2._id)],
        });

      expect(res.status).toBe(200);

      const refreshedU1 = await User.findById(user1._id);
      const refreshedU2 = await User.findById(user2._id);
      expect(String(refreshedU1.groupId)).toBe(String(groupB._id));
      expect(String(refreshedU2.groupId)).toBe(String(groupB._id));

      const refreshedGA = await Group.findById(groupA._id);
      expect(refreshedGA.members.map(String)).not.toContain(String(user1._id));
    });

    it('should reject non-staff users in group members edit with 400', async () => {
      const partner = await User.create({
        name: 'Partner', initials: 'P', role: 'partner',
        email: `p_${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const group = await Group.create({ name: 'GroupStaffOnly' });

      const res = await request(app)
        .put(`/api/v1/groups/${group._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          members: [String(partner._id)],
        });

      expect(res.status).toBe(400);
      expect(res.body.error || res.body.message).toMatch(/not a staff member/i);
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

  describe('Membership rollback & compensation consistency', () => {
    it('should restore user to previous group members and restore groupId when target assignment fails', async () => {
      const { assignUserToGroup } = require('../../services/groupMembershipService');
      const MembershipRecovery = require('../../models/MembershipRecovery');

      const user = await User.create({
        name: 'CompensateStaff', initials: 'CS', role: 'staff',
        email: `cs_${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const groupPrev = await Group.create({ name: 'PreviousGroup', members: [user._id] });
      user.groupId = groupPrev._id;
      await user.save();

      const groupTarget = await Group.create({ name: 'TargetGroup' });

      // Mock Group.updateOne to simulate failure on target group update
      const originalUpdateOne = Group.updateOne;
      let failureTriggered = false;

      jest.spyOn(Group, 'updateOne').mockImplementation(async function(filter, update, opts) {
        if (!failureTriggered && filter && String(filter._id) === String(groupTarget._id) && update && update.$addToSet) {
          failureTriggered = true;
          throw new Error('Simulated target group write failure');
        }
        return originalUpdateOne.call(this, filter, update, opts);
      });

      await expect(assignUserToGroup(user._id, groupTarget._id)).rejects.toThrow('Simulated target group write failure');
      expect(failureTriggered).toBe(true);

      // Verify compensation restored user groupId and previous group members
      const refreshedUser = await User.findById(user._id);
      const refreshedPrevGroup = await Group.findById(groupPrev._id);
      const refreshedTargetGroup = await Group.findById(groupTarget._id);

      expect(String(refreshedUser.groupId)).toBe(String(groupPrev._id));
      expect(refreshedPrevGroup.members.map(String)).toContain(String(user._id));
      expect(refreshedTargetGroup.members.map(String)).not.toContain(String(user._id));

      // Verify recovery journal was recorded
      const recoveryRecord = await MembershipRecovery.findOne({
        userId: user._id,
        targetGroupId: groupTarget._id,
      });
      expect(recoveryRecord).not.toBeNull();
      expect(recoveryRecord.status).toMatch(/failed|compensated|rolled_back/i);

      jest.restoreAllMocks();
    });

    it('should restore removed users groupId when bulk sync group fails', async () => {
      const { syncGroupMembers } = require('../../services/groupMembershipService');
      const user = await User.create({
        name: 'BulkStaff', initials: 'BS', role: 'staff',
        email: `bs_${Date.now()}@x.com`, phone: '123', password: 'password123',
      });
      const group = await Group.create({ name: 'BulkGroup', members: [user._id] });
      user.groupId = group._id;
      await user.save();

      // Mock Group.prototype.save to fail when saving the updated group
      const originalSave = Group.prototype.save;
      let failureTriggered = false;
      jest.spyOn(Group.prototype, 'save').mockImplementation(async function() {
        if (!failureTriggered && String(this._id) === String(group._id)) {
          failureTriggered = true;
          throw new Error('Simulated group document write failure');
        }
        return originalSave.call(this);
      });

      // Attempt to sync group with empty members (removing user)
      await expect(syncGroupMembers(group._id, [])).rejects.toThrow('Simulated group document write failure');
      expect(failureTriggered).toBe(true);

      // Verify user's groupId was rolled back to group._id rather than staying null
      const refreshedUser = await User.findById(user._id);
      expect(String(refreshedUser.groupId)).toBe(String(group._id));

      const refreshedGroup = await Group.findById(group._id);
      expect(refreshedGroup.members.map(String)).toContain(String(user._id));

      jest.restoreAllMocks();
    });

    it('should handle restart recovery idempotently for pending operations and detect competing moves', async () => {
      const { processPendingRecoveries } = require('../../services/groupMembershipService');
      const MembershipRecovery = require('../../models/MembershipRecovery');
      const crypto = require('crypto');

      // 1. Pending assign with valid operation token that needs completion
      const token1 = crypto.randomUUID();
      const user1 = await User.create({
        name: 'PendingStaff1', initials: 'P1', role: 'staff',
        email: `p1_${Date.now()}@x.com`, phone: '123', password: 'password123',
        membershipOperationToken: token1,
      });
      const targetGroup1 = await Group.create({ name: 'TargetG1' });
      user1.groupId = targetGroup1._id; // User already assigned
      await user1.save();

      const pendingAssign = await MembershipRecovery.create({
        operationType: 'assign',
        userId: user1._id,
        targetGroupId: targetGroup1._id,
        operationToken: token1,
        status: 'pending',
      });

      // 2. Pending assign that encounters a competing move (token mismatch)
      const token2 = crypto.randomUUID();
      const token3 = crypto.randomUUID();
      const user2 = await User.create({
        name: 'PendingStaff2', initials: 'P2', role: 'staff',
        email: `p2_${Date.now()}@x.com`, phone: '123', password: 'password123',
        membershipOperationToken: token3, // moved to C with token3
      });
      const groupA = await Group.create({ name: 'GroupA' });
      const groupB = await Group.create({ name: 'GroupB' });
      const groupC = await Group.create({ name: 'GroupC' });

      user2.groupId = groupC._id;
      await user2.save();

      const conflictingRecovery = await MembershipRecovery.create({
        operationType: 'assign',
        userId: user2._id,
        previousGroupId: groupA._id,
        targetGroupId: groupB._id,
        operationToken: token2, // older operation token
        status: 'pending',
      });

      // 3. Pending assign without operation token (legacy/unreliable evidence) -> conflict
      const legacyRecovery = await MembershipRecovery.create({
        operationType: 'assign',
        userId: user1._id,
        targetGroupId: targetGroup1._id,
        status: 'pending',
      });

      const result = await processPendingRecoveries();
      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.conflicts).toBeGreaterThanOrEqual(2);

      // Verify user1's recovery completed and user is in targetGroup1.members
      const rec1 = await MembershipRecovery.findById(pendingAssign._id);
      expect(rec1.status).toBe('completed');
      const refreshedG1 = await Group.findById(targetGroup1._id);
      expect(refreshedG1.members.map(String)).toContain(String(user1._id));

      // Verify user2's recovery marked as conflict and user2 is still in groupC
      const rec2 = await MembershipRecovery.findById(conflictingRecovery._id);
      expect(rec2.status).toBe('conflict');
      expect(rec2.error).toMatch(/competing operation detected/i);
      const refreshedU2 = await User.findById(user2._id);
      expect(String(refreshedU2.groupId)).toBe(String(groupC._id));

      // Verify legacy recovery without token marked as conflict
      const rec3 = await MembershipRecovery.findById(legacyRecovery._id);
      expect(rec3.status).toBe('conflict');
      expect(rec3.error).toMatch(/Missing operation token evidence/i);
    });
  });
});
