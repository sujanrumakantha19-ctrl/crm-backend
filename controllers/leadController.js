const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const { getTodayDateStringIST } = require('../utils/dateIST');
const ErrorResponse = require('../utils/errorResponse');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Plot = require('../models/Plot');
const ActivityLog = require('../models/ActivityLog');
const { countUniqueCustomers } = require('../utils/customerMetrics');

// Follow-up outcome classification. Negative outcomes are matched on full words
// (word boundaries), so partial/unrelated matches (e.g. "Wrong project but
// interested") no longer get mislabelled as negative.
const NEGATIVE_OUTCOME_RE = '\\bnot interested\\b|\\bdnd\\b|\\bdo not call\\b|\\bwrong number\\b|\\bdropped\\b|\\binvalid\\b|\\bno answer\\b|\\bnegative\\b';
const POSITIVE_OUTCOME_RE = '\\binterested\\b|\\bcall back\\b|\\bcallback\\b';
const isNegativeOutcome = {
  'followUps.outcome': { $regex: NEGATIVE_OUTCOME_RE, $options: 'i' },
};
const isPositiveOutcome = {
  $and: [
    { 'followUps.outcome': { $regex: POSITIVE_OUTCOME_RE, $options: 'i' } },
    { 'followUps.outcome': { $not: { $regex: NEGATIVE_OUTCOME_RE, $options: 'i' } } },
  ],
};

function collapseLeadsByCustomer(leads) {
  if (!leads || leads.length <= 1) return leads;
  const groups = new Map();

  for (const lead of leads) {
    const rawPhone = lead.phone ? String(lead.phone).replace(/\D/g, '').slice(-10) : '';
    let key;
    if (rawPhone && rawPhone !== '0000000000') {
      key = `p:${rawPhone}`;
    } else if (lead.displayId) {
      key = `d:${String(lead.displayId).trim().toUpperCase()}`;
    } else {
      key = `n:${String(lead.customerName || '').toLowerCase().trim()}`;
    }

    const obj = lead.toObject ? lead.toObject({ virtuals: true }) : { ...lead };
    obj.id = String(obj._id || obj.id);

    if (!groups.has(key)) {
      obj.relatedBookingCount = 1;
      obj.relatedLeadDisplayIds = obj.displayId ? [obj.displayId] : [];
      obj.relatedLeadIds = [obj.id];
      groups.set(key, obj);
    } else {
      const existing = groups.get(key);
      existing.relatedBookingCount = (existing.relatedBookingCount || 1) + 1;
      if (obj.displayId && !existing.relatedLeadDisplayIds.includes(obj.displayId)) {
        existing.relatedLeadDisplayIds.push(obj.displayId);
      }
      if (obj.id && !existing.relatedLeadIds.includes(obj.id)) {
        existing.relatedLeadIds.push(obj.id);
      }
      if (!existing.assignedTo && obj.assignedTo) {
        existing.assignedTo = obj.assignedTo;
        existing.assignedToName = obj.assignedToName;
        existing.assignedToDisplayId = obj.assignedToDisplayId;
      }
    }
  }

  return Array.from(groups.values());
}

// @desc    Get all leads
// @route   GET /api/v1/leads
// @access  Public
exports.getLeads = asyncHandler(async (req, res, next) => {
  let data = res.advancedResults.data || [];
  let count = res.advancedResults.count;

  if (req.query.groupBy === 'customer' || (req.query.status === 'Customer' && req.query.groupBy !== 'none')) {
    data = collapseLeadsByCustomer(data);
    count = data.length;
  }

  res.status(200).json({
    ...res.advancedResults,
    count,
    data,
  });
});

// @desc    Get tab counts for leads in a single query
// @route   GET /api/v1/leads/counts
// @access  Private
// @query   assignedTo, sourceId — optional ObjectId filters; omitted = company-wide (existing behavior)
exports.getLeadCounts = asyncHandler(async (req, res) => {
  const match = {};
  const { assignedTo, sourceId, search } = req.query;
  if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
    match.assignedTo = new mongoose.Types.ObjectId(assignedTo);
  }
  if (sourceId && mongoose.Types.ObjectId.isValid(sourceId)) {
    match.sourceId = new mongoose.Types.ObjectId(sourceId);
  }

  // Handle search filter if provided (name, phone, lead id, staff id)
  let searchFilter = null;
  if (search && search.trim()) {
    const rawSearch = search.trim();
    const escapedSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexibleSearch = escapedSearch.split('').join('\\s*');

    const orConditions = [
      { customerName: { $regex: flexibleSearch, $options: 'i' } },
      { phone: { $regex: escapedSearch, $options: 'i' } },
      { displayId: { $regex: escapedSearch, $options: 'i' } },
      { assignedToName: { $regex: flexibleSearch, $options: 'i' } },
      { assignedToDisplayId: { $regex: escapedSearch, $options: 'i' } },
    ];

    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      orConditions.push({ _id: new mongoose.Types.ObjectId(rawSearch) });
    }

    const numMatch = rawSearch.match(/^0*(\d+)$/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      orConditions.push({ displayId: `L-${num}` });
      orConditions.push({ displayId: `PROJ-${num}` });
      orConditions.push({ displayId: `STAFF-${num}` });
      orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
    }

    const leadOrCustMatch = rawSearch.match(/^(?:l|c|cust|customer)[\s-]*(\d+)$/i);
    if (leadOrCustMatch) {
      const num = parseInt(leadOrCustMatch[1], 10);
      orConditions.push({ displayId: `L-${num}` });
    }

    const staffMatch = rawSearch.match(/^(?:staff|emp)[\s-]*(\d+)$/i);
    if (staffMatch) {
      const num = parseInt(staffMatch[1], 10);
      orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
    }

    searchFilter = { $or: orConditions };
  }

  const pipeline = [];
  const pipelineMatch = { ...match };
  if (searchFilter) {
    if (Object.keys(pipelineMatch).length > 0) {
      pipeline.push({ $match: { $and: [pipelineMatch, searchFilter] } });
    } else {
      pipeline.push({ $match: searchFilter });
    }
  } else if (Object.keys(pipelineMatch).length > 0) {
    pipeline.push({ $match: pipelineMatch });
  }

  pipeline.push({
    $group: {
      _id: '$status',
      total: { $sum: 1 },
      assigned: {
        $sum: {
          $cond: [{ $and: [{ $in: ['$status', ['Open', 'Lead']] }, { $ifNull: ['$assignedTo', false] }] }, 1, 0]
        }
      },
      unassigned: {
        $sum: {
          $cond: [{ $and: [{ $in: ['$status', ['Open', 'Lead']] }, { $not: [{ $ifNull: ['$assignedTo', false] }] }] }, 1, 0]
        }
      },
    }
  });

  const customerMatch = { status: 'Customer' };
  if (match.assignedTo) customerMatch.assignedTo = match.assignedTo;
  if (match.sourceId) customerMatch.sourceId = match.sourceId;
  const finalCustomerMatch = searchFilter ? { $and: [customerMatch, searchFilter] } : customerMatch;

  const [counts, uniqueCustomersCount] = await Promise.all([
    Lead.aggregate(pipeline),
    countUniqueCustomers(finalCustomerMatch),
  ]);

  const result = { All: 0, Open: 0, Reserved: 0, Qualified: 0, Unqualified: 0, Customer: uniqueCustomersCount };
  counts.forEach(c => {
    if (c._id === 'Open' || c._id === 'Lead') {
      result.Open += c.unassigned;
      result.Reserved += c.assigned;
    } else if (c._id === 'Qualified') {
      result.Qualified += c.total;
    } else if (c._id === 'Unqualified') {
      result.Unqualified += c.total;
    } else if (c._id === 'Customer') {
      // Handled via uniqueCustomersCount
    } else {
      result.Open += (c.unassigned || 0);
      result.Reserved += (c.assigned || 0);
    }
  });
  result.All = result.Open + result.Reserved + result.Qualified + result.Unqualified + result.Customer;

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
  // Match any stored phone that ENDS with the queried last-10 digits. Anchoring
  // the regex to the end avoids false positives where the digits merely appear
  // elsewhere in the number.
  const candidates = await Lead.find({
    phone: { $regex: new RegExp(`${last10}$`) }
  }).select('customerName phone status assignedToName assignedToDisplayId displayId');

  if (candidates.length > 0) {
    // Prefer the exact phone match, otherwise the first candidate found.
    const lead =
      candidates.find(c => c.phone.replace(/\D/g, '').slice(-10) === last10) ||
      candidates[0];
    return res.status(200).json({
      success: true,
      exists: true,
      lead: {
        id: String(lead._id),
        displayId: lead.displayId || String(lead._id),
        customerName: lead.customerName,
        phone: lead.phone,
        status: lead.status,
        assignedToName: lead.assignedToName || 'Unassigned',
        assignedToDisplayId: lead.assignedToDisplayId || null,
      },
      duplicatesCount: candidates.length,
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
    email: req.body.email ? String(req.body.email).trim().toLowerCase() : undefined,
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
    sourceId: req.body.sourceId || (req.body.sourceType === 'Channel Partner' && req.user?.role === 'partner' ? req.user._id : undefined),
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

  if (req.body.assignedTo) {
    const assignedUser = await User.findById(req.body.assignedTo).select('displayId name isActive');
    if (!assignedUser) {
      return next(new ErrorResponse('Assigned representative not found', 404));
    }
    if (assignedUser.isActive === false) {
      return next(new ErrorResponse('Cannot assign lead to an inactive staff member', 400));
    }
    allowedFields.assignedTo = assignedUser._id;
    allowedFields.assignedToName = req.body.assignedToName || assignedUser.name;
    allowedFields.assignedToDisplayId = assignedUser.displayId || undefined;
  }

  const lead = await Lead.create(allowedFields);

  try {
    await ActivityLog.create({
      actorId: req.user ? req.user.id : null,
      actorName: req.user ? req.user.name : 'System',
      actorRole: req.user ? req.user.role : 'system',
      actorInitials: req.user ? req.user.initials : 'SYS',
      actionType: 'Created',
      action: `Created lead "${allowedFields.customerName}"`,
      entityType: 'Lead',
      entityId: lead._id,
      entityName: allowedFields.customerName,
      timestamp: new Date().toISOString(),
      ipAddress: req.ip || '',
    });
  } catch (logErr) {
    console.error('Failed to create activity log:', logErr.message);
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
  const previousPlotId = lead.plotId ? String(lead.plotId) : null;

  const allowedFields = {
    customerName: req.body.customerName,
    phone: req.body.phone,
    email: req.body.email ? String(req.body.email).trim().toLowerCase() : (req.body.email === '' ? undefined : req.body.email),
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
    sourceId: req.body.sourceId || (req.body.sourceType === 'Channel Partner' && req.user?.role === 'partner' ? req.user._id : undefined),
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

  // Explicitly handle assignedTo, assignedToName, assignedToDisplayId
  if (req.body.assignedTo !== undefined) {
    if (req.body.assignedTo) {
      const assignedUser = await User.findById(req.body.assignedTo).select('displayId name isActive');
      if (!assignedUser) {
        return next(new ErrorResponse('Assigned representative not found', 404));
      }
      if (assignedUser.isActive === false) {
        return next(new ErrorResponse('Cannot assign lead to an inactive staff member', 400));
      }
      lead.assignedTo = assignedUser._id;
      lead.assignedToDisplayId = assignedUser.displayId || undefined;
      lead.assignedToName = req.body.assignedToName || assignedUser.name || undefined;
    } else {
      lead.assignedTo = undefined;
      lead.assignedToName = undefined;
      lead.assignedToDisplayId = undefined;
    }
  } else if (req.body.assignedToName !== undefined) {
    lead.assignedToName = req.body.assignedToName || undefined;
  }

  await lead.save();

  // ── Auto-sync plot status based on the lead's Customer state and its plotId ──
  const currentPlotId = lead.plotId ? String(lead.plotId) : null;
  const isCustomer = lead.status === 'Customer';

  const releasePlot = async (plotId) => {
    if (!plotId) return;
    const p = await Plot.findById(plotId);
    if (p && p.status !== 'Registered' && p.status !== 'Available') {
      p.status = 'Available';
      p.bookedBy = undefined;
      p.pendingApproval = undefined;
      p.registrationDate = undefined;
      await p.save();
    }
  };

  // plotId changed or cleared: free the previously linked plot (transfer, not additive).
  if (previousPlotId && previousPlotId !== currentPlotId) {
    try {
      await releasePlot(previousPlotId);
    } catch (e) {
      console.error('Error auto-syncing old plot status to Available:', e);
    }
  }

  // Keep plotIds[] in sync with an explicit primary plotId change.
  if (req.body.plotId !== undefined && previousPlotId !== currentPlotId) {
    try {
      if (previousPlotId && mongoose.Types.ObjectId.isValid(previousPlotId)) {
        await Lead.updateOne({ _id: lead._id }, { $pull: { plotIds: previousPlotId } });
      }
      if (currentPlotId && mongoose.Types.ObjectId.isValid(currentPlotId)) {
        await Lead.updateOne({ _id: lead._id }, { $addToSet: { plotIds: currentPlotId } });
      }
    } catch (e) {
      console.error('Error syncing lead plotIds on plotId transfer:', e);
    }
  }

  // Lead is Customer with a plot: ensure the (possibly newly assigned) plot is Booked.
  if (isCustomer && currentPlotId) {
    try {
      const p = await Plot.findById(currentPlotId);
      if (p && ['Available', 'Canceled'].includes(p.status)) {
        p.status = 'Booked';
        p.bookedBy = p.bookedBy || { name: lead.customerName, phone: lead.phone, type: 'customer' };
        await p.save();
      }
    } catch (e) {
      console.error('Error auto-syncing plot status to Booked:', e);
    }
  }

  // Lead moved out of Customer: free the linked plot.
  if (!isCustomer && previousStatus === 'Customer' && currentPlotId) {
    try {
      await releasePlot(currentPlotId);
    } catch (e) {
      console.error('Error auto-syncing plot status to Available:', e);
    }
  }

  if (allowedFields.status && allowedFields.status !== previousStatus) {
    try {
      await ActivityLog.create({
        actorId: req.user ? req.user.id : null,
        actorName: req.user ? req.user.name : 'System',
        actorRole: req.user ? req.user.role : 'system',
        actorInitials: req.user ? req.user.initials : 'SYS',
        actionType: 'Status Change',
        action: `Status changed from ${previousStatus} to ${allowedFields.status}`,
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
      actorId: req.user ? req.user.id : null,
      actorName: req.user ? req.user.name : 'System',
      actorRole: req.user ? req.user.role : 'system',
      actorInitials: req.user ? req.user.initials : 'SYS',
      actionType: 'Deleted',
      action: `Deleted lead ${deletedName}`,
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
      assignedToDisplayId: { $first: '$assignedToDisplayId' },
      projectId: { $first: '$projectId' },
      nextFollowUpDateLead: { $first: '$nextFollowUpDate' },
      followUps: { $first: '$followUps' }
    }
  };

  // 5. FollowUp-level match
  const followUpMatch = {};
  const andConditions = [];

  if (search) {
    const rawSearch = String(search).trim();
    const escapedSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const orConditions = [
      { customerName: { $regex: escapedSearch, $options: 'i' } },
      { 'followUps.notes': { $regex: escapedSearch, $options: 'i' } },
      { assignedToName: { $regex: escapedSearch, $options: 'i' } },
    ];

    // Check if query is an explicit Lead or Customer ID: "L-7", "C-7", "cust-7", "customer 7", etc.
    const leadIdMatch = rawSearch.match(/^(?:l|c|cust|customer)[\s-]*(\d+)$/i);
    const staffIdMatch = rawSearch.match(/^(?:staff|emp)[\s-]*(\d+)$/i);
    const pureNumMatch = rawSearch.match(/^0*(\d+)$/);

    if (leadIdMatch) {
      const num = parseInt(leadIdMatch[1], 10);
      orConditions.push({ displayId: `L-${num}` });
    } else if (staffIdMatch) {
      const num = parseInt(staffIdMatch[1], 10);
      orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
      orConditions.push({ displayId: `STAFF-${num}` });
      orConditions.push({ assignedToDisplayId: `EMP${String(num).padStart(3, '0')}` });
    } else if (pureNumMatch) {
      const num = parseInt(pureNumMatch[1], 10);
      orConditions.push({ displayId: `L-${num}` });
      orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
      orConditions.push({ phone: { $regex: escapedSearch, $options: 'i' } });
    } else {
      // General text query (name, partial ID, phone, etc.)
      orConditions.push({ displayId: { $regex: escapedSearch, $options: 'i' } });
      orConditions.push({ assignedToDisplayId: { $regex: escapedSearch, $options: 'i' } });
      orConditions.push({ phone: { $regex: escapedSearch, $options: 'i' } });
    }

    andConditions.push({ $or: orConditions });
  }

  // Date filtering logic
  let dateQuery = null;
  const todayStr = getTodayDateStringIST();

  if (date === 'today') {
    dateQuery = { $gte: todayStr, $lte: todayStr + '\uffff' };
  } else if (date === 'yesterday') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yStr = y.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    dateQuery = { $gte: yStr, $lte: yStr + '\uffff' };
  } else if (date === 'tomorrow') {
    const tm = new Date();
    tm.setDate(tm.getDate() + 1);
    const tmStr = tm.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    dateQuery = { $gte: tmStr, $lte: tmStr + '\uffff' };
  } else if (date === 'week') {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const startStr = sevenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
    outcomeMatch = isPositiveOutcome;
  } else if (outcome === 'negative') {
    outcomeMatch = isNegativeOutcome;
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
              staffDisplayId: '$assignedToDisplayId',
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
            $match: isPositiveOutcome,
          },
          { $count: 'count' }
        ],
        statsNegative: [
          {
            $match: isNegativeOutcome,
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