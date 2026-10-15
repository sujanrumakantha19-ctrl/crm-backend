const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const MembershipRecovery = require('../models/MembershipRecovery');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Safely unwrap and normalize expectedCurrentGroupId.
 * Treat omitted options or empty options objects as unconstrained (undefined).
 * Keep null as "expected to be unassigned".
 */
function normalizeExpectedGroupId(input) {
  if (input === undefined) return undefined;
  if (input === null || input === 'none' || input === '') return null;
  if (typeof input === 'object') {
    if ('expectedCurrentGroupId' in input) {
      return normalizeExpectedGroupId(input.expectedCurrentGroupId);
    }
    // Any object without expectedCurrentGroupId (e.g. {}) means unconstrained
    return undefined;
  }
  return String(input);
}

/**
 * Assign a staff user to a group atomically with concurrency checks and role validation.
 * 
 * @param {string} userId - ID of staff user
 * @param {string|null} targetGroupId - ID of target group, or null to remove from group
 * @param {object|string|null} options - { expectedCurrentGroupId } or raw expected group ID
 */
async function assignUserToGroup(userId, targetGroupId, options = {}) {
  const expectedCurrentGroupId = normalizeExpectedGroupId(options);

  // Validate userId
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    throw new ErrorResponse('Please provide a valid userId', 400);
  }

  // Normalize and validate targetGroupId
  const normTargetGroupId = (targetGroupId === 'none' || targetGroupId === '' || targetGroupId === undefined) ? null : targetGroupId;
  if (normTargetGroupId && !mongoose.Types.ObjectId.isValid(String(normTargetGroupId))) {
    throw new ErrorResponse('Invalid target group ID format', 400);
  }

  // Validate expectedCurrentGroupId if provided
  if (expectedCurrentGroupId !== undefined && expectedCurrentGroupId !== null) {
    if (!mongoose.Types.ObjectId.isValid(String(expectedCurrentGroupId))) {
      throw new ErrorResponse('Invalid expected current group ID format', 400);
    }
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorResponse(`User not found with id of ${userId}`, 404);
  }

  // Validate eligible staff role
  if (user.role !== 'staff') {
    throw new ErrorResponse('Only staff members can be assigned to sales groups', 400);
  }

  let targetGroup = null;
  if (normTargetGroupId) {
    targetGroup = await Group.findById(normTargetGroupId);
    if (!targetGroup) {
      throw new ErrorResponse(`Target group not found with id of ${normTargetGroupId}`, 404);
    }
  }

  const previousGroupId = user.groupId ? String(user.groupId) : null;
  const targetGroupIdStr = targetGroup ? String(targetGroup._id) : null;

  // Idempotent reconciliation: already recorded in target group on User model
  if (previousGroupId === targetGroupIdStr) {
    if (targetGroup) {
      // Reconcile: remove user from any other groups they might still be lingering in
      await Group.updateMany(
        { _id: { $ne: targetGroup._id }, members: userId },
        { $pull: { members: userId } }
      );
      await Group.updateOne(
        { _id: targetGroup._id },
        { $addToSet: { members: userId } }
      );
    } else {
      // Target is null (unassigned): remove from all groups
      await Group.updateMany(
        { members: userId },
        { $pull: { members: userId } }
      );
    }
    return {
      success: true,
      user: await User.findById(userId).select('-password'),
      group: targetGroup ? await Group.findById(targetGroup._id).populate('members', 'name initials role displayId') : null,
    };
  }

  const operationToken = crypto.randomUUID();
  const expectedUserVersion = user.membershipVersion || 0;

  // Record persistent recovery entry before executing changes
  const recovery = await MembershipRecovery.create({
    operationType: 'assign',
    userId,
    targetGroupId: targetGroup ? targetGroup._id : null,
    previousGroupId: previousGroupId ? new mongoose.Types.ObjectId(previousGroupId) : null,
    operationToken,
    expectedUserVersions: [{
      userId: String(userId),
      expectedVersion: expectedUserVersion,
      operationToken,
    }],
    snapshot: {
      userId: String(userId),
      previousGroupId,
      targetGroupId: targetGroupIdStr,
      operationToken,
    },
    status: 'pending',
  });

  const updateDoc = {
    $set: {
      groupId: targetGroup ? targetGroup._id : null,
      membershipOperationToken: operationToken,
    },
    $inc: { membershipVersion: 1 },
  };

  // Step 1: Atomic write predicate with concurrency check
  let updatedUser = null;
  if (expectedCurrentGroupId !== undefined) {
    const isExpectedUnassigned = expectedCurrentGroupId === null;
    const expectedCond = isExpectedUnassigned
      ? { $in: [null, undefined] }
      : new mongoose.Types.ObjectId(String(expectedCurrentGroupId));

    updatedUser = await User.findOneAndUpdate(
      { _id: userId, groupId: expectedCond },
      updateDoc,
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      await MembershipRecovery.updateOne({ _id: recovery._id }, { $set: { status: 'failed', error: 'concurrency_conflict' } });
      const latestUser = await User.findById(userId).populate('groupId', 'name');
      const latestGroupName = latestUser && latestUser.groupId ? latestUser.groupId.name : 'Unassigned';
      throw new ErrorResponse(
        `Staff group membership has changed concurrently (currently in ${latestGroupName}). Please refresh.`,
        409
      );
    }
  } else {
    updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      updateDoc,
      { returnDocument: 'after' }
    );
  }

  // Step 2: Synchronize Group documents with operation-token-checked compensation recovery
  try {
    // Check if the user is still owned by this operation token before modifying groups
    const userStillOwned = await User.findOne({ _id: userId, membershipOperationToken: operationToken });
    if (!userStillOwned) {
      await MembershipRecovery.updateOne(
        { _id: recovery._id },
        { $set: { status: 'conflict', error: 'User membership token was superseded by a newer operation before group sync' } }
      );
      if (targetGroup) {
        await Group.updateOne({ _id: targetGroup._id }, { $pull: { members: userId } });
      }
      return {
        success: true,
        user: await User.findById(userId).select('-password'),
        group: targetGroup ? await Group.findById(targetGroup._id).populate('members', 'name initials role displayId') : null,
      };
    }

    if (targetGroup) {
      // Remove from all other groups
      await Group.updateMany(
        { _id: { $ne: targetGroup._id }, members: userId },
        { $pull: { members: userId } }
      );
      // Add to target group
      await Group.updateOne(
        { _id: targetGroup._id },
        { $addToSet: { members: userId } }
      );

      // Verify again: if superseded during the write, remove user from targetGroup
      const verifyStillOwned = await User.findOne({ _id: userId, membershipOperationToken: operationToken });
      if (!verifyStillOwned) {
        await Group.updateOne(
          { _id: targetGroup._id },
          { $pull: { members: userId } }
        );
        await MembershipRecovery.updateOne(
          { _id: recovery._id },
          { $set: { status: 'conflict', error: 'User membership token was superseded during group sync' } }
        );
        return {
          success: true,
          user: await User.findById(userId).select('-password'),
          group: targetGroup ? await Group.findById(targetGroup._id).populate('members', 'name initials role displayId') : null,
        };
      }

      // Secondary sweep to ensure no overlapping concurrent move left the user in another group
      await Group.updateMany(
        { _id: { $ne: targetGroup._id }, members: userId },
        { $pull: { members: userId } }
      );
    } else {
      // Removal from all groups
      await Group.updateMany(
        { members: userId },
        { $pull: { members: userId } }
      );
    }
    await MembershipRecovery.updateOne({ _id: recovery._id }, { $set: { status: 'completed' } });
  } catch (syncError) {
    // Operation-token-checked user rollback:
    // Only roll back if the user's operation token still matches this operation.
    // If a newer operation occurred (move to C, deliberate unassignment to null with a new token),
    // matchedCount will be 0 and the user must NOT be overwritten!
    const rollbackToken = crypto.randomUUID();
    const rollbackRes = await User.updateOne(
      { _id: userId, membershipOperationToken: operationToken },
      {
        $set: {
          groupId: previousGroupId ? new mongoose.Types.ObjectId(previousGroupId) : null,
          membershipOperationToken: rollbackToken,
        },
        $inc: { membershipVersion: 1 },
      }
    );

    if (rollbackRes.matchedCount > 0) {
      // User was successfully reverted: restore group documents
      if (previousGroupId) {
        await Group.updateOne(
          { _id: previousGroupId },
          { $addToSet: { members: userId } }
        );
      }
      if (targetGroup) {
        await Group.updateOne(
          { _id: targetGroup._id },
          { $pull: { members: userId } }
        );
      }
      await MembershipRecovery.updateOne(
        { _id: recovery._id },
        { $set: { status: 'rolled_back', error: syncError.message } }
      );
    } else {
      // Competing newer move or unassignment occurred: leave user & groups untouched!
      await MembershipRecovery.updateOne(
        { _id: recovery._id },
        {
          $set: {
            status: 'conflict',
            error: `Competing operation detected during rollback; user left untouched. Original error: ${syncError.message}`,
          },
        }
      );
    }
    throw syncError;
  }

  return {
    success: true,
    user: await User.findById(userId).select('-password'),
    group: targetGroup ? await Group.findById(targetGroup._id).populate('members', 'name initials role displayId') : null,
  };
}

/**
 * Synchronize group members during group editing or creation.
 * Failure-safe and role-checked.
 * 
 * @param {string} groupId - ID of group
 * @param {string[]} memberIds - Array of user IDs
 */
async function syncGroupMembers(groupId, memberIds) {
  if (!groupId || !mongoose.Types.ObjectId.isValid(String(groupId))) {
    throw new ErrorResponse('Invalid group ID format', 400);
  }

  const group = await Group.findById(groupId);
  if (!group) {
    throw new ErrorResponse(`Group not found with id of ${groupId}`, 404);
  }

  if (!Array.isArray(memberIds)) {
    throw new ErrorResponse('Members must be an array of user IDs', 400);
  }

  // Validate each ID
  for (const mId of memberIds) {
    if (!mId || !mongoose.Types.ObjectId.isValid(String(mId))) {
      throw new ErrorResponse(`Invalid member user ID format: ${mId}`, 400);
    }
  }

  const stringMemberIds = memberIds.map(String);

  // Validate all members exist and have role === 'staff'
  const memberUsers = await User.find({ _id: { $in: stringMemberIds } });
  if (memberUsers.length !== stringMemberIds.length) {
    throw new ErrorResponse('One or more member users could not be found', 404);
  }

  const nonStaff = memberUsers.find(u => u.role !== 'staff');
  if (nonStaff) {
    throw new ErrorResponse(`User ${nonStaff.name} is not a staff member and cannot be added to a sales group`, 400);
  }

  const oldMemberIds = (group.members || []).map(String);
  const added = stringMemberIds.filter(id => !oldMemberIds.includes(id));
  const removed = oldMemberIds.filter(id => !stringMemberIds.includes(id));

  // Snapshot prior user states for added and removed members
  const priorUserStates = await User.find({ _id: { $in: [...added, ...removed] } }).select('_id groupId membershipVersion');

  const operationToken = crypto.randomUUID();
  const expectedGroupVersion = group.membershipVersion || 0;

  const recovery = await MembershipRecovery.create({
    operationType: 'sync',
    groupId: group._id,
    operationToken,
    expectedGroupVersion,
    expectedUserVersions: priorUserStates.map(u => ({
      userId: String(u._id),
      expectedVersion: u.membershipVersion || 0,
      operationToken,
    })),
    snapshot: {
      groupId: String(group._id),
      oldMemberIds,
      newMemberIds: stringMemberIds,
      priorUserStates: priorUserStates.map(u => ({
        userId: String(u._id),
        groupId: u.groupId ? String(u.groupId) : null,
        membershipVersion: u.membershipVersion || 0,
      })),
      operationToken,
    },
    status: 'pending',
  });

  try {
    if (added.length > 0) {
      // Remove added users from any other groups
      await Group.updateMany(
        { _id: { $ne: group._id }, members: { $in: added } },
        { $pull: { members: { $in: added } } }
      );
      // Assign added users to this group with operation token
      await User.updateMany(
        { _id: { $in: added } },
        {
          $set: { groupId: group._id, membershipOperationToken: operationToken },
          $inc: { membershipVersion: 1 },
        }
      );
    }

    if (removed.length > 0) {
      // Remove group from removed users with operation token
      await User.updateMany(
        { _id: { $in: removed }, groupId: group._id },
        {
          $set: { groupId: null, membershipOperationToken: operationToken },
          $inc: { membershipVersion: 1 },
        }
      );
    }

    // Update group's members array with operation token and version increment
    group.members = stringMemberIds;
    group.membershipOperationToken = operationToken;
    group.membershipVersion = expectedGroupVersion + 1;
    await group.save();

    await MembershipRecovery.updateOne({ _id: recovery._id }, { $set: { status: 'completed' } });
    return group;
  } catch (err) {
    // Operation-token-checked compensation:
    // 1. Roll back each user ONLY if their membershipOperationToken still matches this operation
    for (const snap of priorUserStates) {
      const snapUserId = snap._id || snap.userId;
      const snapPrevGroupId = snap.groupId ? String(snap.groupId) : null;
      const wasAdded = added.includes(String(snapUserId));
      const wasRemoved = removed.includes(String(snapUserId));
      const rollbackToken = crypto.randomUUID();

      if (wasAdded) {
        const uRes = await User.updateOne(
          { _id: snapUserId, membershipOperationToken: operationToken },
          {
            $set: {
              groupId: snapPrevGroupId ? new mongoose.Types.ObjectId(snapPrevGroupId) : null,
              membershipOperationToken: rollbackToken,
            },
            $inc: { membershipVersion: 1 },
          }
        );
        if (uRes.matchedCount > 0 && snapPrevGroupId && snapPrevGroupId !== String(group._id)) {
          await Group.updateOne(
            { _id: snapPrevGroupId },
            { $addToSet: { members: snapUserId } }
          );
        }
      } else if (wasRemoved) {
        await User.updateOne(
          { _id: snapUserId, membershipOperationToken: operationToken },
          {
            $set: {
              groupId: group._id,
              membershipOperationToken: rollbackToken,
            },
            $inc: { membershipVersion: 1 },
          }
        );
      }
    }

    // 2. Roll back group document ONLY if group was not modified by a newer operation
    await Group.updateOne(
      { _id: group._id, membershipOperationToken: operationToken },
      {
        $set: {
          members: oldMemberIds,
          membershipOperationToken: crypto.randomUUID(),
        },
        $inc: { membershipVersion: 1 },
      }
    );

    await MembershipRecovery.updateOne(
      { _id: recovery._id },
      { $set: { status: 'rolled_back', error: err.message } }
    );
    throw err;
  }
}

/**
 * Remove a user from a specific group or all groups failure-safely.
 */
async function removeUserFromGroup(userId, groupId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    throw new ErrorResponse('Please provide a valid userId', 400);
  }

  if (groupId && !mongoose.Types.ObjectId.isValid(String(groupId))) {
    throw new ErrorResponse('Invalid group ID format', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorResponse(`User not found with id of ${userId}`, 404);
  }

  const previousGroupId = user.groupId ? String(user.groupId) : null;
  const operationToken = crypto.randomUUID();
  const expectedUserVersion = user.membershipVersion || 0;

  const recovery = await MembershipRecovery.create({
    operationType: 'remove',
    userId,
    groupId: groupId ? new mongoose.Types.ObjectId(groupId) : (previousGroupId ? new mongoose.Types.ObjectId(previousGroupId) : null),
    previousGroupId: previousGroupId ? new mongoose.Types.ObjectId(previousGroupId) : null,
    operationToken,
    expectedUserVersions: [{
      userId: String(userId),
      expectedVersion: expectedUserVersion,
      operationToken,
    }],
    snapshot: {
      userId,
      previousGroupId,
      groupId,
      operationToken,
    },
    status: 'pending',
  });

  try {
    if (groupId) {
      await Group.updateOne(
        { _id: groupId },
        { $pull: { members: userId } }
      );
      await User.updateOne(
        { _id: userId, groupId: groupId },
        {
          $set: { groupId: null, membershipOperationToken: operationToken },
          $inc: { membershipVersion: 1 },
        }
      );
    } else {
      await Group.updateMany(
        { members: userId },
        { $pull: { members: userId } }
      );
      await User.updateOne(
        { _id: userId },
        {
          $set: { groupId: null, membershipOperationToken: operationToken },
          $inc: { membershipVersion: 1 },
        }
      );
    }
    await MembershipRecovery.updateOne({ _id: recovery._id }, { $set: { status: 'completed' } });
  } catch (err) {
    // Operation-token-checked recovery
    const rollbackToken = crypto.randomUUID();
    const uRes = await User.updateOne(
      { _id: userId, membershipOperationToken: operationToken },
      {
        $set: {
          groupId: previousGroupId ? new mongoose.Types.ObjectId(previousGroupId) : null,
          membershipOperationToken: rollbackToken,
        },
        $inc: { membershipVersion: 1 },
      }
    );

    if (uRes.matchedCount > 0 && previousGroupId) {
      await Group.updateOne({ _id: previousGroupId }, { $addToSet: { members: userId } });
      await MembershipRecovery.updateOne(
        { _id: recovery._id },
        { $set: { status: 'rolled_back', error: err.message } }
      );
    } else {
      await MembershipRecovery.updateOne(
        { _id: recovery._id },
        { $set: { status: 'conflict', error: `Competing operation detected during remove rollback: ${err.message}` } }
      );
    }
    throw err;
  }

  return { success: true };
}

/**
 * Idempotent startup processor for pending MembershipRecovery records.
 * Resumes interrupted operations or rolls them back, recording unresolved conflicts
 * rather than overwriting newer membership.
 */
async function processPendingRecoveries(processorId = crypto.randomUUID()) {
  const leaseTimeoutMs = 5 * 60 * 1000; // 5 minutes
  const reclaimThreshold = new Date(Date.now() - leaseTimeoutMs);

  const pendingRecords = await MembershipRecovery.find({
    $or: [
      { status: 'pending' },
      { status: 'processing', lockedAt: { $lt: reclaimThreshold } },
    ],
  })
    .sort({ createdAt: 1 })
    .select('_id');

  if (!pendingRecords || pendingRecords.length === 0) return { processed: 0, conflicts: 0 };

  let processed = 0;
  let conflicts = 0;

  for (const item of pendingRecords) {
    // Atomically claim the recovery record so no two processors handle it simultaneously
    const recovery = await MembershipRecovery.findOneAndUpdate(
      {
        _id: item._id,
        $or: [
          { status: 'pending' },
          { status: 'processing', lockedAt: { $lt: reclaimThreshold } },
        ],
      },
      {
        $set: {
          status: 'processing',
          lockedAt: new Date(),
          lockedBy: processorId,
        },
      },
      { returnDocument: 'after' }
    );

    if (!recovery) {
      // Claimed by another concurrent processor
      continue;
    }

    try {
      // Treat existing pending records without reliable version evidence as requiring review;
      // do not guess whether null means interrupted work or a newer unassignment.
      if (!recovery.operationToken) {
        recovery.status = 'conflict';
        recovery.error = 'Missing operation token evidence; manual review required';
        await recovery.save();
        conflicts++;
        continue;
      }

      if (recovery.operationType === 'assign') {
        const { userId, targetGroupId, previousGroupId, operationToken } = recovery;
        const currentUser = await User.findById(userId);
        if (!currentUser) {
          recovery.status = 'failed';
          recovery.error = 'User not found during restart recovery';
          await recovery.save();
          continue;
        }

        // Operation token check: if currentUser's token does not match recovery.operationToken,
        // a newer operation has touched this user (including deliberate unassignment to null!).
        // Leave current membership untouched!
        if (currentUser.membershipOperationToken !== operationToken) {
          recovery.status = 'conflict';
          recovery.error = `Competing operation detected: user token (${currentUser.membershipOperationToken}) does not match recovery token (${operationToken})`;
          await recovery.save();
          conflicts++;
          continue;
        }

        const currentGroupIdStr = currentUser.groupId ? String(currentUser.groupId) : null;
        const targetGroupIdStr = targetGroupId ? String(targetGroupId) : null;

        // If user is in target group, forward completion
        if (currentGroupIdStr === targetGroupIdStr) {
          if (targetGroupId) {
            await Group.updateMany(
              { _id: { $ne: targetGroupId }, members: userId },
              { $pull: { members: userId } }
            );
            await Group.updateOne(
              { _id: targetGroupId },
              { $addToSet: { members: userId } }
            );
          } else {
            await Group.updateMany(
              { members: userId },
              { $pull: { members: userId } }
            );
          }
          recovery.status = 'completed';
          await recovery.save();
          processed++;
        } else {
          // Token matches but user is in intermediate/previous state: roll back with token check
          const rollbackToken = crypto.randomUUID();
          const rollbackRes = await User.updateOne(
            { _id: userId, membershipOperationToken: operationToken },
            {
              $set: {
                groupId: previousGroupId ? new mongoose.Types.ObjectId(previousGroupId) : null,
                membershipOperationToken: rollbackToken,
              },
              $inc: { membershipVersion: 1 },
            }
          );

          if (rollbackRes.matchedCount > 0) {
            if (previousGroupId) {
              await Group.updateOne(
                { _id: previousGroupId },
                { $addToSet: { members: userId } }
              );
            }
            if (targetGroupId) {
              await Group.updateOne(
                { _id: targetGroupId },
                { $pull: { members: userId } }
              );
            }
            recovery.status = 'rolled_back';
            await recovery.save();
            processed++;
          } else {
            recovery.status = 'conflict';
            recovery.error = 'User token changed during recovery rollback';
            await recovery.save();
            conflicts++;
          }
        }
      } else if (recovery.operationType === 'sync') {
        const { groupId, snapshot, operationToken } = recovery;
        const group = await Group.findById(groupId);
        if (!group) {
          recovery.status = 'failed';
          recovery.error = 'Group not found during restart recovery';
          await recovery.save();
          continue;
        }

        const priorStates = snapshot?.priorUserStates || [];
        const oldMemberIds = (snapshot?.oldMemberIds || []).map(String);
        const newMemberIds = (snapshot?.newMemberIds || []).map(String);

        // Check if group's operation token matches
        // If group was modified by a newer operation, DO NOT restore old member list!
        const isGroupAtExpectedToken = group.membershipOperationToken === operationToken;

        // Check each user's token
        let hasConflict = false;
        for (const snap of priorStates) {
          const snapUserId = snap.userId || snap._id;
          const u = await User.findById(snapUserId);
          if (!u || u.membershipOperationToken !== operationToken) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict || !isGroupAtExpectedToken) {
          recovery.status = 'conflict';
          recovery.error = 'Competing operation detected on group or member users during recovery; leaving untouched';
          await recovery.save();
          conflicts++;
          continue;
        }

        // Both group and users are at expected operationToken: safe to complete or rollback
        const currentGroupMembers = (group.members || []).map(String);
        const isGroupUpdated = newMemberIds.length === currentGroupMembers.length &&
          newMemberIds.every(id => currentGroupMembers.includes(id));

        if (isGroupUpdated) {
          // Forward completion
          for (const mId of newMemberIds) {
            await Group.updateMany({ _id: { $ne: group._id }, members: mId }, { $pull: { members: mId } });
          }
          recovery.status = 'completed';
          await recovery.save();
          processed++;
        } else {
          // Rollback: restore group and users
          const rollbackToken = crypto.randomUUID();
          for (const snap of priorStates) {
            const snapUserId = snap.userId || snap._id;
            const snapPrevGroupId = snap.groupId;
            await User.updateOne(
              { _id: snapUserId, membershipOperationToken: operationToken },
              {
                $set: {
                  groupId: snapPrevGroupId ? new mongoose.Types.ObjectId(snapPrevGroupId) : null,
                  membershipOperationToken: rollbackToken,
                },
                $inc: { membershipVersion: 1 },
              }
            );
            if (snapPrevGroupId && snapPrevGroupId !== String(group._id)) {
              await Group.updateOne({ _id: snapPrevGroupId }, { $addToSet: { members: snapUserId } });
            }
          }
          await Group.updateOne(
            { _id: group._id, membershipOperationToken: operationToken },
            {
              $set: {
                members: oldMemberIds,
                membershipOperationToken: rollbackToken,
              },
              $inc: { membershipVersion: 1 },
            }
          );
          recovery.status = 'rolled_back';
          await recovery.save();
          processed++;
        }
      } else if (recovery.operationType === 'remove') {
        const { userId, groupId, previousGroupId, operationToken } = recovery;
        const currentUser = await User.findById(userId);
        if (!currentUser) {
          recovery.status = 'failed';
          recovery.error = 'User not found during restart recovery';
          await recovery.save();
          continue;
        }

        if (currentUser.membershipOperationToken !== operationToken) {
          recovery.status = 'conflict';
          recovery.error = `Competing operation detected: user token does not match recovery token`;
          await recovery.save();
          conflicts++;
          continue;
        }

        const targetRemovalGroup = groupId ? String(groupId) : (previousGroupId ? String(previousGroupId) : null);
        if (targetRemovalGroup) {
          await Group.updateOne({ _id: targetRemovalGroup }, { $pull: { members: userId } });
        }
        recovery.status = 'completed';
        await recovery.save();
        processed++;
      } else if (recovery.operationType === 'delete_group') {
        const targetGroupId = recovery.targetGroupId || recovery.groupId;
        const operationToken = recovery.operationToken;
        if (targetGroupId) {
          await User.updateMany(
            { groupId: targetGroupId },
            {
              $set: { groupId: null, membershipOperationToken: operationToken },
              $inc: { membershipVersion: 1 },
            }
          );
        }
        recovery.status = 'completed';
        await recovery.save();
        processed++;
      }
    } catch (err) {
      recovery.status = 'failed';
      recovery.error = err.message;
      await recovery.save();
    }
  }

  return { processed, conflicts };
}

/**
 * Delete a group and cleanly unassign all members with fresh membership version and operation tokens.
 * This guarantees that older pending recoveries cannot reassign a deliberately unassigned member back into a group.
 */
async function deleteGroupWithMembership(groupId) {
  const group = await Group.findById(groupId);
  if (!group) return false;

  const operationToken = crypto.randomUUID();
  const members = await User.find({ groupId: group._id }).select('_id');

  // Record recovery entry for audit trail and crash safety
  const recovery = await MembershipRecovery.create({
    operationType: 'delete_group',
    targetGroupId: group._id,
    groupId: group._id,
    operationToken,
    expectedUserVersions: members.map(m => ({ userId: String(m._id), operationToken })),
    snapshot: {
      groupId: String(group._id),
      memberIds: members.map(m => String(m._id)),
      operationToken,
    },
    status: 'pending',
  });

  try {
    // Atomically unassign all members, incrementing version and setting fresh operation token
    await User.updateMany(
      { groupId: group._id },
      {
        $set: { groupId: null, membershipOperationToken: operationToken },
        $inc: { membershipVersion: 1 },
      }
    );

    await group.deleteOne();
    await MembershipRecovery.updateOne({ _id: recovery._id }, { $set: { status: 'completed' } });
    return true;
  } catch (err) {
    await MembershipRecovery.updateOne({ _id: recovery._id }, { $set: { status: 'failed', error: err.message } });
    throw err;
  }
}

module.exports = {
  assignUserToGroup,
  syncGroupMembers,
  removeUserFromGroup,
  normalizeExpectedGroupId,
  processPendingRecoveries,
  deleteGroupWithMembership,
};
