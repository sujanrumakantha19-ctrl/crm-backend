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
  if (req.query.search && searchFields && searchFields.length > 0) {
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
  const total = await model.countDocuments(parsedQuery);

  const useProjectStatusPriority =
    req.query.sort === 'statusPriority' && model.modelName === 'Project';

  let results;

  if (useProjectStatusPriority) {
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