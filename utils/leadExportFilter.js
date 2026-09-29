const mongoose = require('mongoose');
const mongoSanitize = require('mongo-sanitize');

/**
 * Build a Lead MongoDB filter from export/list query params (matches GET /leads filters).
 */
function buildLeadExportFilter(query, defaults = {}) {
  const filter = { ...defaults };

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
    filter.projectId = query.projectId;
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
  if (query.assignedTo === 'unassigned') {
    filter.assignedTo = { $in: [null, undefined] };
  } else if (query.assignedTo && mongoose.Types.ObjectId.isValid(String(query.assignedTo))) {
    filter.assignedTo = query.assignedTo;
  }

  if (query.search && String(query.search).trim()) {
    const escaped = String(query.search)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.customerName = { $regex: escaped, $options: 'i' };
  }

  const gte = query['createdAt[gte]'];
  const lte = query['createdAt[lte]'];
  if (gte || lte) {
    filter.createdAt = {};
    if (gte) filter.createdAt.$gte = new Date(gte);
    if (lte) filter.createdAt.$lte = new Date(lte);
  }

  return mongoSanitize(filter);
}

module.exports = { buildLeadExportFilter };
