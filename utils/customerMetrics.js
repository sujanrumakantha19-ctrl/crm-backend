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

module.exports = {
  countUniqueCustomers,
  getCustomerIdentityExpression,
  getPlotBuyerIdentityExpression,
};
