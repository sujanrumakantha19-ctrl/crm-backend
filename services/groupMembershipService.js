const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Assign a staff user to a group atomically with concurrency checks and role validation.
 * 
 * @param {string} userId - ID of staff user
 * @param {string|null} targetGroupId - ID of target group, or null to remove from group
 * @param {object} options - { expectedCurrentGroupId }
 */
async function assignUserToGroup(userId, targetGroupId, options = {}) {
  const { expectedCurrentGroupId } = options;

  if (!userId) {
    throw new ErrorResponse('Please provide a valid userId', 400);
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
  if (targetGroupId) {
    targetGroup = await Group.findById(targetGroupId);
    if (!targetGroup) {
      throw new ErrorResponse(`Target group not found with id of ${targetGroupId}`, 404);
    }
  }

  // Atomic write predicate with concurrency check
  if (expectedCurrentGroupId !== undefined) {
    const isExpectedUnassigned = expectedCurrentGroupId === null || expectedCurrentGroupId === 'none' || expectedCurrentGroupId === '';
    const expectedCond = isExpectedUnassigned
      ? { $in: [null, undefined] }
      : new mongoose.Types.ObjectId(String(expectedCurrentGroupId));

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, groupId: expectedCond },
      { $set: { groupId: targetGroupId ? targetGroup._id : null } },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      // Re-read current membership for clear error context
      const latestUser = await User.findById(userId).populate('groupId', 'name');
      const latestGroupName = latestUser && latestUser.groupId ? latestUser.groupId.name : 'Unassigned';
      throw new ErrorResponse(
        `Staff group membership has changed concurrently (currently in ${latestGroupName}). Please refresh.`,
        409
      );
    }
  } else {
    await User.updateOne(
      { _id: userId },
      { $set: { groupId: targetGroupId ? targetGroup._id : null } }
    );
  }

  // Synchronize Group documents
  if (targetGroup) {
    // 1. Remove from all other groups
    await Group.updateMany(
      { _id: { $ne: targetGroup._id }, members: userId },
      { $pull: { members: userId } }
    );
    // 2. Add to target group
    await Group.updateOne(
      { _id: targetGroup._id },
      { $addToSet: { members: userId } }
    );
  } else {
    // Removal from all groups
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

/**
 * Remove a user from a specific group or all groups.
 */
async function removeUserFromGroup(userId, groupId) {
  if (!userId) {
    throw new ErrorResponse('Please provide a valid userId', 400);
  }

  if (groupId) {
    await Group.updateOne(
      { _id: groupId },
      { $pull: { members: userId } }
    );
    await User.updateOne(
      { _id: userId, groupId: groupId },
      { $set: { groupId: null } }
    );
  } else {
    await Group.updateMany(
      { members: userId },
      { $pull: { members: userId } }
    );
    await User.updateOne(
      { _id: userId },
      { $set: { groupId: null } }
    );
  }

  return { success: true };
}

module.exports = {
  assignUserToGroup,
  removeUserFromGroup,
};
