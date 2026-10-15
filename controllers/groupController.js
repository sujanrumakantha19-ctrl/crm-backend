const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Group = require('../models/Group');
const Lead = require('../models/Lead');
const Plot = require('../models/Plot');
const User = require('../models/User');

// @desc    Get all groups
// @route   GET /api/v1/groups
// @access  Private/Admin
exports.getGroups = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get performance metrics for all groups
// @route   GET /api/v1/groups/performance
// @access  Private/Admin
exports.getGroupPerformance = asyncHandler(async (req, res, next) => {
  const { year, month } = req.query;

  let leadDateMatch = {};
  let plotDateMatch = {};

  const targetYear = (!year || year === 'All') ? null : parseInt(year, 10);
  const targetMonth = (!month || month === 'All') ? null : parseInt(month, 10);

  if (targetYear && targetMonth) {
    const start = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const end = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    leadDateMatch = {
      $or: [
        { createdAt: { $gte: start, $lte: end } },
        { dateAdded: { $gte: start, $lte: end } }
      ]
    };
    plotDateMatch = {
      $or: [
        { 'bookedBy.bookedAt': { $gte: startStr, $lte: endStr } },
        { registrationDate: { $gte: startStr, $lte: endStr } },
        { createdAt: { $gte: start, $lte: end } }
      ]
    };
  } else if (targetYear) {
    const start = new Date(targetYear, 0, 1, 0, 0, 0, 0);
    const end = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    const startStr = `${targetYear}-01-01`;
    const endStr = `${targetYear}-12-31`;

    leadDateMatch = {
      $or: [
        { createdAt: { $gte: start, $lte: end } },
        { dateAdded: { $gte: start, $lte: end } }
      ]
    };
    plotDateMatch = {
      $or: [
        { 'bookedBy.bookedAt': { $gte: startStr, $lte: endStr } },
        { registrationDate: { $gte: startStr, $lte: endStr } },
        { createdAt: { $gte: start, $lte: end } }
      ]
    };
  } else if (targetMonth) {
    leadDateMatch = {
      $expr: {
        $eq: [{ $month: { $ifNull: ['$createdAt', '$dateAdded'] } }, targetMonth]
      }
    };
  }

  // 1. Fetch all groups and all staff users
  const [groups, staffUsers] = await Promise.all([
    Group.find().lean(),
    User.find({ role: 'staff' }).select('name displayId designation initials avatarBg isActive groupId').lean()
  ]);

  const staffMap = new Map();
  staffUsers.forEach(s => staffMap.set(String(s._id), s));

  // 2. Aggregate Leads per assignedTo staff member
  const leadAgg = await Lead.aggregate([
    ...(Object.keys(leadDateMatch).length > 0 ? [{ $match: leadDateMatch }] : []),
    {
      $group: {
        _id: '$assignedTo',
        totalLeads: { $sum: 1 },
        convertedCustomers: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
        qualifiedLeads: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
        openLeads: { $sum: { $cond: [{ $in: ['$status', ['Open', 'Lead']] }, 1, 0] } },
        followUpsCount: { $sum: { $size: { $ifNull: ['$followUps', []] } } }
      }
    }
  ]);

  const leadStatsByStaff = new Map();
  leadAgg.forEach(r => {
    if (r._id) {
      leadStatsByStaff.set(String(r._id), r);
    }
  });

  // 3. Aggregate Plot Bookings per staff member
  const plotAgg = await Plot.aggregate([
    {
      $match: {
        status: { $in: ['Booked', 'Registered'] },
        ...(Object.keys(plotDateMatch).length > 0 ? plotDateMatch : {})
      }
    },
    {
      $project: {
        staffId: { $ifNull: ['$bookedBy.staffId', '$assignedTo'] }
      }
    },
    {
      $match: {
        staffId: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$staffId',
        bookingsCount: { $sum: 1 }
      }
    }
  ]);

  const plotStatsByStaff = new Map();
  plotAgg.forEach(r => {
    if (r._id) {
      plotStatsByStaff.set(String(r._id), r.bookingsCount);
    }
  });

  // 4. Compute performance per group
  const performance = groups.map(group => {
    const memberIds = (group.members || []).map(m => String(m));

    let groupTotalLeads = 0;
    let groupConverted = 0;
    let groupQualified = 0;
    let groupActive = 0;
    let groupFollowUps = 0;
    let groupBookings = 0;

    const memberStats = memberIds.map(mId => {
      const staff = staffMap.get(mId) || { _id: mId, name: 'Unknown', displayId: '' };
      const lStats = leadStatsByStaff.get(mId) || { totalLeads: 0, convertedCustomers: 0, qualifiedLeads: 0, openLeads: 0, followUpsCount: 0 };
      const pBookings = plotStatsByStaff.get(mId) || 0;
      const totalBookings = Math.max(pBookings, lStats.convertedCustomers);

      groupTotalLeads += lStats.totalLeads;
      groupConverted += lStats.convertedCustomers;
      groupQualified += lStats.qualifiedLeads;
      groupActive += (lStats.openLeads + lStats.qualifiedLeads);
      groupFollowUps += lStats.followUpsCount;
      groupBookings += totalBookings;

      return {
        id: mId,
        _id: mId,
        name: staff.name,
        displayId: staff.displayId,
        designation: staff.designation,
        initials: staff.initials,
        avatarBg: staff.avatarBg,
        totalLeads: lStats.totalLeads,
        memberBookings: totalBookings,
        totalFollowUps: lStats.followUpsCount,
        staffQualified: lStats.qualifiedLeads
      };
    });

    const conversionRate = groupTotalLeads > 0 ? Math.round((groupConverted / groupTotalLeads) * 100) : 0;

    return {
      group: {
        id: String(group._id),
        _id: String(group._id),
        name: group.name,
        description: group.description,
        members: group.members
      },
      totalLeads: groupTotalLeads,
      bookingsCount: Math.max(groupBookings, groupConverted),
      convertedCustomers: groupConverted,
      qualifiedLeads: groupQualified,
      activeLeads: groupActive,
      conversionRate,
      totalFollowUps: groupFollowUps,
      memberStats
    };
  });

  // Sort groups by bookingsCount desc, then totalLeads desc
  performance.sort((a, b) => {
    if (b.bookingsCount !== a.bookingsCount) return b.bookingsCount - a.bookingsCount;
    return b.totalLeads - a.totalLeads;
  });

  // Overall summary metrics across all staff / system
  const totalLeadsHandled = performance.reduce((sum, g) => sum + g.totalLeads, 0);
  const conversionsClosed = performance.reduce((sum, g) => sum + g.convertedCustomers, 0);
  const qualifiedLeads = performance.reduce((sum, g) => sum + g.qualifiedLeads, 0);
  const topGroupId = (performance.length > 0 && performance[0].convertedCustomers > 0) ? performance[0].group.id : null;

  res.status(200).json({
    success: true,
    data: {
      performance,
      summary: {
        totalLeadsHandled,
        conversionsClosed,
        qualifiedLeads,
        topGroupId
      }
    }
  });
});

// @desc    Get single group
// @route   GET /api/v1/groups/:id
// @access  Private/Admin
exports.getGroup = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id).populate('members', 'name initials role');

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: group,
  });
});

// @desc    Create group
// @route   POST /api/v1/groups
// @access  Private/Admin
exports.createGroup = asyncHandler(async (req, res, next) => {
  const group = await Group.create(req.body);

  res.status(201).json({
    success: true,
    data: group,
  });
});

// @desc    Update group
// @route   PUT /api/v1/groups/:id
// @access  Private/Admin
exports.updateGroup = asyncHandler(async (req, res, next) => {
  let group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  const allowedFields = {
    name: req.body.name,
    description: req.body.description,
    members: req.body.members,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  if (allowedFields.members) {
    const memberStrings = allowedFields.members.map(m => String(m));
    const oldMembers = group.members.map(m => String(m));
    const added = memberStrings.filter(m => !oldMembers.includes(m));
    const removed = oldMembers.filter(m => !memberStrings.includes(m));

    const User = require('../models/User');
    if (added.length > 0) {
      await User.updateMany({ _id: { $in: added } }, { groupId: group._id });
    }
    if (removed.length > 0) {
      await User.updateMany({ _id: { $in: removed } }, { groupId: null });
    }
  }

  group = await Group.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: group,
  });
});

// @desc    Delete group
// @route   DELETE /api/v1/groups/:id
// @access  Private/Admin
exports.deleteGroup = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  // Cascade cleanup: remove groupId from all members
  const User = require('../models/User');
  await User.updateMany({ groupId: group._id }, { groupId: null });

  await group.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Add member to group
// @route   POST /api/v1/groups/:id/members
// @access  Private/Admin
exports.addMember = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  const { userId } = req.body;

  if (!userId) {
    return next(new ErrorResponse('Please provide a userId', 400));
  }

  // Check if member already exists (compare as strings to avoid ObjectId vs string mismatch)
  if (group.members.some(m => String(m) === String(userId))) {
    return next(new ErrorResponse('User is already a member of this group', 400));
  }

  // Remove user from any other group first so a user belongs to at most one group
  await Group.updateMany({ _id: { $ne: group._id }, members: userId }, { $pull: { members: userId } });

  group.members.push(userId);
  await group.save();

  // Sync User.groupId so membership stays consistent (issue 66)
  const User = require('../models/User');
  await User.updateOne({ _id: userId }, { groupId: group._id });

  res.status(200).json({
    success: true,
    data: group,
  });
});

// @desc    Remove member from group
// @route   DELETE /api/v1/groups/:id/members/:userId
// @access  Private/Admin
exports.removeMember = asyncHandler(async (req, res, next) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return next(new ErrorResponse(`Group not found with id of ${req.params.id}`, 404));
  }

  const memberIndex = group.members.findIndex(m => String(m) === String(req.params.userId));

  if (memberIndex === -1) {
    return next(new ErrorResponse('User is not a member of this group', 400));
  }

  group.members.splice(memberIndex, 1);
  await group.save();

  // Sync User.groupId so membership stays consistent (issue 66)
  const User = require('../models/User');
  await User.updateOne({ _id: req.params.userId }, { groupId: null });

  res.status(200).json({
    success: true,
    data: group,
  });
});
