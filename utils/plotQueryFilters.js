/**
 * Apply payment-status filter for plot list queries (Registrations, exports).
 * @param {object} query - Mongoose query object (mutated)
 * @param {string|undefined} filterValue - e.g. 'Pending Payment', 'Fully Paid', 'All'
 */
function applyPlotPaymentStatusFilter(query, filterValue) {
  if (!filterValue || filterValue === 'All') return query;

  const pendingExpr = {
    $expr: {
      $ne: [
        { $ifNull: ['$bookedBy.paymentStatus', { $ifNull: ['$paymentStatus', 'Not Paid'] }] },
        'Fully Paid',
      ],
    },
  };

  const clause = filterValue === 'Pending Payment' || filterValue === 'Not Fully Paid'
    ? pendingExpr
    : { 'bookedBy.paymentStatus': filterValue };

  if (clause.$expr) {
    if (query.$expr) {
      query.$and = query.$and || [];
      query.$and.push({ $expr: query.$expr });
      delete query.$expr;
      query.$and.push(clause);
    } else {
      query.$expr = clause.$expr;
    }
    return query;
  }

  if (query.$and) {
    query.$and.push(clause);
  } else {
    Object.assign(query, clause);
  }
  return query;
}

module.exports = { applyPlotPaymentStatusFilter };
