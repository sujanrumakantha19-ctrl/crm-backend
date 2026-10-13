const Lead = require('../models/Lead');

/**
 * Count distinct customers by unique identity:
 * - Valid phone number (excluding placeholder '0000000000', 'N/A', '-', and empty strings)
 * - Trimmed lowercase customerName when phone is missing or placeholder
 */
async function countUniqueCustomers(matchCriteria = {}) {
  const result = await Lead.aggregate([
    { $match: matchCriteria },
    {
      $project: {
        identityKey: {
          $let: {
            vars: {
              rawPhone: { $ifNull: ['$phone', ''] },
              rawName: { $trim: { input: { $toLower: { $ifNull: ['$customerName', ''] } } } },
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
                { $concat: ['n:', '$$rawName'] },
              ],
            },
          },
        },
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

module.exports = {
  countUniqueCustomers,
};
