const asyncHandler = require('./async');
const ErrorResponse = require('../utils/errorResponse');
const mongoSanitize = require('mongo-sanitize');
const mongoose = require('mongoose');
const { applyPlotPaymentStatusFilter } = require('../utils/plotQueryFilters');

const advancedResults = (model, populate, searchFields = []) => asyncHandler(async (req, res, next) => {
  let query;

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = ['select', 'sort', 'page', 'limit', 'search', 'paymentStatusFilter', 'groupBy'];

  // Handle special assignedTo sentinel values BEFORE building queryStr
  // so they never get passed as literal strings to Mongoose ObjectId fields
  let assignedToOverride = null;
  if (reqQuery.assignedTo === 'unassigned') {
    assignedToOverride = { $in: [null, undefined] };
    delete reqQuery.assignedTo;
  } else if (reqQuery.assignedTo === 'assigned') {
    assignedToOverride = { $exists: true, $ne: null };
    delete reqQuery.assignedTo;
  }

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach((param) => delete reqQuery[param]);

  // Create query string
  let queryStr = JSON.stringify(reqQuery);

  // Create operators ($gt, $gte, etc.)
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);

  let parsedQuery;
  try {
    parsedQuery = JSON.parse(queryStr);
  } catch (e) {
    // If JSON parsing fails, return empty query instead of crashing
    parsedQuery = {};
  }

  // Sanitize against NoSQL injection
  parsedQuery = mongoSanitize(parsedQuery);

  // Handle special hasExpectedDate query filter
  if (parsedQuery.hasExpectedDate === 'true' || parsedQuery.hasExpectedDate === true) {
    delete parsedQuery.hasExpectedDate;
    parsedQuery.$and = parsedQuery.$and || [];
    parsedQuery.$and.push({
      expectedRegistrationDate: { $ne: null, $exists: true, $ne: '' }
    });
  }

  // Normalize bracket notation query keys (e.g. "registrationDate[gte]" or "registrationDate[$gte]") into nested object { registrationDate: { $gte: val } }
  Object.keys(parsedQuery).forEach(key => {
    const match = key.match(/^([^\[]+)\[\$?(gte|gt|lte|lt|in|ne)\]$/);
    if (match) {
      const field = match[1];
      const op = `$${match[2]}`;
      const val = parsedQuery[key];
      delete parsedQuery[key];

      if (!parsedQuery[field] || typeof parsedQuery[field] !== 'object') {
        parsedQuery[field] = {};
      }
      parsedQuery[field][op] = val;
    }
  });

  // Convert comma-separated string values for $in operators into arrays
  Object.keys(parsedQuery).forEach(key => {
    if (parsedQuery[key] && parsedQuery[key].$in && typeof parsedQuery[key].$in === 'string') {
      parsedQuery[key].$in = parsedQuery[key].$in.split(',').map(s => s.trim());
    }
  });

  // Handle string date range bounds for registrationDate and expectedRegistrationDate
  ['registrationDate', 'expectedRegistrationDate', 'createdAt'].forEach(field => {
    if (parsedQuery[field] && typeof parsedQuery[field] === 'object') {
      if (parsedQuery[field].$lte && typeof parsedQuery[field].$lte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsedQuery[field].$lte)) {
        parsedQuery[field].$lte = `${parsedQuery[field].$lte}\uffff`;
      }
    }
  });

  // Defensive fallback: map status Open to match legacy Lead status if any
  if (model.modelName === 'Lead' && parsedQuery.status === 'Open') {
    parsedQuery.status = { $in: ['Open', 'Lead'] };
  }

  // Search
  if (req.query.search && model.modelName === 'Lead') {
    const { buildLeadSearchConditions } = require('../utils/customerMetrics');
    const conditions = buildLeadSearchConditions(req.query.search);
    if (conditions.length > 0) {
      parsedQuery.$or = conditions;
    }
  } else if (req.query.search && searchFields && searchFields.length > 0) {
    const rawSearch = req.query.search.trim();
    const escapedSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Flexible space matching (BUG-17): e.g. "templecity" matches "Temple City"
    const flexibleSearch = escapedSearch.split('').join('\\s*');
    
    const orConditions = searchFields.map(field => ({
      [field]: { $regex: flexibleSearch, $options: 'i' }
    }));

    if (req.plotLeadSearchIds?.length) {
      orConditions.push({ 'bookedBy.leadId': { $in: req.plotLeadSearchIds } });
      orConditions.push({ 'pendingApproval.leadId': { $in: req.plotLeadSearchIds } });
    }
    if (req.plotLeadSearchPlotIds?.length) {
      orConditions.push({ _id: { $in: req.plotLeadSearchPlotIds } });
    }
    if (req.plotStaffUserIds?.length) {
      orConditions.push({ assignedTo: { $in: req.plotStaffUserIds } });
      orConditions.push({ 'bookedBy.staffId': { $in: req.plotStaffUserIds } });
    }
    if (req.plotStaffDisplayIds?.length) {
      orConditions.push({ 'bookedBy.staffDisplayId': { $in: req.plotStaffDisplayIds } });
    }

    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      orConditions.push({ _id: rawSearch });
    }

    // Smart ID resolution for displayId, assignedToDisplayId, and bookedBy.staffDisplayId
    const hasDisplayId = searchFields.includes('displayId');
    const hasAssignedToDisplayId = searchFields.includes('assignedToDisplayId');
    const hasStaffDisplayId = searchFields.includes('bookedBy.staffDisplayId');

    if (hasDisplayId || hasAssignedToDisplayId || hasStaffDisplayId) {
      const numMatch = rawSearch.match(/^0*(\d+)$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (hasDisplayId) {
          orConditions.push({ displayId: `PROJ-${num}` });
          orConditions.push({ displayId: `L-${num}` });
          orConditions.push({ displayId: `CP-${num}` });
          orConditions.push({ displayId: `STAFF-${num}` });
        }
        if (hasAssignedToDisplayId) {
          orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
        }
        if (hasStaffDisplayId) {
          orConditions.push({ 'bookedBy.staffDisplayId': `STAFF-${num}` });
        }
      }

      const projMatch = rawSearch.match(/^proj[\s-]*(\d+)$/i);
      if (projMatch && hasDisplayId) {
        const num = parseInt(projMatch[1], 10);
        orConditions.push({ displayId: `PROJ-${num}` });
      }

      // Match Lead / Customer ID: "L-12", "C-12", "cust-12", "customer-12", "l 12", "c 12"
      const leadOrCustMatch = rawSearch.match(/^(?:l|c|cust|customer)[\s-]*(\d+)$/i);
      if (leadOrCustMatch && hasDisplayId) {
        const num = parseInt(leadOrCustMatch[1], 10);
        orConditions.push({ displayId: `L-${num}` });
      }

      const cpMatch = rawSearch.match(/^cp[\s-]*(\d+)$/i);
      if (cpMatch && hasDisplayId) {
        const num = parseInt(cpMatch[1], 10);
        orConditions.push({ displayId: `CP-${num}` });
      }

      const staffMatch = rawSearch.match(/^staff[\s-]*(\d+)$/i);
      if (staffMatch) {
        const num = parseInt(staffMatch[1], 10);
        if (hasDisplayId) {
          orConditions.push({ displayId: `STAFF-${num}` });
        }
        if (hasAssignedToDisplayId) {
          orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
        }
        if (hasStaffDisplayId) {
          orConditions.push({ 'bookedBy.staffDisplayId': `STAFF-${num}` });
        }
      }

      const empMatch = rawSearch.match(/^emp[\s-]*(\d+)$/i);
      if (empMatch) {
        const num = parseInt(empMatch[1], 10);
        if (searchFields.includes('employeeId')) {
          orConditions.push({ employeeId: `EMP${String(num).padStart(3, '0')}` });
          orConditions.push({ employeeId: `EMP-${num}` });
          orConditions.push({ employeeId: `EMP${num}` });
        }
        if (hasDisplayId) {
          orConditions.push({ displayId: `STAFF-${num}` });
        }
        if (hasAssignedToDisplayId) {
          orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
        }
        if (hasStaffDisplayId) {
          orConditions.push({ 'bookedBy.staffDisplayId': `STAFF-${num}` });
        }
      }
    }

    parsedQuery.$or = orConditions;
  }

  // Apply assignedTo override (unassigned / assigned sentinel values)
  if (assignedToOverride !== null) {
    parsedQuery.assignedTo = assignedToOverride;
  }

  if (req.query.paymentStatusFilter) {
    applyPlotPaymentStatusFilter(parsedQuery, String(req.query.paymentStatusFilter));
  }

  // Schema type casting and validation for Lead queries
  if (model.modelName === 'Lead') {
    // Enforce authenticated staff scoping
    if (req.user && req.user.role === 'staff') {
      const staffUid = String(req.user.id || req.user._id || '');
      if (req.query.assignedTo && req.query.assignedTo !== 'unassigned') {
        if (String(req.query.assignedTo) !== staffUid) {
          return next(new ErrorResponse('Staff members are only authorized to access their own assigned leads', 403));
        }
      }
      // If not querying the Open Leads Pool, default to staff's own assigned leads
      if (!req.query.assignedTo && req.query.status !== 'Open' && parsedQuery.assignedTo === undefined) {
        parsedQuery.assignedTo = new mongoose.Types.ObjectId(staffUid);
      }
    }

    // Cast ObjectId fields
    const objectIdFields = ['assignedTo', 'projectId', 'plotId', 'sourceId', '_id'];
    for (const field of objectIdFields) {
      const val = parsedQuery[field];
      if (val !== undefined && val !== null) {
        if (typeof val === 'string') {
          if (!mongoose.Types.ObjectId.isValid(val)) {
            return next(new ErrorResponse(`Invalid ObjectId format for ${field}`, 400));
          }
          parsedQuery[field] = new mongoose.Types.ObjectId(val);
        } else if (val && typeof val === 'object' && Array.isArray(val.$in)) {
          for (let i = 0; i < val.$in.length; i++) {
            const item = val.$in[i];
            if (item !== null && item !== undefined && typeof item === 'string') {
              if (!mongoose.Types.ObjectId.isValid(item)) {
                return next(new ErrorResponse(`Invalid ObjectId format in $in for ${field}`, 400));
              }
              val.$in[i] = new mongoose.Types.ObjectId(item);
            }
          }
        }
      }
    }

    // Cast Date fields for aggregation
    ['createdAt', 'updatedAt', 'dateAdded'].forEach(field => {
      if (parsedQuery[field] && typeof parsedQuery[field] === 'object') {
        ['$gte', '$gt'].forEach(op => {
          if (parsedQuery[field][op] && typeof parsedQuery[field][op] === 'string') {
            const d = new Date(parsedQuery[field][op]);
            if (!isNaN(d.getTime())) parsedQuery[field][op] = d;
          }
        });
        ['$lte', '$lt'].forEach(op => {
          if (parsedQuery[field][op] && typeof parsedQuery[field][op] === 'string') {
            let s = parsedQuery[field][op];
            if (s.endsWith('\uffff')) s = s.slice(0, -1);
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T23:59:59.999Z`;
            const d = new Date(s);
            if (!isNaN(d.getTime())) parsedQuery[field][op] = d;
          }
        });
      }
    });
  }

  // Finding resource
  query = model.find(parsedQuery);

  // Select fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    query = query.select(fields);
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  const useProjectStatusPriority =
    req.query.sort === 'statusPriority' && model.modelName === 'Project';

  const useLeadCustomerGrouping =
    model.modelName === 'Lead' &&
    (req.query.groupBy === 'customer' || (req.query.status === 'Customer' && req.query.groupBy !== 'none'));

  let total;
  let results;

  if (useLeadCustomerGrouping) {
    const { getCustomerIdentityExpression } = require('../utils/customerMetrics');
    const groupKeyExpr = (req.query.status === 'Customer')
      ? getCustomerIdentityExpression()
      : {
          $cond: [
            { $eq: ['$status', 'Customer'] },
            getCustomerIdentityExpression(),
            { $concat: ['lead:', { $toString: '$_id' }] }
          ]
        };

    const sortStage = (req.query.sort === 'createdAt' || req.query.sort === 'dateAdded')
      ? { latestCreatedAt: 1, _id: 1 }
      : { latestCreatedAt: -1, _id: 1 };

    const aggResult = await model.aggregate([
      { $match: parsedQuery },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: groupKeyExpr,
          firstDoc: { $first: '$$ROOT' },
          latestCreatedAt: { $first: { $ifNull: ['$createdAt', '$dateAdded'] } },
          relatedBookingCount: { $sum: 1 },
          relatedLeadDisplayIds: { $addToSet: '$displayId' },
          relatedLeadIds: { $addToSet: '$_id' },
        }
      },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $sort: sortStage },
            { $skip: startIndex },
            { $limit: limit },
          ]
        }
      }
    ]);

    total = aggResult[0]?.metadata[0]?.total || 0;
    const rawGroups = aggResult[0]?.data || [];

    const docs = rawGroups.map(g => {
      const doc = g.firstDoc;
      doc.id = String(doc._id);
      doc.relatedBookingCount = g.relatedBookingCount;
      doc.plotBookingCount = g.relatedBookingCount;
      doc.relatedLeadDisplayIds = (g.relatedLeadDisplayIds || []).filter(Boolean);
      doc.relatedLeadIds = (g.relatedLeadIds || []).map(id => String(id));
      doc.groupedLeadIds = doc.relatedLeadIds;
      if (!doc.assignedTo && g.assignedTo) doc.assignedTo = g.assignedTo;
      if (!doc.assignedToName && g.assignedToName) doc.assignedToName = g.assignedToName;
      if (!doc.assignedToDisplayId && g.assignedToDisplayId) doc.assignedToDisplayId = g.assignedToDisplayId;
      return doc;
    });

    if (populate && docs.length > 0) {
      await model.populate(docs, populate);
    }

    results = docs;
  } else if (useProjectStatusPriority) {
    total = await model.countDocuments(parsedQuery);
    const statusRankSwitch = {
      $switch: {
        branches: [
          { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'active'] }, then: 1 },
          { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'on hold'] }, then: 2 },
          { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'upcoming'] }, then: 3 },
          { case: { $eq: [{ $toLower: { $ifNull: ['$status', ''] } }, 'completed'] }, then: 4 },
        ],
        default: 99,
      },
    };

    const aggPage = await model.aggregate([
      { $match: parsedQuery },
      { $addFields: { statusRank: statusRankSwitch } },
      { $sort: { statusRank: 1, createdAt: -1, _id: 1 } },
      { $skip: startIndex },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]);

    const ids = aggPage.map((row) => row._id);
    if (ids.length === 0) {
      results = [];
    } else {
      let docQuery = model.find({ _id: { $in: ids } });
      if (req.query.select) {
        const fields = req.query.select.split(',').join(' ');
        docQuery = docQuery.select(fields);
      }
      if (populate) {
        docQuery = docQuery.populate(populate);
      }
      const docs = await docQuery;
      const byId = new Map(docs.map((d) => [String(d._id), d]));
      results = ids.map((id) => byId.get(String(id))).filter(Boolean);
    }
  } else {
    total = await model.countDocuments(parsedQuery);
    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    query = query.skip(startIndex).limit(limit);

    if (populate) {
      query = query.populate(populate);
    }

    results = await query;
  }

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit,
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit,
    };
  }

  res.advancedResults = {
    success: true,
    count: results.length,
    total,
    pagination,
    data: results,
  };

  next();
});

module.exports = advancedResults;