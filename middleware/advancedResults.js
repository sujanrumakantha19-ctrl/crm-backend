const asyncHandler = require('./async');
const ErrorResponse = require('../utils/errorResponse');
const mongoSanitize = require('mongo-sanitize');
const mongoose = require('mongoose');

const advancedResults = (model, populate, searchFields = []) => asyncHandler(async (req, res, next) => {
  let query;

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = ['select', 'sort', 'page', 'limit', 'search'];

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

  // Search
  if (req.query.search && searchFields && searchFields.length > 0) {
    const rawSearch = req.query.search.trim();
    const escapedSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const orConditions = searchFields.map(field => ({
      [field]: { $regex: escapedSearch, $options: 'i' }
    }));

    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      orConditions.push({ _id: rawSearch });
    }

    // If searchFields includes displayId, enable smart ID resolution (e.g. searching "1" matches "PROJ-1")
    if (searchFields.includes('displayId')) {
      const numMatch = rawSearch.match(/^0*(\d+)$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        orConditions.push({ displayId: `PROJ-${num}` });
        orConditions.push({ displayId: `L-${num}` });
        orConditions.push({ displayId: `CP-${num}` });
        orConditions.push({ displayId: `STAFF-${num}` });
      }

      const projMatch = rawSearch.match(/^proj[\s-]*(\d+)$/i);
      if (projMatch) {
        const num = parseInt(projMatch[1], 10);
        orConditions.push({ displayId: `PROJ-${num}` });
      }

      const leadMatch = rawSearch.match(/^l[\s-]*(\d+)$/i);
      if (leadMatch) {
        const num = parseInt(leadMatch[1], 10);
        orConditions.push({ displayId: `L-${num}` });
      }

      const cpMatch = rawSearch.match(/^cp[\s-]*(\d+)$/i);
      if (cpMatch) {
        const num = parseInt(cpMatch[1], 10);
        orConditions.push({ displayId: `CP-${num}` });
      }
    }

    parsedQuery.$or = orConditions;
  }

  // Apply assignedTo override (unassigned / assigned sentinel values)
  if (assignedToOverride !== null) {
    parsedQuery.assignedTo = assignedToOverride;
  }

  // Finding resource
  query = model.find(parsedQuery);

  // Select fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    query = query.select(fields);
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await model.countDocuments(parsedQuery);

  query = query.skip(startIndex).limit(limit);

  if (populate) {
    query = query.populate(populate);
  }

  // Executing query
  const results = await query;

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