const crypto = require('crypto');
const User = require('../../models/User');
const Group = require('../../models/Group');
const MembershipRecovery = require('../../models/MembershipRecovery');
const {
  assignUserToGroup,
  syncGroupMembers,
  removeUserFromGroup,
  processPendingRecoveries,
} = require('../../services/groupMembershipService');

describe('Group Membership Recovery & Operation Token Protection', () => {
  let groupA, groupB, groupC, testStaff;

  beforeEach(async () => {
    groupA = await Group.create({ name: `Group A ${Date.now()}` });
    groupB = await Group.create({ name: `Group B ${Date.now()}` });
    groupC = await Group.create({ name: `Group C ${Date.now()}` });

    testStaff = await User.create({
      name: 'Test Staff',
      initials: 'TS',
      role: 'staff',
      email: `staff_${Date.now()}_${Math.random()}@example.com`,
      phone: '9876543210',
      password: 'password123',
    });
  });

  // 1. Pending A -> B assignment followed by deliberate unassignment remains unassigned
  it('Pending A -> B assignment followed by deliberate unassignment remains unassigned', async () => {
    await assignUserToGroup(testStaff._id, groupA._id);
    const userInA = await User.findById(testStaff._id);
    expect(String(userInA.groupId)).toBe(String(groupA._id));

    const token1 = crypto.randomUUID();
    const pendingRecovery = await MembershipRecovery.create({
      operationType: 'assign',
      userId: testStaff._id,
      previousGroupId: groupA._id,
      targetGroupId: groupB._id,
      operationToken: token1,
      status: 'pending',
    });

    // Deliberate unassignment
    const unassignResult = await assignUserToGroup(testStaff._id, null);
    expect(unassignResult.success).toBe(true);

    const userAfterUnassign = await User.findById(testStaff._id);
    expect(userAfterUnassign.groupId).toBeNull();
    const token2 = userAfterUnassign.membershipOperationToken;
    expect(token2).toBeDefined();
    expect(token2).not.toBe(token1);

    const recoveryResult = await processPendingRecoveries();
    expect(recoveryResult.conflicts).toBe(1);

    // User must remain unassigned
    const userFinal = await User.findById(testStaff._id);
    expect(userFinal.groupId).toBeNull();
    expect(userFinal.membershipOperationToken).toBe(token2);

    const recFinal = await MembershipRecovery.findById(pendingRecovery._id);
    expect(recFinal.status).toBe('conflict');
    expect(recFinal.error).toMatch(/competing operation detected/i);

    const finalGroupB = await Group.findById(groupB._id);
    expect(finalGroupB.members.map(String)).not.toContain(String(testStaff._id));
  });

  // 2. Pending assignment followed by a move to C remains in C
  it('Pending assignment followed by a move to C remains in C', async () => {
    await assignUserToGroup(testStaff._id, groupA._id);

    const token1 = crypto.randomUUID();
    const pendingRecovery = await MembershipRecovery.create({
      operationType: 'assign',
      userId: testStaff._id,
      previousGroupId: groupA._id,
      targetGroupId: groupB._id,
      operationToken: token1,
      status: 'pending',
    });

    // Move to Group C
    await assignUserToGroup(testStaff._id, groupC._id);
    const userInC = await User.findById(testStaff._id);
    expect(String(userInC.groupId)).toBe(String(groupC._id));
    const tokenC = userInC.membershipOperationToken;

    const recoveryResult = await processPendingRecoveries();
    expect(recoveryResult.conflicts).toBe(1);

    // User must remain in Group C
    const userFinal = await User.findById(testStaff._id);
    expect(String(userFinal.groupId)).toBe(String(groupC._id));
    expect(userFinal.membershipOperationToken).toBe(tokenC);

    const recFinal = await MembershipRecovery.findById(pendingRecovery._id);
    expect(recFinal.status).toBe('conflict');
    expect(recFinal.error).toMatch(/competing operation detected/i);

    const finalGroupB = await Group.findById(groupB._id);
    const finalGroupC = await Group.findById(groupC._id);
    expect(finalGroupB.members.map(String)).not.toContain(String(testStaff._id));
    expect(finalGroupC.members.map(String)).toContain(String(testStaff._id));
  });

  // 3. Failed rollback cannot overwrite a newer successful move
  it('Failed rollback cannot overwrite a newer successful move', async () => {
    await assignUserToGroup(testStaff._id, groupA._id);

    const originalUpdateOne = Group.updateOne;
    let failureInjected = false;

    jest.spyOn(Group, 'updateOne').mockImplementation(async function(filter, update, opts) {
      if (!failureInjected && filter && String(filter._id) === String(groupB._id) && update && update.$addToSet) {
        failureInjected = true;
        await User.updateOne(
          { _id: testStaff._id },
          {
            $set: {
              groupId: groupC._id,
              membershipOperationToken: crypto.randomUUID(),
            },
            $inc: { membershipVersion: 1 },
          }
        );
        throw new Error('Simulated write failure to group B');
      }
      return originalUpdateOne.call(this, filter, update, opts);
    });

    await expect(assignUserToGroup(testStaff._id, groupB._id)).rejects.toThrow('Simulated write failure to group B');
    expect(failureInjected).toBe(true);

    const userFinal = await User.findById(testStaff._id);
    expect(String(userFinal.groupId)).toBe(String(groupC._id));

    const recoveryRec = await MembershipRecovery.findOne({
      userId: testStaff._id,
      targetGroupId: groupB._id,
    });
    expect(recoveryRec).not.toBeNull();
    expect(recoveryRec.status).toBe('conflict');
    expect(recoveryRec.error).toMatch(/competing operation detected/i);

    jest.restoreAllMocks();
  });

  // 4. Old bulk-edit recovery cannot restore members removed by a newer edit
  it('Old bulk-edit recovery cannot restore members removed by a newer edit', async () => {
    const staff2 = await User.create({
      name: 'Staff Two',
      initials: 'S2',
      role: 'staff',
      email: `staff2_${Date.now()}@example.com`,
      phone: '1234567890',
      password: 'password123',
    });

    await syncGroupMembers(groupA._id, [String(testStaff._id), String(staff2._id)]);
    const gBefore = await Group.findById(groupA._id);
    expect(gBefore.members.map(String)).toHaveLength(2);

    const oldToken = crypto.randomUUID();
    const oldRecovery = await MembershipRecovery.create({
      operationType: 'sync',
      groupId: groupA._id,
      operationToken: oldToken,
      expectedGroupVersion: gBefore.membershipVersion,
      snapshot: {
        groupId: String(groupA._id),
        oldMemberIds: [String(testStaff._id), String(staff2._id)],
        newMemberIds: [String(testStaff._id)],
        priorUserStates: [
          { userId: String(staff2._id), groupId: String(groupA._id), membershipVersion: 1 },
        ],
        operationToken: oldToken,
      },
      status: 'pending',
    });

    // Newer edit removes testStaff, leaving only staff2
    await syncGroupMembers(groupA._id, [String(staff2._id)]);
    const gAfterNewerEdit = await Group.findById(groupA._id);
    expect(gAfterNewerEdit.members.map(String)).toEqual([String(staff2._id)]);
    const newerToken = gAfterNewerEdit.membershipOperationToken;
    expect(newerToken).not.toBe(oldToken);

    const recResult = await processPendingRecoveries();
    expect(recResult.conflicts).toBe(1);

    const gFinal = await Group.findById(groupA._id);
    expect(gFinal.members.map(String)).toEqual([String(staff2._id)]);
    expect(gFinal.membershipOperationToken).toBe(newerToken);

    const oldRecFinal = await MembershipRecovery.findById(oldRecovery._id);
    expect(oldRecFinal.status).toBe('conflict');
  });

  // 5. Repeated recovery is idempotent
  it('Repeated recovery is idempotent', async () => {
    const token = crypto.randomUUID();
    testStaff.membershipOperationToken = token;
    testStaff.groupId = groupA._id;
    await testStaff.save();

    const pendingRec = await MembershipRecovery.create({
      operationType: 'assign',
      userId: testStaff._id,
      targetGroupId: groupA._id,
      operationToken: token,
      status: 'pending',
    });

    const res1 = await processPendingRecoveries('run-1');
    expect(res1.processed).toBe(1);
    expect(res1.conflicts).toBe(0);

    const recAfterRun1 = await MembershipRecovery.findById(pendingRec._id);
    expect(recAfterRun1.status).toBe('completed');

    const res2 = await processPendingRecoveries('run-2');
    expect(res2.processed).toBe(0);
    expect(res2.conflicts).toBe(0);

    const recAfterRun2 = await MembershipRecovery.findById(pendingRec._id);
    expect(recAfterRun2.status).toBe('completed');
  });

  // 6. Recovery racing with a live request preserves the newer valid result
  it('Recovery racing with a live request preserves the newer valid result', async () => {
    const oldToken = crypto.randomUUID();
    testStaff.membershipOperationToken = oldToken;
    testStaff.groupId = groupA._id;
    await testStaff.save();

    const pendingRecovery = await MembershipRecovery.create({
      operationType: 'assign',
      userId: testStaff._id,
      previousGroupId: groupA._id,
      targetGroupId: groupB._id,
      operationToken: oldToken,
      status: 'pending',
    });

    const originalUserUpdateOne = User.updateOne;
    let raceSimulated = false;

    jest.spyOn(User, 'updateOne').mockImplementation(async function(filter, update, opts) {
      if (!raceSimulated && filter && filter.membershipOperationToken === oldToken) {
        raceSimulated = true;
        const liveToken = crypto.randomUUID();
        await User.collection.updateOne(
          { _id: testStaff._id },
          {
            $set: {
              groupId: groupC._id,
              membershipOperationToken: liveToken,
              membershipVersion: 99,
            },
          }
        );
      }
      return originalUserUpdateOne.call(this, filter, update, opts);
    });

    const res = await processPendingRecoveries('racer');
    expect(raceSimulated).toBe(true);
    expect(res.conflicts).toBe(1);

    const userFinal = await User.findById(testStaff._id);
    expect(String(userFinal.groupId)).toBe(String(groupC._id));

    const recFinal = await MembershipRecovery.findById(pendingRecovery._id);
    expect(recFinal.status).toBe('conflict');

    jest.restoreAllMocks();
  });

  // 7. Two processors cannot recover the same operation simultaneously
  it('Two processors cannot recover the same operation simultaneously', async () => {
    const token = crypto.randomUUID();
    testStaff.membershipOperationToken = token;
    testStaff.groupId = groupA._id;
    await testStaff.save();

    const pendingRec = await MembershipRecovery.create({
      operationType: 'assign',
      userId: testStaff._id,
      targetGroupId: groupA._id,
      operationToken: token,
      status: 'pending',
    });

    const [worker1Result, worker2Result] = await Promise.all([
      processPendingRecoveries('worker-1'),
      processPendingRecoveries('worker-2'),
    ]);

    const totalProcessed = worker1Result.processed + worker2Result.processed;
    expect(totalProcessed).toBe(1);

    const recFinal = await MembershipRecovery.findById(pendingRec._id);
    expect(recFinal.status).toBe('completed');
    expect(['worker-1', 'worker-2']).toContain(recFinal.lockedBy);
  });

  // 8. Abandoned 'processing' record is reclaimed after lease timeout
  it('Abandoned processing record is reclaimed after lease timeout', async () => {
    const token = crypto.randomUUID();
    testStaff.membershipOperationToken = token;
    testStaff.groupId = groupA._id;
    await testStaff.save();

    // Create a record that was locked 10 minutes ago by a crashed worker
    const abandonedRec = await MembershipRecovery.create({
      operationType: 'assign',
      userId: testStaff._id,
      targetGroupId: groupA._id,
      operationToken: token,
      status: 'processing',
      lockedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago (> 5m lease)
      lockedBy: 'crashed-worker-99',
    });

    const res = await processPendingRecoveries('reclaimer-worker');
    expect(res.processed).toBe(1);

    const recFinal = await MembershipRecovery.findById(abandonedRec._id);
    expect(recFinal.status).toBe('completed');
    expect(recFinal.lockedBy).toBe('reclaimer-worker');
  });

  // 9. Group deletion updates membership tokens; an older recovery cannot reassign deliberately unassigned user
  it('Group deletion updates membership tokens so older recovery cannot reassign member', async () => {
    const token = crypto.randomUUID();
    testStaff.membershipOperationToken = token;
    testStaff.groupId = groupA._id;
    await testStaff.save();

    // Group A has testStaff as member
    groupA.members = [testStaff._id];
    await groupA.save();

    // Pending recovery created before group deletion
    const pendingRec = await MembershipRecovery.create({
      operationType: 'assign',
      userId: testStaff._id,
      targetGroupId: groupA._id,
      operationToken: token,
      status: 'pending',
    });

    // Delete group A using deleteGroupWithMembership
    const { deleteGroupWithMembership } = require('../../services/groupMembershipService');
    await deleteGroupWithMembership(groupA._id);

    const userAfterDelete = await User.findById(testStaff._id);
    expect(userAfterDelete.groupId).toBeNull();
    expect(userAfterDelete.membershipOperationToken).not.toBe(token);

    // Now run recovery on the older pending record
    const res = await processPendingRecoveries('post-delete-recovery');
    expect(res.conflicts).toBe(1);

    const userFinal = await User.findById(testStaff._id);
    expect(userFinal.groupId).toBeNull(); // Still deliberately unassigned!
  });

  // 10. Overlapping moves cannot leave staff member in multiple groups
  it('Overlapping moves cannot leave staff member in multiple groups', async () => {
    // Op 1 moves to B, Op 2 moves to C
    const res1 = await assignUserToGroup(testStaff._id, groupB._id);
    expect(res1.success).toBe(true);

    const res2 = await assignUserToGroup(testStaff._id, groupC._id);
    expect(res2.success).toBe(true);

    const userFinal = await User.findById(testStaff._id);
    expect(String(userFinal.groupId)).toBe(String(groupC._id));

    const gB = await Group.findById(groupB._id);
    const gC = await Group.findById(groupC._id);

    // Group B must NOT list the staff member
    expect(gB.members.map(String)).not.toContain(String(testStaff._id));
    // Group C MUST list the staff member
    expect(gC.members.map(String)).toContain(String(testStaff._id));
  });
});

