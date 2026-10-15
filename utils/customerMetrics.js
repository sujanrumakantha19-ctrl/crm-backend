const Lead = require('../models/Lead');

/**
 * Identity expression for deduplicating customers:
 * 1. Normalized valid phone number (excluding placeholder '0000000000', 'N/A', '-', and empty strings)
 * 2. Trimmed lowercase non-empty customerName when phone is missing or placeholder
 * 3. Document _id fallback when neither is available so distinct blank records do not collapse
 */
function getCustomerIdentityExpression() {
  return {
    $let: {
      vars: {
        rawPhone: { $ifNull: ['$phone', ''] },
        rawName: { $trim: { input: { $toLower: { $ifNull: ['$customerName', ''] } } } },
        recordId: { $toString: '$_id' },
      },
      in: {
        $cond: [
          {
            $and: [
              { $ne: ['$$rawPhone', ''] },
              { $ne: ['$$rawPhone', '0000000000'] },
              { $ne: ['$$rawPhone', 'N/A'] },
              { $ne: ['$$rawPhone', '-'] },
            ],
          },
          { $concat: ['p:', '$$rawPhone'] },
          {
            $cond: [
              { $ne: ['$$rawName', ''] },
              { $concat: ['n:', '$$rawName'] },
              { $concat: ['id:', '$$recordId'] },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Count distinct customers by unique identity
 */
async function countUniqueCustomers(matchCriteria = {}) {
  const result = await Lead.aggregate([
    { $match: matchCriteria },
    {
      $project: {
        identityKey: getCustomerIdentityExpression(),
      },
    },
    {
      $group: {
        _id: '$identityKey',
      },
    },
    {
      $count: 'totalUnique',
    },
  ]);
  return result[0]?.totalUnique || 0;
}

/**
 * Identity expression for deduplicating plot buyers in operations and plot queries:
 * 1. Normalized valid phone number on bookedBy.phone (excluding placeholder '0000000000', 'N/A', '-', and empty strings)
 * 2. Trimmed lowercase non-empty bookedBy.name when phone is missing or placeholder
 * 3. Plot _id fallback when neither is available so distinct blank plots do not collapse
 */
function getPlotBuyerIdentityExpression() {
  return {
    $let: {
      vars: {
        rawPhone: { $trim: { input: { $ifNull: ['$bookedBy.phone', ''] } } },
        rawName: { $trim: { input: { $toLower: { $ifNull: ['$bookedBy.name', ''] } } } },
        plotId: { $toString: '$_id' },
      },
      in: {
        $cond: [
          {
            $and: [
              { $ne: ['$$rawPhone', ''] },
              { $ne: ['$$rawPhone', '0000000000'] },
              { $ne: ['$$rawPhone', 'N/A'] },
              { $ne: ['$$rawPhone', '-'] },
            ],
          },
          { $concat: ['p:', '$$rawPhone'] },
          {
            $cond: [
              { $ne: ['$$rawName', ''] },
              { $concat: ['n:', '$$rawName'] },
              { $concat: ['plot:', '$$plotId'] },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Build unified search $or conditions for Leads
 */
function buildLeadSearchConditions(rawSearch) {
  if (!rawSearch || typeof rawSearch !== 'string' || !rawSearch.trim()) {
    return [];
  }
  const search = rawSearch.trim();
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexibleSearch = escapedSearch.split('').join('\\s*');

  const orConditions = [
    { customerName: { $regex: flexibleSearch, $options: 'i' } },
    { phone: { $regex: escapedSearch, $options: 'i' } },
    { displayId: { $regex: escapedSearch, $options: 'i' } },
    { assignedToName: { $regex: flexibleSearch, $options: 'i' } },
    { assignedToDisplayId: { $regex: escapedSearch, $options: 'i' } },
    { email: { $regex: escapedSearch, $options: 'i' } },
    { bank: { $regex: escapedSearch, $options: 'i' } },
    { bankFollowerName: { $regex: flexibleSearch, $options: 'i' } },
    { bankFollowerPhone: { $regex: escapedSearch, $options: 'i' } },
    { city: { $regex: escapedSearch, $options: 'i' } },
    { source: { $regex: escapedSearch, $options: 'i' } },
    { sourceType: { $regex: escapedSearch, $options: 'i' } },
  ];

  const mongoose = require('mongoose');
  if (mongoose.Types.ObjectId.isValid(search)) {
    orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
  }

  const numMatch = search.match(/^0*(\d+)$/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    orConditions.push({ displayId: `L-${num}` });
    orConditions.push({ displayId: `PROJ-${num}` });
    orConditions.push({ displayId: `STAFF-${num}` });
    orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
  }

  const leadOrCustMatch = search.match(/^(?:l|c|cust|customer)[\s-]*(\d+)$/i);
  if (leadOrCustMatch) {
    const num = parseInt(leadOrCustMatch[1], 10);
    orConditions.push({ displayId: `L-${num}` });
  }

  const staffMatch = search.match(/^(?:staff|emp)[\s-]*(\d+)$/i);
  if (staffMatch) {
    const num = parseInt(staffMatch[1], 10);
    orConditions.push({ assignedToDisplayId: `STAFF-${num}` });
  }

  return orConditions;
}

module.exports = {
  countUniqueCustomers,
  getCustomerIdentityExpression,
  getPlotBuyerIdentityExpression,
  buildLeadSearchConditions,
};
