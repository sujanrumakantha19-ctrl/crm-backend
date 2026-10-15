const mongoose = require('mongoose');
const mongoSanitize = require('mongo-sanitize');
const { buildLeadSearchConditions } = require('./customerMetrics');

/**
 * Build a Lead MongoDB filter from export/list query params (matches GET /leads filters).
 */
function buildLeadExportFilter(rawQuery = {}, defaults = {}, reqUser = null) {
  const query = mongoSanitize({ ...rawQuery });
  const filter = { ...defaults };

  // Staff ownership scoping
  if (reqUser && reqUser.role === 'staff') {
    const staffUid = String(reqUser.id || reqUser._id || '');
    if (query.assignedTo !== 'unassigned') {
      filter.assignedTo = new mongoose.Types.ObjectId(staffUid);
    }
  }

  if (query.status && query.status !== 'All') {
    filter.status = query.status;
  }
  if (query.paymentMethod && query.paymentMethod !== 'All') {
    filter.paymentMethod = query.paymentMethod;
  }
  if (query.bank) {
    filter.bank = query.bank;
  }
  if (query.projectId && mongoose.Types.ObjectId.isValid(String(query.projectId))) {
    filter.projectId = new mongoose.Types.ObjectId(String(query.projectId));
  }
  if (query.paymentStatus) {
    filter.paymentStatus = query.paymentStatus;
  }
  if (query.loanStage) {
    filter.loanStage = query.loanStage;
  }
  if (query.assignedToName) {
    filter.assignedToName = query.assignedToName;
  }
  if (!filter.assignedTo) {
    if (query.assignedTo === 'unassigned') {
      filter.assignedTo = { $in: [null, undefined] };
    } else if (query.assignedTo && mongoose.Types.ObjectId.isValid(String(query.assignedTo))) {
      filter.assignedTo = new mongoose.Types.ObjectId(String(query.assignedTo));
    }
  }

  if (query.search && String(query.search).trim()) {
    const searchConditions = buildLeadSearchConditions(String(query.search).trim());
    if (searchConditions.length > 0) {
      if (filter.$or) {
        filter.$and = filter.$and || [];
        filter.$and.push({ $or: filter.$or }, { $or: searchConditions });
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }
  }

  const gte = query['createdAt[gte]'] || (query.createdAt && query.createdAt.$gte);
  const lte = query['createdAt[lte]'] || (query.createdAt && query.createdAt.$lte);
  if (gte || lte) {
    filter.createdAt = {};
    if (gte) filter.createdAt.$gte = new Date(gte);
    if (lte) filter.createdAt.$lte = new Date(lte);
  }

  return filter;
}

module.exports = { buildLeadExportFilter };
