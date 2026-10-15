const ErrorResponse = require('../utils/errorResponse');

const SCALAR_QUERY_PARAMS = [
  'search',
  'bank',
  'paymentMethod',
  'paymentStatusFilter',
  'loanStageFilter',
  'projectId',
  'bookedByUserId',
  'dateFrom',
  'dateTo',
  'sort',
  'groupBy',
  'status',
  'page',
  'limit',
];

/**
 * Validates that specified plot query parameters are scalar strings.
 * Rejects repeated query parameters (arrays) and objects with HTTP 400.
 */
const validatePlotQueryParams = (req, res, next) => {
  for (const param of SCALAR_QUERY_PARAMS) {
    const val = req.query[param];
    if (val !== undefined && val !== null) {
      if (typeof val !== 'string') {
        return next(
          new ErrorResponse(
            `Query parameter '${param}' must be a scalar string`,
            400
          )
        );
      }
    }
  }
  next();
};

module.exports = validatePlotQueryParams;
