const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Plot = require('../models/Plot');
const ActivityLog = require('../models/ActivityLog');

// @desc    Get all leads
// @route   GET /api/v1/leads
// @access  Public
exports.getLeads = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get tab counts for leads in a single query
// @route   GET /api/v1/leads/counts
// @access  Private
exports.getLeadCounts = asyncHandler(async (req, res) => {
  // Single aggregation that returns all tab counts at once
  const counts = await Lead.aggregate([
    {
      $group: {
        _id: '$status',
        total: { $sum: 1 },
        assigned: {
          $sum: {
            $cond: [{ $and: [{ $eq: ['$status', 'Open'] }, { $ifNull: ['$assignedTo', false] }] }, 1, 0]
          }
        },
        unassigned: {
          $sum: {
            $cond: [{ $and: [{ $eq: ['$status', 'Open'] }, { $not: [{ $ifNull: ['$assignedTo', false] }] }] }, 1, 0]
          }
        },
      }
    }
  ]);

  const result = { All: 0, Open: 0, Reserved: 0, Qualified: 0, Unqualified: 0, Customer: 0 };
  let grandTotal = 0;
  counts.forEach(c => {
    grandTotal += c.total;
    if (c._id === 'Open') {
      result.Open = c.unassigned;
      result.Reserved = c.assigned;
    } else if (c._id === 'Qualified') {
      result.Qualified = c.total;
    } else if (c._id === 'Unqualified') {
      result.Unqualified = c.total;
    } else if (c._id === 'Customer') {
      result.Customer = c.total;
    }
  });
  result.All = grandTotal;

  res.status(200).json({ success: true, data: result });
});



// @desc    Check if phone number exists for a lead
// @route   GET /api/v1/leads/check-phone/:phone
// @access  Private
exports.checkPhoneExists = asyncHandler(async (req, res, next) => {
  const phone = (req.params.phone || '').trim();
  if (!phone) {
    return res.status(200).json({ success: true, exists: false });
  }

  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 5) {
    return res.status(200).json({ success: true, exists: false });
  }

  const last10 = digits.slice(-10);
  const lead = await Lead.findOne({
    $or: [
      { phone: phone },
      { phone: { $regex: last10 } }
    ]
  }).select('customerName phone status assignedToName');

  if (lead) {
    return res.status(200).json({
      success: true,
      exists: true,
      lead: {
        id: String(lead._id),
        customerName: lead.customerName,
        phone: lead.phone,
        status: lead.status,
        assignedToName: lead.assignedToName || 'Unassigned',
      }
    });
  }

  res.status(200).json({
    success: true,
    exists: false
  });
});

// @desc    Get single lead
// @route   GET /api/v1/leads/:id
// @access  Public
exports.getLead = asyncHandler(async (req, res, next) => {
  let lead;
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    lead = await Lead.findById(req.params.id)
      .populate({
        path: 'assignedTo',
        select: 'name initials role displayId',
      })
      .populate({
        path: 'projectId',
        select: 'name location',
      })
      .populate({
        path: 'plotId',
        select: 'plotNumber status',
      });
  }
  if (!lead) {
    lead = await Lead.findOne({ displayId: req.params.id })
      .populate({
        path: 'assignedTo',
        select: 'name initials role displayId',
      })
      .populate({
        path: 'projectId',
        select: 'name location',
      })
      .populate({
        path: 'plotId',
        select: 'plotNumber status',
      });
  }

  if (!lead) {
    return next(new ErrorResponse(`Lead not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: lead,
  });
});

// @desc    Create lead
// @route   POST /api/v1/leads
// @access  Private
exports.createLead = asyncHandler(async (req, res, next) => {
  const allowedFields = {
    customerName: req.body.customerName,
    phone: req.body.phone,
    email: req.body.email,
    gender: req.body.gender,
    city: req.body.city,
    budgetMin: req.body.budgetMin,
    budgetMax: req.body.budgetMax,
    budget: req.body.budget,
    category: req.body.category,
    propertyInterest: req.body.propertyInterest,
    notes: req.body.notes,
    source: req.body.source,
    sourceType: req.body.sourceType,
    assignedTo: req.body.assignedTo,
    assignedToName: req.body.assignedToName,
    status: req.body.status,
    dateAdded: req.body.dateAdded,
    projectId: req.body.projectId,
    plotId: req.body.plotId,
    paymentStatus: req.body.paymentStatus,
    paymentMethod: req.body.paymentMethod,
    bank: req.body.bank,
    bankFollowerName: req.body.bankFollowerName,
    bankFollowerPhone: req.body.bankFollowerPhone,
    loanStage: req.body.loanStage,
    dob: req.body.dob,
    nextFollowUpDate: req.body.nextFollowUpDate,
    followUps: req.body.followUps,
  };

  const lead = await Lead.create(allowedFields);

  if (req.body.assignedTo) {
    try {
      const assignedUser = await User.findById(req.body.assignedTo).select('displayId');
      if (assignedUser && assignedUser.displayId) {
        lead.assignedToDisplayId = assignedUser.displayId;
        await lead.save();
      }
    } catch (e) {
    }
  }

  res.status(201).json({
    success: true,
    data: lead,
  });
});

// @desc    Update lead
// @route   PUT /api/v1/leads/:id
// @access  Private
exports.updateLead = asyncHandler(async (req, res, next) => {
  let lead;
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    lead = await Lead.findById(req.params.id);
  }
  if (!lead) {
    lead = await Lead.findOne({ displayId: req.params.id });
  }

  if (!lead) {
    return next(new ErrorResponse(`Lead not found with id of ${req.params.id}`, 404));
  }

  // Atomic reservation check: If attempting to reserve an already-assigned lead as staff
  if (req.body.assignedTo && lead.assignedTo && String(lead.assignedTo).trim() !== '' && String(lead.assignedTo) !== String(req.body.assignedTo) && req.user?.role === 'staff') {
    return next(new ErrorResponse('This lead has already been reserved by another staff member.', 400));
  }

  const previousStatus = lead.status;

  const allowedFields = {
    customerName: req.body.customerName,
    phone: req.body.phone,
    email: req.body.email,
    gender: req.body.gender,
    city: req.body.city,
    budgetMin: req.body.budgetMin,
    budgetMax: req.body.budgetMax,
    budget: req.body.budget,
    category: req.body.category,
    propertyInterest: req.body.propertyInterest,
    notes: req.body.notes,
    source: req.body.source,
    sourceType: req.body.sourceType,
    assignedTo: req.body.assignedTo,
    assignedToName: req.body.assignedToName,
    status: req.body.status,
    dateAdded: req.body.dateAdded,
    projectId: req.body.projectId,
    plotId: req.body.plotId,
    paymentStatus: req.body.paymentStatus,
    paymentMethod: req.body.paymentMethod,
    bank: req.body.bank,
    bankFollowerName: req.body.bankFollowerName,
    bankFollowerPhone: req.body.bankFollowerPhone,
    loanStage: req.body.loanStage,
    dob: req.body.dob,
    nextFollowUpDate: req.body.nextFollowUpDate,
    followUps: req.body.followUps,
  };

  Object.keys(allowedFields).forEach(key => {
    if (allowedFields[key] !== undefined) {
      lead[key] = allowedFields[key];
    }
  });

  // Sync assignedToDisplayId when assignedTo changes
  if (req.body.assignedTo !== undefined) {
    if (req.body.assignedTo) {
      try {
        const assignedUser = await User.findById(req.body.assignedTo).select('displayId');
        lead.assignedToDisplayId = (assignedUser && assignedUser.displayId) || undefined;
      } catch (e) {
        lead.assignedToDisplayId = undefined;
      }
    } else {
      lead.assignedToDisplayId = undefined;
    }
  }

  await lead.save();

  // If lead status changed to Customer & plotId is present, auto-sync plot status to Booked
  if (allowedFields.status === 'Customer' && previousStatus !== 'Customer' && lead.plotId) {
    try {
      await Plot.findByIdAndUpdate(lead.plotId, { status: 'Booked' });
    } catch (e) {
      console.error('Error auto-syncing plot status to Booked:', e);
    }
  } else if (previousStatus === 'Customer' && allowedFields.status && allowedFields.status !== 'Customer' && lead.plotId) {
    try {
      await Plot.findByIdAndUpdate(lead.plotId, { status: 'Available' });
    } catch (e) {
      console.error('Error auto-syncing plot status to Available:', e);
    }
  }

  if (allowedFields.status && allowedFields.status !== previousStatus) {
    try {
      await ActivityLog.create({
        user: req.user ? req.user.id : null,
        userName: req.user ? req.user.name : 'System',
        userRole: req.user ? req.user.role : 'system',
        userInitials: req.user ? req.user.initials : 'SYS',
        action: 'Status Change',
        details: `Status changed from ${previousStatus} to ${allowedFields.status}`,
        entityType: 'Lead',
        entityId: lead._id,
        entityName: lead.customerName,
        timestamp: new Date().toISOString(),
        ipAddress: req.ip || '',
      });
    } catch (logErr) {
      console.error('Failed to create activity log:', logErr.message);
    }
  }

  const updatedLead = await Lead.findById(lead._id)
    .populate({
      path: 'assignedTo',
      select: 'name initials role displayId',
    })
    .populate({
      path: 'projectId',
      select: 'name location',
    })
    .populate({
      path: 'plotId',
      select: 'plotNumber status',
    });

  res.status(200).json({
    success: true,
    data: updatedLead,
  });
});

// @desc    Delete lead
// @route   DELETE /api/v1/leads/:id
// @access  Private
exports.deleteLead = asyncHandler(async (req, res, next) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return next(new ErrorResponse(`Lead not found with id of ${req.params.id}`, 404));
  }

  const deletedName = lead.customerName;
  await lead.deleteOne();

  try {
    await ActivityLog.create({
      user: req.user ? req.user.id : null,
      userName: req.user ? req.user.name : 'System',
      userRole: req.user ? req.user.role : 'system',
      userInitials: req.user ? req.user.initials : 'SYS',
      action: 'Delete',
      details: `Deleted lead ${deletedName}`,
      entityType: 'Lead',
      entityId: req.params.id,
      entityName: deletedName,
      timestamp: new Date().toISOString(),
      ipAddress: req.ip || '',
    });
  } catch (logErr) {
    console.error('Failed to create activity log:', logErr.message);
  }

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get leads by project
// @route   GET /api/v1/projects/:projectId/leads
// @access  Public
exports.getLeadsByProject = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { projectId: req.params.projectId };
  const total = await Lead.countDocuments(query);
  const leads = await Lead.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: leads.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: leads,
  });
});

// @desc    Get leads by status
// @route   GET /api/v1/leads/status/:status
// @access  Public
exports.getLeadsByStatus = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { status: req.params.status };
  const total = await Lead.countDocuments(query);
  const leads = await Lead.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: leads.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: leads,
  });
});

// @desc    Get leads by assigned user
// @route   GET /api/v1/leads/user/:userId
// @access  Public
exports.getLeadsByUser = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { assignedTo: req.params.userId };
  const total = await Lead.countDocuments(query);
  const leads = await Lead.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: leads.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: leads,
  });
});

// @desc    Get paginated follow-ups with search, date filters, and stats
// @route   GET /api/v1/leads/follow-ups
// @access  Private
exports.getFollowUps = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 15, 100);
  const skip = (page - 1) * limit;

  const { search, date, dateFrom, dateTo, outcome, assignedTo } = req.query;

  // 1. Lead-level match
  const leadMatch = {};
  if (assignedTo && assignedTo !== 'all') {
    const mongoose = require('mongoose');
    const matches = [String(assignedTo)];
    if (mongoose.Types.ObjectId.isValid(assignedTo)) {
      matches.push(new mongoose.Types.ObjectId(assignedTo));
    }
    leadMatch.assignedTo = { $in: matches };
  }

  // 2. Unwind followUps array
  const unwindStage = { $unwind: '$followUps' };

  // 3. Sort by followUps date descending to identify the latest follow-up per lead
  const sortByLatest = {
    $sort: {
      'followUps.date': -1,
      'followUps._id': -1
    }
  };

  // 4. Group by Lead ID to keep only the latest follow-up per lead
  const groupByLead = {
    $group: {
      _id: '$_id',
      customerName: { $first: '$customerName' },
      displayId: { $first: '$displayId' },
      phone: { $first: '$phone' },
      city: { $first: '$city' },
      status: { $first: '$status' },
      assignedTo: { $first: '$assignedTo' },
      assignedToName: { $first: '$assignedToName' },
      projectId: { $first: '$projectId' },
      nextFollowUpDateLead: { $first: '$nextFollowUpDate' },
      followUps: { $first: '$followUps' }
    }
  };

  // 5. FollowUp-level match
  const followUpMatch = {};
  const andConditions = [];

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    andConditions.push({
      $or: [
        { customerName: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
        { 'followUps.notes': { $regex: escaped, $options: 'i' } }
      ]
    });
  }

  // Date filtering logic
  let dateQuery = null;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (date === 'today') {
    dateQuery = { $gte: todayStr, $lte: todayStr + '\uffff' };
  } else if (date === 'yesterday') {
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    const yStr = y.toISOString().split('T')[0];
    dateQuery = { $gte: yStr, $lte: yStr + '\uffff' };
  } else if (date === 'tomorrow') {
    const tm = new Date(today);
    tm.setDate(today.getDate() + 1);
    const tmStr = tm.toISOString().split('T')[0];
    dateQuery = { $gte: tmStr, $lte: tmStr + '\uffff' };
  } else if (date === 'week') {
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const startStr = sevenDaysAgo.toISOString().split('T')[0];
    const endStr = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    dateQuery = { $gte: startStr, $lte: endStr + '\uffff' };
  } else if (date === 'pending') {
    andConditions.push({
      $or: [
        { 'followUps.nextFollowUpDate': { $lt: todayStr, $ne: null, $ne: '' } },
        {
          $and: [
            { 'followUps.nextFollowUpDate': { $in: [null, ''] } },
            { nextFollowUpDateLead: { $lt: todayStr, $ne: null, $ne: '' } }
          ]
        }
      ]
    });
  } else if (dateFrom || dateTo) {
    const dCond = {};
    if (dateFrom) dCond.$gte = dateFrom;
    if (dateTo) dCond.$lte = dateTo + '\uffff';
    dateQuery = dCond;
  } else if (date && date !== 'all' && date !== 'custom') {
    const dStr = String(date).split('T')[0];
    dateQuery = { $gte: dStr, $lte: dStr + '\uffff' };
  }

  if (dateQuery) {
    andConditions.push({ 'followUps.nextFollowUpDate': dateQuery });
  }

  if (andConditions.length > 0) {
    followUpMatch.$and = andConditions;
  }

  let outcomeMatch = null;
  if (outcome === 'positive') {
    outcomeMatch = {
      'followUps.outcome': {
        $not: { $regex: 'not interested|dnd|wrong|dropped|invalid|no answer|negative', $options: 'i' }
      }
    };
  } else if (outcome === 'negative') {
    outcomeMatch = {
      'followUps.outcome': {
        $regex: 'not interested|dnd|wrong|dropped|invalid|no answer|negative', $options: 'i'
      }
    };
  } else if (outcome && outcome !== 'all') {
    const escapedOpt = outcome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    outcomeMatch = {
      'followUps.outcome': { $regex: escapedOpt, $options: 'i' }
    };
  }

  const pipeline = [
    ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
    unwindStage,
    sortByLatest,
    groupByLead,
    ...(Object.keys(followUpMatch).length > 0 ? [{ $match: followUpMatch }] : []),
    {
      $addFields: {
        effectiveNextDate: {
          $ifNull: ['$followUps.nextFollowUpDate', '$nextFollowUpDateLead', '9999-12-31']
        }
      }
    },
    {
      $sort: {
        effectiveNextDate: 1,
        'followUps.date': -1
      }
    },
    {
      $facet: {
        data: [
          ...(outcomeMatch ? [{ $match: outcomeMatch }] : []),
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: '$followUps._id',
              id: '$followUps._id',
              followUpId: '$followUps._id',
              leadId: '$_id',
              leadName: '$customerName',
              displayId: '$displayId',
              phone: '$phone',
              city: '$city',
              status: '$status',
              staffId: '$assignedTo',
              staffName: '$assignedToName',
              projectId: '$projectId',
              date: '$followUps.date',
              nextFollowUpDate: { $ifNull: ['$followUps.nextFollowUpDate', '$nextFollowUpDateLead'] },
              outcome: '$followUps.outcome',
              notes: '$followUps.notes',
              nextAction: '$followUps.nextAction',
            },
          },
        ],
        totalCount: [
          ...(outcomeMatch ? [{ $match: outcomeMatch }] : []),
          { $count: 'count' }
        ],
        statsTotal: [
          { $count: 'count' }
        ],
        statsPending: [
          {
            $match: {
              $or: [
                { 'followUps.nextFollowUpDate': { $lt: todayStr, $ne: null, $ne: '' } },
                {
                  $and: [
                    { 'followUps.nextFollowUpDate': { $in: [null, ''] } },
                    { nextFollowUpDateLead: { $lt: todayStr, $ne: null, $ne: '' } }
                  ]
                }
              ]
            }
          },
          { $count: 'count' }
        ],
        statsPositive: [
          {
            $match: {
              'followUps.outcome': {
                $not: { $regex: 'not interested|dnd|wrong|dropped|invalid|no answer|negative', $options: 'i' }
              }
            }
          },
          { $count: 'count' }
        ],
        statsNegative: [
          {
            $match: {
              'followUps.outcome': {
                $regex: 'not interested|dnd|wrong|dropped|invalid|no answer|negative', $options: 'i'
              }
            }
          },
          { $count: 'count' }
        ]
      },
    },
  ];

  const results = await Lead.aggregate(pipeline);
  const facetResult = results[0] || {};
  const data = facetResult.data || [];
  const total = facetResult.totalCount?.[0]?.count || 0;
  const totalCount = facetResult.statsTotal?.[0]?.count || 0;
  const pendingCount = facetResult.statsPending?.[0]?.count || 0;
  const positiveCount = facetResult.statsPositive?.[0]?.count || 0;
  const negativeCount = facetResult.statsNegative?.[0]?.count || 0;

  res.status(200).json({
    success: true,
    data,
    total,
    page,
    pages: Math.ceil(total / limit),
    stats: {
      totalCount,
      positiveCount,
      negativeCount,
      pendingCount,
    },
  });
});