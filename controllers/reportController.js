const asyncHandler = require('../middleware/async');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const Plot = require('../models/Plot');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const ChannelPartner = require('../models/ChannelPartner');
const ErrorResponse = require('../utils/errorResponse');
const { countUniqueCustomers, getCustomerIdentityExpression, getPlotBuyerIdentityExpression } = require('../utils/customerMetrics');

// Calendar validation
function isValidCalendarDate(y, m, d) {
  if (m < 1 || m > 12) return false;
  if (d < 1) return false;
  const isLeap = (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m - 1];
}

function parseAndValidateDateString(str, paramName, strict = false) {
  if (str === undefined || str === null || str === '') return null;
  if (typeof str !== 'string') {
    if (strict) throw new ErrorResponse(`Invalid ${paramName} parameter`, 400);
    return null;
  }
  const trimmed = str.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    if (strict) throw new ErrorResponse(`Invalid ${paramName} date format (must be YYYY-MM-DD)`, 400);
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), str: trimmed.slice(0, 10) };
  }
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (y < 1900 || y > 2100) {
    if (strict) throw new ErrorResponse(`Year for ${paramName} must be between 1900 and 2100`, 400);
    return null;
  }
  if (!isValidCalendarDate(y, m, d)) {
    if (strict) throw new ErrorResponse(`Invalid calendar date for ${paramName}: ${trimmed}`, 400);
    return null;
  }
  return { y, m, d, str: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

// Convert Asia/Kolkata (IST = UTC+5:30) date components to UTC Date
function istStartOfDay(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 19800000);
}

function istEndOfDay(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 19800000);
}

// Unified period normalizer supporting strict admin-report mode and legacy compatibility
function normalizeReportPeriod(query = {}) {
  const reportView = query.reportView;
  const isStrict = reportView === 'admin';

  if (reportView && reportView !== 'admin') {
    throw new ErrorResponse(`Unknown reportView: ${reportView}`, 400);
  }

  // Reject repeated query parameters in strict mode
  if (isStrict) {
    if (
      Array.isArray(query.dateFrom) ||
      Array.isArray(query.dateTo) ||
      Array.isArray(query.month) ||
      Array.isArray(query.year) ||
      Array.isArray(query.reportView)
    ) {
      throw new ErrorResponse('Repeated query parameters are not allowed', 400);
    }
  }

  const { dateFrom, dateTo, month, year } = query;

  // Validate month syntax and range if supplied
  let mNum = null;
  if (month !== undefined && month !== null && month !== '') {
    const mStr = String(month).trim();
    if (!/^\d{1,2}$/.test(mStr)) {
      if (isStrict) throw new ErrorResponse('Invalid month parameter (must be 1-12)', 400);
    } else {
      mNum = parseInt(mStr, 10);
      if (mNum < 1 || mNum > 12) {
        if (isStrict) throw new ErrorResponse('Invalid month parameter (must be 1-12)', 400);
        mNum = null;
      }
    }
  }

  // Validate year syntax and range if supplied
  let yNum = null;
  if (year !== undefined && year !== null && year !== '') {
    const yStr = String(year).trim();
    if (!/^\d{4}$/.test(yStr)) {
      if (isStrict) throw new ErrorResponse('Invalid year parameter (must be 4-digit year 1900-2100)', 400);
    } else {
      yNum = parseInt(yStr, 10);
      if (yNum < 1900 || yNum > 2100) {
        if (isStrict) throw new ErrorResponse('Invalid year parameter', 400);
        yNum = null;
      }
    }
  }

  const parsedFrom = parseAndValidateDateString(dateFrom, 'dateFrom', isStrict);
  const parsedTo = parseAndValidateDateString(dateTo, 'dateTo', isStrict);

  if (parsedFrom && parsedTo && parsedFrom.str > parsedTo.str) {
    if (isStrict) {
      throw new ErrorResponse('dateFrom must be before or equal to dateTo', 400);
    }
  }

  let startDate = null;
  let endDate = null;
  let startDateStr = null;
  let endDateStr = null;

  if (parsedFrom) {
    startDateStr = parsedFrom.str;
    startDate = istStartOfDay(parsedFrom.y, parsedFrom.m, parsedFrom.d);
  }
  if (parsedTo) {
    endDateStr = parsedTo.str;
    endDate = istEndOfDay(parsedTo.y, parsedTo.m, parsedTo.d);
  }

  if (!parsedFrom && !parsedTo) {
    if (mNum && yNum) {
      const isLeap = (yNum % 4 === 0 && (yNum % 100 !== 0 || yNum % 400 === 0));
      const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mNum - 1];
      startDateStr = `${yNum}-${String(mNum).padStart(2, '0')}-01`;
      endDateStr = `${yNum}-${String(mNum).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
      startDate = istStartOfDay(yNum, mNum, 1);
      endDate = istEndOfDay(yNum, mNum, days);
    } else if (yNum) {
      startDateStr = `${yNum}-01-01`;
      endDateStr = `${yNum}-12-31`;
      startDate = istStartOfDay(yNum, 1, 1);
      endDate = istEndOfDay(yNum, 12, 31);
    } else if (mNum) {
      // Month-only resolved using current Asia/Kolkata year
      const nowIST = new Date(Date.now() + 19800000);
      const currentYear = nowIST.getUTCFullYear();
      const isLeap = (currentYear % 4 === 0 && (currentYear % 100 !== 0 || currentYear % 400 === 0));
      const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mNum - 1];
      startDateStr = `${currentYear}-${String(mNum).padStart(2, '0')}-01`;
      endDateStr = `${currentYear}-${String(mNum).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
      startDate = istStartOfDay(currentYear, mNum, 1);
      endDate = istEndOfDay(currentYear, mNum, days);
    }
  }

  const isFiltered = Boolean(startDateStr || endDateStr);

  return {
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    isFiltered,
    timezone: 'Asia/Kolkata',
    reportView: reportView || null,
  };
}

// Backward-compatible helper to parse date filter from request query
function getDateFilter(query) {
  return normalizeReportPeriod(query);
}

// Build Mongoose date match query for Lead (createdAt or dateAdded) - legacy fallback
function buildLeadDateMatch(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const cond = {};
  if (startDate) cond.$gte = startDate;
  if (endDate) cond.$lte = endDate;
  return {
    $or: [
      { createdAt: cond },
      { dateAdded: cond },
    ],
  };
}

// Lead cohort match for admin reports (effective Lead Date = dateAdded when present, else createdAt)
function buildLeadCohortMatch(startDate, endDate) {
  if (!startDate && !endDate) return {};
  return {
    $expr: {
      $let: {
        vars: {
          effectiveDate: { $ifNull: ['$dateAdded', '$createdAt'] },
        },
        in: {
          $and: [
            ...(startDate ? [{ $gte: ['$$effectiveDate', startDate] }] : []),
            ...(endDate ? [{ $lte: ['$$effectiveDate', endDate] }] : []),
          ],
        },
      },
    },
  };
}

// Pagination parameter validator
function validatePagination(queryOrPage, maxLimitOrLimit = 50, possibleMaxLimit = 50, possibleStrict = false) {
  let isStrict = false;
  let pageRaw = 1;
  let limitRaw = 12;
  let maxLimit = 50;

  if (queryOrPage && typeof queryOrPage === 'object') {
    isStrict = queryOrPage.reportView === 'admin';
    pageRaw = queryOrPage.page ?? 1;
    limitRaw = queryOrPage.limit ?? 12;
    maxLimit = typeof maxLimitOrLimit === 'number' ? maxLimitOrLimit : 50;
  } else {
    pageRaw = queryOrPage ?? 1;
    limitRaw = maxLimitOrLimit ?? 12;
    maxLimit = typeof possibleMaxLimit === 'number' ? possibleMaxLimit : 50;
    isStrict = Boolean(possibleStrict);
  }

  const page = Number(pageRaw);
  const limit = Number(limitRaw);

  if (!Number.isInteger(page) || page < 1 || page > 1000000) {
    if (isStrict) {
      throw new ErrorResponse('Invalid page parameter (must be a positive integer)', 400);
    }
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    if (isStrict) {
      throw new ErrorResponse(`Invalid limit parameter (must be an integer between 1 and ${maxLimit})`, 400);
    }
  }

  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeLimit = Number.isInteger(limit) && limit >= 1 ? Math.min(limit, maxLimit) : 12;
  const skip = (safePage - 1) * safeLimit;

  return { page: safePage, limit: safeLimit, skip };
}

const convertToSqFt = (v, u) => {
  if (!v || isNaN(v)) return 0;
  const uu = (u || '').toLowerCase().replace(/\s/g, '');
  if (uu === 'acres' || uu === 'acre') return v * 43560;
  if (uu === 'sqyards' || uu === 'sqyard' || uu === 'sqyd' || uu === 'sqyds') return v * 9;
  if (uu === 'cents' || uu === 'cent') return v * 435.6;
  if (uu === 'guntas' || uu === 'gunta') return v * 1089;
  if (uu === 'sqmeters' || uu === 'sqmeter' || uu === 'sqm' || uu === 'sq m') return v * 10.7639;
  return v;
};

// ---------------------------------------------------------------------------
// Shared report row builders (used by both the report endpoints and the CSV
// export controller so the exported data always matches what the UI shows).
// Each builder returns { total, rows }. Pagination is optional.
// ---------------------------------------------------------------------------

async function buildProjectsReportRows({ startDate, endDate, startDateStr, endDateStr, skip, limit, reportView }) {
  const sStr = startDateStr || (startDate ? new Date(startDate.getTime() + 19800000).toISOString().slice(0, 10) : null);
  const eStr = endDateStr || (endDate ? new Date(endDate.getTime() + 19800000).toISOString().slice(0, 10) : null);
  const isFiltered = Boolean(sStr || eStr || startDate || endDate);

  const leadMatch = reportView === 'admin'
    ? buildLeadCohortMatch(startDate, endDate)
    : buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    { $sort: { createdAt: -1, _id: 1 } },
    ...(Number.isInteger(skip) && skip > 0 ? [{ $skip: skip }] : []),
    ...(Number.isInteger(limit) && limit > 0 ? [{ $limit: limit }] : []),
    {
      $lookup: {
        from: 'plots',
        localField: '_id',
        foreignField: 'projectId',
        as: 'plots',
      },
    },
    {
      $lookup: {
        from: 'leads',
        let: { projId: '$_id' },
        pipeline: [
          {
            $match: {
              $and: [
                { $expr: { $eq: ['$projectId', '$$projId'] } },
                ...(Object.keys(leadMatch).length > 0 ? [leadMatch] : []),
              ],
            },
          },
          {
            $project: {
              status: 1,
              paymentMethod: 1,
              plotId: 1,
              plotIds: 1,
              identityKey: getCustomerIdentityExpression(),
            },
          },
        ],
        as: 'leads',
      },
    },
    {
      $project: {
        name: 1,
        displayId: 1,
        location: 1,
        status: 1,
        surveyNumber: 1,
        dtcpNumber: 1,
        createdAt: 1,
        plotCount: { $size: '$plots' },
        booked: {
          $size: {
            $filter: {
              input: '$plots',
              as: 'p',
              cond: { $eq: ['$$p.status', 'Booked'] },
            },
          },
        },
        registered: {
          $size: {
            $filter: {
              input: '$plots',
              as: 'p',
              cond: { $eq: ['$$p.status', 'Registered'] },
            },
          },
        },
        available: {
          $size: {
            $filter: {
              input: '$plots',
              as: 'p',
              cond: { $in: ['$$p.status', ['Available', 'Canceled']] },
            },
          },
        },
        totalLandArea: 1,
        landAreaUnit: 1,
        plotsList: {
          $map: {
            input: '$plots',
            as: 'p',
            in: { size: '$$p.size', sizeUnit: '$$p.sizeUnit' },
          },
        },
        leadCount: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $add: [
                {
                  $size: {
                    $filter: {
                      input: '$leads',
                      as: 'l',
                      cond: { $ne: ['$$l.status', 'Customer'] },
                    },
                  },
                },
                {
                  $size: {
                    $setUnion: [
                      {
                        $map: {
                          input: {
                            $filter: {
                              input: '$leads',
                              as: 'l',
                              cond: { $eq: ['$$l.status', 'Customer'] },
                            },
                          },
                          as: 'c',
                          in: '$$c.identityKey',
                        },
                      },
                      [],
                    ],
                  },
                },
              ],
            },
            { $size: '$leads' },
          ],
        },
        loanBookings: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $filter: {
                  input: '$plots',
                  as: 'p',
                  cond: {
                    $and: [
                      { $in: ['$$p.status', ['Booked', 'Registered']] },
                      {
                        $or: [
                          { $eq: [{ $ifNull: ['$$p.bookedBy.paymentMethod', ''] }, 'LOAN'] },
                          { $eq: [{ $ifNull: ['$$p.paymentMethod', ''] }, 'LOAN'] },
                        ],
                      },
                      {
                        $cond: [
                          { $eq: [isFiltered, true] },
                          {
                            $cond: [
                              {
                                $gt: [
                                  {
                                    $size: {
                                      $filter: {
                                        input: '$leads',
                                        as: 'l',
                                        cond: {
                                          $and: [
                                            { $eq: ['$$l.status', 'Customer'] },
                                            {
                                              $or: [
                                                { $eq: [{ $toString: '$$l._id' }, { $ifNull: ['$$p.bookedBy.leadId', ''] }] },
                                                { $eq: ['$$l.plotId', '$$p._id'] },
                                                { $in: ['$$p._id', { $ifNull: ['$$l.plotIds', []] }] },
                                              ],
                                            },
                                          ],
                                        },
                                      },
                                    },
                                  },
                                  0,
                                ],
                              },
                              true,
                              {
                                $and: [
                                  { $eq: [{ $ifNull: ['$$p.bookedBy.leadId', ''] }, ''] },
                                  { $ne: [{ $ifNull: ['$$p.bookedBy.bookedAt', ''] }, ''] },
                                  ...(sStr ? [{ $gte: [{ $substrCP: [{ $toString: '$$p.bookedBy.bookedAt' }, 0, 10] }, sStr] }] : []),
                                  ...(eStr ? [{ $lte: [{ $substrCP: [{ $toString: '$$p.bookedBy.bookedAt' }, 0, 10] }, eStr] }] : []),
                                ],
                              },
                            ],
                          },
                          true,
                        ],
                      },
                    ],
                  },
                },
              },
            },
            {
              $size: {
                $filter: {
                  input: '$leads',
                  as: 'l',
                  cond: {
                    $and: [
                      { $eq: ['$$l.status', 'Customer'] },
                      { $eq: ['$$l.paymentMethod', 'LOAN'] },
                    ],
                  },
                },
              },
            },
          ],
        },
        cashBookings: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $filter: {
                  input: '$plots',
                  as: 'p',
                  cond: {
                    $and: [
                      { $in: ['$$p.status', ['Booked', 'Registered']] },
                      {
                        $or: [
                          { $eq: [{ $ifNull: ['$$p.bookedBy.paymentMethod', ''] }, 'CASH'] },
                          { $eq: [{ $ifNull: ['$$p.paymentMethod', ''] }, 'CASH'] },
                        ],
                      },
                      {
                        $cond: [
                          { $eq: [isFiltered, true] },
                          {
                            $cond: [
                              {
                                $gt: [
                                  {
                                    $size: {
                                      $filter: {
                                        input: '$leads',
                                        as: 'l',
                                        cond: {
                                          $and: [
                                            { $eq: ['$$l.status', 'Customer'] },
                                            {
                                              $or: [
                                                { $eq: [{ $toString: '$$l._id' }, { $ifNull: ['$$p.bookedBy.leadId', ''] }] },
                                                { $eq: ['$$l.plotId', '$$p._id'] },
                                                { $in: ['$$p._id', { $ifNull: ['$$l.plotIds', []] }] },
                                              ],
                                            },
                                          ],
                                        },
                                      },
                                    },
                                  },
                                  0,
                                ],
                              },
                              true,
                              {
                                $and: [
                                  { $eq: [{ $ifNull: ['$$p.bookedBy.leadId', ''] }, ''] },
                                  { $ne: [{ $ifNull: ['$$p.bookedBy.bookedAt', ''] }, ''] },
                                  ...(sStr ? [{ $gte: [{ $substrCP: [{ $toString: '$$p.bookedBy.bookedAt' }, 0, 10] }, sStr] }] : []),
                                  ...(eStr ? [{ $lte: [{ $substrCP: [{ $toString: '$$p.bookedBy.bookedAt' }, 0, 10] }, eStr] }] : []),
                                ],
                              },
                            ],
                          },
                          true,
                        ],
                      },
                    ],
                  },
                },
              },
            },
            {
              $size: {
                $filter: {
                  input: '$leads',
                  as: 'l',
                  cond: {
                    $and: [
                      { $eq: ['$$l.status', 'Customer'] },
                      { $eq: ['$$l.paymentMethod', 'CASH'] },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    },
  ];

  const [total, projectStats] = await Promise.all([
    Project.countDocuments({}),
    Project.aggregate(pipeline),
  ]);

  const formattedStats = projectStats.map(p => {
    const projLandSqFt = convertToSqFt(p.totalLandArea, p.landAreaUnit);
    const plotsSqFt = (p.plotsList || []).reduce((sum, pl) => sum + convertToSqFt(Number(pl.size) || 0, pl.sizeUnit), 0);
    const totalSqFt = Math.round(projLandSqFt > 0 ? projLandSqFt : plotsSqFt);
    const { plotsList, ...rest } = p;
    return {
      ...rest,
      totalSqFt,
    };
  });

  return { total, rows: formattedStats };
}

async function buildStaffReportRows({ startDate, endDate, skip, limit, reportView }) {
  const leadMatch = reportView === 'admin'
    ? buildLeadCohortMatch(startDate, endDate)
    : buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    { $match: { role: 'staff' } },
    { $sort: { name: 1, _id: 1 } },
    ...(Number.isInteger(skip) && skip > 0 ? [{ $skip: skip }] : []),
    ...(Number.isInteger(limit) && limit > 0 ? [{ $limit: limit }] : []),
    {
      $lookup: {
        from: 'leads',
        let: { staffId: '$_id' },
        pipeline: [
          {
            $match: {
              $and: [
                { $expr: { $eq: ['$assignedTo', '$$staffId'] } },
                ...(Object.keys(leadMatch).length > 0 ? [leadMatch] : []),
              ],
            },
          },
          {
            $project: {
              status: 1,
              paymentMethod: 1,
              identityKey: getCustomerIdentityExpression(),
            }
          }
        ],
        as: 'leads',
      },
    },
    {
      $project: {
        name: 1,
        initials: 1,
        designation: 1,
        phone: 1,
        email: 1,
        avatarBg: 1,
        assignedLeads: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $add: [
                {
                  $size: {
                    $filter: {
                      input: '$leads',
                      as: 'l',
                      cond: { $ne: ['$$l.status', 'Customer'] },
                    },
                  },
                },
                {
                  $size: {
                    $setUnion: [
                      {
                        $map: {
                          input: {
                            $filter: {
                              input: '$leads',
                              as: 'l',
                              cond: { $eq: ['$$l.status', 'Customer'] },
                            },
                          },
                          as: 'c',
                          in: '$$c.identityKey',
                        },
                      },
                      [],
                    ],
                  },
                },
              ],
            },
            { $size: '$leads' },
          ],
        },
        converted: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $setUnion: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$leads',
                          as: 'l',
                          cond: { $eq: ['$$l.status', 'Customer'] },
                        },
                      },
                      as: 'c',
                      in: '$$c.identityKey',
                    },
                  },
                  [],
                ],
              },
            },
            {
              $size: {
                $filter: {
                  input: '$leads',
                  as: 'l',
                  cond: { $eq: ['$$l.status', 'Customer'] },
                },
              },
            },
          ],
        },
        open: {
          $size: {
            $filter: {
              input: '$leads',
              as: 'l',
              cond: { $in: ['$$l.status', ['Open', 'Lead']] },
            },
          },
        },
        loanConversions: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $setUnion: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$leads',
                          as: 'l',
                          cond: {
                            $and: [
                              { $eq: ['$$l.status', 'Customer'] },
                              { $eq: ['$$l.paymentMethod', 'LOAN'] },
                            ],
                          },
                        },
                      },
                      as: 'c',
                      in: '$$c.identityKey',
                    },
                  },
                  [],
                ],
              },
            },
            {
              $size: {
                $filter: {
                  input: '$leads',
                  as: 'l',
                  cond: {
                    $and: [
                      { $eq: ['$$l.status', 'Customer'] },
                      { $eq: ['$$l.paymentMethod', 'LOAN'] },
                    ],
                  },
                },
              },
            },
          ],
        },
        cashConversions: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $setUnion: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$leads',
                          as: 'l',
                          cond: {
                            $and: [
                              { $eq: ['$$l.status', 'Customer'] },
                              { $eq: ['$$l.paymentMethod', 'CASH'] },
                            ],
                          },
                        },
                      },
                      as: 'c',
                      in: '$$c.identityKey',
                    },
                  },
                  [],
                ],
              },
            },
            {
              $size: {
                $filter: {
                  input: '$leads',
                  as: 'l',
                  cond: {
                    $and: [
                      { $eq: ['$$l.status', 'Customer'] },
                      { $eq: ['$$l.paymentMethod', 'CASH'] },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    },
  ];

  const [total, rows] = await Promise.all([
    User.countDocuments({ role: 'staff' }),
    User.aggregate(pipeline),
  ]);

  return { total, rows };
}

async function buildAttendanceReportRows({ startDate, endDate, startDateStr, endDateStr, skip, limit }) {
  const query = {};
  const startStr = startDateStr || (startDate ? new Date(startDate.getTime() + 19800000).toISOString().slice(0, 10) : null);
  const endStr = endDateStr || (endDate ? new Date(endDate.getTime() + 19800000).toISOString().slice(0, 10) : null);

  if (startStr || endStr) {
    const dateCond = {};
    if (startStr) dateCond.$gte = startStr;
    if (endStr) dateCond.$lte = endStr;
    query.date = dateCond;
  }

  const base = Attendance.find(query).sort('-date -createdAt _id');
  const [total, rows] = await Promise.all([
    Attendance.countDocuments(query),
    Number.isInteger(skip) && Number.isInteger(limit) && (skip > 0 || limit > 0)
      ? base.clone().skip(skip).limit(limit).lean()
      : base.clone().lean(),
  ]);

  return { total, rows };
}

function formatTrendRow(item) {
  return {
    date: item._id || '-',
    totalLeads: item.totalLeads,
    openLeads: item.openLeads,
    qualifiedLeads: item.qualifiedLeads,
    customers: item.customers,
    plotsBooked: item.plotsBooked,
    loanBookings: item.loanBookings,
    cashBookings: item.cashBookings,
    conversionRate: item.totalLeads > 0 ? Math.round((item.customers / item.totalLeads) * 100) : 0,
  };
}

async function buildLeadsTrendRows({ startDate, endDate, skip, limit, reportView }) {
  const leadMatch = reportView === 'admin'
    ? buildLeadCohortMatch(startDate, endDate)
    : buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
    {
      $project: {
        dateStr: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $ifNull: ['$dateAdded', '$createdAt'] },
            timezone: '+05:30',
          },
        },
        status: 1,
        plotId: 1,
        plotIds: 1,
        paymentMethod: 1,
        identityKey: getCustomerIdentityExpression(),
        plots: {
          $cond: [
            { $eq: ['$status', 'Customer'] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
        loanPlots: {
          $cond: [
            { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
        cashPlots: {
          $cond: [
            { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
      },
    },
    {
      $group: {
        _id: '$dateStr',
        rawTotalLeads: { $sum: 1 },
        nonCustomerLeads: { $sum: { $cond: [{ $ne: ['$status', 'Customer'] }, 1, 0] } },
        openLeads: { $sum: { $cond: [{ $in: ['$status', ['Open', 'Lead']] }, 1, 0] } },
        qualifiedLeads: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
        customerLeads: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
        customerIdentities: {
          $addToSet: {
            $cond: [{ $eq: ['$status', 'Customer'] }, '$identityKey', '$$REMOVE'],
          },
        },
        allPlotArrays: { $push: '$plots' },
        allLoanPlotArrays: { $push: '$loanPlots' },
        allCashPlotArrays: { $push: '$cashPlots' },
        legacyPlotsBooked: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $gt: ['$plotId', null] }] },
              1,
              0,
            ],
          },
        },
        legacyLoanBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
              1,
              0,
            ],
          },
        },
        legacyCashBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        totalLeads: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            { $add: ['$nonCustomerLeads', { $size: '$customerIdentities' }] },
            '$rawTotalLeads',
          ],
        },
        openLeads: 1,
        qualifiedLeads: 1,
        customers: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            { $size: '$customerIdentities' },
            '$customerLeads',
          ],
        },
        plotsBooked: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $reduce: {
                  input: '$allPlotArrays',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            '$legacyPlotsBooked',
          ],
        },
        loanBookings: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $reduce: {
                  input: '$allLoanPlotArrays',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            '$legacyLoanBookings',
          ],
        },
        cashBookings: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $reduce: {
                  input: '$allCashPlotArrays',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            '$legacyCashBookings',
          ],
        },
      },
    },
    { $sort: { _id: -1 } },
  ];

  const totalRes = await Lead.aggregate([
    ...pipeline,
    { $count: 'total' },
  ]);

  const dataPipeline = [
    ...pipeline,
    ...(Number.isInteger(skip) && skip > 0 ? [{ $skip: skip }] : []),
    ...(Number.isInteger(limit) && limit > 0 ? [{ $limit: limit }] : []),
  ];
  const data = await Lead.aggregate(dataPipeline);

  const total = totalRes[0]?.total || 0;
  return { total, rows: data.map(formatTrendRow) };
}

function formatContributionRow(item, grandTotalLeads) {
  return {
    sourceType: item._id,
    latestDate: item.latestLeadDate ? new Date(item.latestLeadDate).toISOString().slice(0, 10) : '-',
    totalLeads: item.totalLeads,
    converted: item.converted,
    plotsBooked: item.plotsBooked,
    loanBookings: item.loanBookings,
    cashBookings: item.cashBookings,
    contributionPercentage: grandTotalLeads > 0 ? Math.round((item.totalLeads / grandTotalLeads) * 1000) / 10 : 0,
    conversionRate: item.totalLeads > 0 ? Math.round((item.converted / item.totalLeads) * 100) : 0,
  };
}

async function buildLeadContributionRows({ startDate, endDate, skip, limit, reportView }) {
  const leadMatch = reportView === 'admin'
    ? buildLeadCohortMatch(startDate, endDate)
    : buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
    {
      $project: {
        sourceType: {
          $let: {
            vars: { raw: { $trim: { input: { $ifNull: ['$sourceType', ''] } } } },
            in: {
              $cond: [
                { $or: [{ $eq: ['$$raw', ''] }, { $eq: ['$$raw', 'null'] }] },
                'Direct / Other',
                '$$raw',
              ],
            },
          },
        },
        status: 1,
        paymentMethod: 1,
        plotId: 1,
        plotIds: 1,
        identityKey: getCustomerIdentityExpression(),
        plots: {
          $cond: [
            { $eq: ['$status', 'Customer'] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
        loanPlots: {
          $cond: [
            { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
        cashPlots: {
          $cond: [
            { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
        dateAdded: { $ifNull: ['$dateAdded', '$createdAt'] },
      },
    },
    {
      $group: {
        _id: '$sourceType',
        rawTotalLeads: { $sum: 1 },
        nonCustomerLeads: { $sum: { $cond: [{ $ne: ['$status', 'Customer'] }, 1, 0] } },
        customerLeads: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
        customerIdentities: {
          $addToSet: {
            $cond: [{ $eq: ['$status', 'Customer'] }, '$identityKey', '$$REMOVE'],
          },
        },
        allPlotArrays: { $push: '$plots' },
        allLoanPlotArrays: { $push: '$loanPlots' },
        allCashPlotArrays: { $push: '$cashPlots' },
        legacyPlotsBooked: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $gt: ['$plotId', null] }] },
              1,
              0,
            ],
          },
        },
        legacyLoanBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
              1,
              0,
            ],
          },
        },
        legacyCashBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
              1,
              0,
            ],
          },
        },
        latestLeadDate: { $max: '$dateAdded' },
      },
    },
    {
      $project: {
        _id: 1,
        totalLeads: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            { $add: ['$nonCustomerLeads', { $size: '$customerIdentities' }] },
            '$rawTotalLeads',
          ],
        },
        converted: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            { $size: '$customerIdentities' },
            '$customerLeads',
          ],
        },
        plotsBooked: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $reduce: {
                  input: '$allPlotArrays',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            '$legacyPlotsBooked',
          ],
        },
        loanBookings: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $reduce: {
                  input: '$allLoanPlotArrays',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            '$legacyLoanBookings',
          ],
        },
        cashBookings: {
          $cond: [
            { $eq: [reportView, 'admin'] },
            {
              $size: {
                $reduce: {
                  input: '$allCashPlotArrays',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            '$legacyCashBookings',
          ],
        },
        latestLeadDate: 1,
      },
    },
    { $sort: { totalLeads: -1, _id: 1 } },
  ];

  const totalRes = await Lead.aggregate([
    ...pipeline,
    { $count: 'total' },
  ]);

  const dataPipeline = [
    ...pipeline,
    ...(Number.isInteger(skip) && skip > 0 ? [{ $skip: skip }] : []),
    ...(Number.isInteger(limit) && limit > 0 ? [{ $limit: limit }] : []),
  ];
  const data = await Lead.aggregate(dataPipeline);

  const grandRes = await Lead.aggregate([
    ...pipeline,
    { $group: { _id: null, total: { $sum: '$totalLeads' } } },
  ]);
  const grandTotalLeads = grandRes[0]?.total || 0;
  const total = totalRes[0]?.total || 0;

  return { total, rows: data.map(item => formatContributionRow(item, grandTotalLeads)) };
}

async function buildChannelPartnerPerformanceRows({ startDate, endDate, startDateStr, endDateStr, skip, limit, reportView } = {}) {
  const allPartners = await ChannelPartner.find({}).lean();
  const leadDateMatch = reportView === 'admin'
    ? buildLeadCohortMatch(startDate, endDate)
    : buildLeadDateMatch(startDate, endDate);

  const leadsByPartner = await Lead.aggregate([
    {
      $match: {
        sourceType: 'Channel Partner',
        ...(Object.keys(leadDateMatch).length > 0 ? leadDateMatch : {}),
      },
    },
    {
      $project: {
        sourceId: 1,
        source: { $trim: { input: { $ifNull: ['$source', ''] } } },
        status: 1,
        paymentMethod: 1,
        plotId: 1,
        plotIds: 1,
        identityKey: getCustomerIdentityExpression(),
        plots: {
          $cond: [
            { $eq: ['$status', 'Customer'] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
        loanPlots: {
          $cond: [
            { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
        cashPlots: {
          $cond: [
            { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
            {
              $setUnion: [
                { $ifNull: ['$plotIds', []] },
                { $cond: [{ $gt: ['$plotId', null] }, ['$plotId'], []] },
              ],
            },
            [],
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          sourceId: '$sourceId',
          source: '$source',
        },
        rawTotalLeads: { $sum: 1 },
        nonCustomerLeads: { $sum: { $cond: [{ $ne: ['$status', 'Customer'] }, 1, 0] } },
        customerLeads: {
          $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] },
        },
        customerIdentities: {
          $addToSet: {
            $cond: [{ $eq: ['$status', 'Customer'] }, '$identityKey', '$$REMOVE'],
          },
        },
        allPlotArrays: { $push: '$plots' },
        allLoanPlotArrays: { $push: '$loanPlots' },
        allCashPlotArrays: { $push: '$cashPlots' },
        legacyPlotsBooked: {
          $sum: { $cond: [{ $ifNull: ['$plotId', false] }, 1, 0] },
        },
        legacyLoanBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
              1,
              0,
            ],
          },
        },
        legacyCashBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const partnerStatsMap = new Map();
  allPartners.forEach((cp) => {
    partnerStatsMap.set(String(cp._id), {
      _id: cp._id,
      name: cp.name,
      phone: cp.phone || '-',
      company: cp.companyName || '-',
      totalLeads: 0,
      rawTotalLeads: 0,
      nonCustomerLeads: 0,
      converted: 0,
      customerIdentities: new Set(),
      plotIdsSet: new Set(),
      loanPlotsSet: new Set(),
      cashPlotsSet: new Set(),
      plotsBooked: 0,
      loanBookings: 0,
      cashBookings: 0,
    });
  });

  const partnerIdLookup = new Map();
  const partnerNameLookup = new Map();
  const partnerNameCounts = new Map();
  allPartners.forEach((cp) => {
    partnerIdLookup.set(String(cp._id), String(cp._id));
    if (cp.userId) partnerIdLookup.set(String(cp.userId), String(cp._id));
    if (cp.name) {
      const norm = cp.name.trim().toLowerCase();
      partnerNameLookup.set(norm, String(cp._id));
      partnerNameCounts.set(norm, (partnerNameCounts.get(norm) || 0) + 1);
    }
  });

  const unattributed = {
    _id: 'unattributed',
    name: 'Unattributed partner activity',
    phone: '-',
    company: '-',
    totalLeads: 0,
    rawTotalLeads: 0,
    nonCustomerLeads: 0,
    converted: 0,
    customerIdentities: new Set(),
    plotIdsSet: new Set(),
    loanPlotsSet: new Set(),
    cashPlotsSet: new Set(),
    plotsBooked: 0,
    loanBookings: 0,
    cashBookings: 0,
  };

  leadsByPartner.forEach((group) => {
    const rawSourceId = group._id.sourceId ? String(group._id.sourceId) : null;
    const rawSourceName = group._id.source ? group._id.source.trim().toLowerCase() : null;

    let matchedPartnerId = null;
    if (rawSourceId) {
      if (partnerIdLookup.has(rawSourceId)) {
        matchedPartnerId = partnerIdLookup.get(rawSourceId);
      }
      // If explicit sourceId is unmatched, it MUST remain unattributed (do not guess by name)
    } else if (rawSourceName && partnerNameLookup.has(rawSourceName)) {
      // Only attribute by name if exactly one partner profile has this name
      if (partnerNameCounts.get(rawSourceName) === 1) {
        matchedPartnerId = partnerNameLookup.get(rawSourceName);
      }
    }

    const target = matchedPartnerId ? partnerStatsMap.get(matchedPartnerId) : unattributed;
    if (target) {
      target.rawTotalLeads += group.rawTotalLeads;
      target.nonCustomerLeads += group.nonCustomerLeads;
      target.plotsBooked += group.legacyPlotsBooked;
      target.loanBookings += group.legacyLoanBookings;
      target.cashBookings += group.legacyCashBookings;
      target.converted += group.customerLeads;
      (group.customerIdentities || []).forEach((idKey) => target.customerIdentities.add(idKey));
      (group.allPlotArrays || []).forEach((arr) => {
        (arr || []).forEach((pId) => target.plotIdsSet.add(String(pId)));
      });
      (group.allLoanPlotArrays || []).forEach((arr) => {
        (arr || []).forEach((pId) => target.loanPlotsSet.add(String(pId)));
      });
      (group.allCashPlotArrays || []).forEach((arr) => {
        (arr || []).forEach((pId) => target.cashPlotsSet.add(String(pId)));
      });
    }
  });

  const merged = Array.from(partnerStatsMap.values()).map((p) => {
    const totalLeads = reportView === 'admin'
      ? p.nonCustomerLeads + p.customerIdentities.size
      : p.rawTotalLeads;
    const converted = reportView === 'admin' ? p.customerIdentities.size : p.converted;
    const plotsBooked = reportView === 'admin' ? p.plotIdsSet.size : p.plotsBooked;
    const loanBookings = reportView === 'admin' ? p.loanPlotsSet.size : p.loanBookings;
    const cashBookings = reportView === 'admin' ? p.cashPlotsSet.size : p.cashBookings;
    return {
      _id: p._id,
      name: p.name,
      phone: p.phone,
      company: p.company,
      totalLeads,
      converted,
      plotsBooked,
      loanBookings,
      cashBookings,
      conversionRate: totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0,
    };
  });

  if (unattributed.rawTotalLeads > 0) {
    const totalLeads = reportView === 'admin'
      ? unattributed.nonCustomerLeads + unattributed.customerIdentities.size
      : unattributed.rawTotalLeads;
    const converted = reportView === 'admin' ? unattributed.customerIdentities.size : unattributed.converted;
    const plotsBooked = reportView === 'admin' ? unattributed.plotIdsSet.size : unattributed.plotsBooked;
    const loanBookings = reportView === 'admin' ? unattributed.loanPlotsSet.size : unattributed.loanBookings;
    const cashBookings = reportView === 'admin' ? unattributed.cashPlotsSet.size : unattributed.cashBookings;
    merged.push({
      _id: unattributed._id,
      name: unattributed.name,
      phone: unattributed.phone,
      company: unattributed.company,
      totalLeads,
      converted,
      plotsBooked,
      loanBookings,
      cashBookings,
      conversionRate: totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0,
    });
  }

  merged.sort((a, b) => {
    if (b.totalLeads !== a.totalLeads) return b.totalLeads - a.totalLeads;
    const nameA = a.name || '';
    const nameB = b.name || '';
    if (nameA.localeCompare(nameB) !== 0) return nameA.localeCompare(nameB);
    return String(a._id).localeCompare(String(b._id));
  });

  const paginatedRows = Number.isInteger(skip) && Number.isInteger(limit) && (skip > 0 || limit > 0)
    ? merged.slice(skip, skip + limit)
    : merged;

  return { total: merged.length, rows: paginatedRows };
}

// Build plot booking-date filter (bookedBy.bookedAt string, fallback timeline for admin, fallback updatedAt for legacy)
function buildPlotBookingDateFilter(arg1, arg2, arg3) {
  let startDate = null;
  let endDate = null;
  let startDateStr = null;
  let endDateStr = null;
  let reportView = null;

  if (arg1 && typeof arg1 === 'object' && !(arg1 instanceof Date)) {
    startDate = arg1.startDate;
    endDate = arg1.endDate;
    startDateStr = arg1.startDateStr;
    endDateStr = arg1.endDateStr;
    reportView = arg1.reportView;
  } else {
    startDate = arg1;
    endDate = arg2;
    reportView = arg3;
  }

  const isStrict = reportView === 'admin';
  const sStr = startDateStr || (startDate ? new Date(startDate.getTime() + 19800000).toISOString().slice(0, 10) : null);
  const eStr = endDateStr || (endDate ? new Date(endDate.getTime() + 19800000).toISOString().slice(0, 10) : null);

  if (!sStr && !eStr && !startDate && !endDate) return null;

  const bookedAtRange = {};
  if (sStr) bookedAtRange.$gte = sStr;
  if (eStr) bookedAtRange.$lte = eStr;

  if (isStrict) {
    return {
      $expr: {
        $let: {
          vars: {
            rawBookedAt: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ['$bookedBy.bookedAt', ''] }, ''] },
                  ],
                },
                '$bookedBy.bookedAt',
                {
                  $max: {
                    $map: {
                      input: {
                        $filter: {
                          input: { $ifNull: ['$timeline', []] },
                          as: 't',
                          cond: {
                            $and: [
                              { $in: ['$$t.type', ['booking_confirmed', 'new_booking']] },
                              { $ne: ['$$t.label', 'Cancellation Rejected'] },
                              { $ne: ['$$t.date', null] },
                              { $ne: ['$$t.date', ''] },
                            ],
                          },
                        },
                      },
                      as: 'vt',
                      in: '$$vt.date',
                    },
                  },
                },
              ],
            },
          },
          in: {
            $let: {
              vars: {
                effectiveBookedDate: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$$rawBookedAt', null] },
                        { $ne: ['$$rawBookedAt', ''] },
                      ],
                    },
                    { $substrCP: [{ $toString: '$$rawBookedAt' }, 0, 10] },
                    null,
                  ],
                },
              },
              in: {
                $and: [
                  { $ne: ['$$effectiveBookedDate', null] },
                  ...(sStr ? [{ $gte: ['$$effectiveBookedDate', sStr] }] : []),
                  ...(eStr ? [{ $lte: ['$$effectiveBookedDate', eStr] }] : []),
                ],
              },
            },
          },
        },
      },
    };
  }

  const updatedAtRange = {};
  if (startDate) updatedAtRange.$gte = startDate;
  if (endDate) updatedAtRange.$lte = endDate;

  const bookedAtClause = Object.keys(bookedAtRange).length > 0
    ? { 'bookedBy.bookedAt': bookedAtRange }
    : null;

  const legacyUpdatedClause = {
    $and: [
      {
        $or: [
          { 'bookedBy.bookedAt': { $exists: false } },
          { 'bookedBy.bookedAt': null },
          { 'bookedBy.bookedAt': '' },
        ],
      },
      { updatedAt: updatedAtRange },
    ],
  };

  if (bookedAtClause) {
    return { $or: [bookedAtClause, legacyUpdatedClause] };
  }
  return legacyUpdatedClause;
}

async function resolveStaffPlotScope(assignedTo) {
  if (!assignedTo) return null;

  const myLeads = await Lead.find({ assignedTo }).select('_id plotId plotIds');
  const leadIds = myLeads.map((l) => String(l._id));
  const legacyPlotIds = myLeads
    .flatMap((l) => [l.plotId, ...(l.plotIds || [])])
    .filter(Boolean);

  const orClause = [
    { 'bookedBy.staffId': assignedTo },
    { 'pendingApproval.requestedBy': assignedTo },
  ];

  if (leadIds.length > 0) {
    orClause.push({ 'bookedBy.leadId': { $in: leadIds } });
    orClause.push({ 'pendingApproval.leadId': { $in: leadIds } });
  }

  if (legacyPlotIds.length > 0) {
    orClause.push({ _id: { $in: legacyPlotIds } });
  }

  return { $or: orClause };
}

function mergeMatchClauses(...clauses) {
  const parts = clauses.filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

const { getTodayDateStringIST } = require('../utils/dateIST');

function categorizeDashboardSource(sourceType) {
  if (sourceType === 'Channel Partner') return 'Channel Partners';
  if (sourceType === 'Staff') return 'Staff Added';
  if (sourceType === 'Admin' || sourceType === 'Admin Added' || sourceType === 'Direct') {
    return 'Admin Added';
  }
  return 'Others';
}

async function buildDashboardLeadCharts() {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), monthIndex: d.getMonth(), name: monthNames[d.getMonth()] });
  }

  const startDate = new Date(months[0].year, months[0].monthIndex, 1);
  const endDate = new Date(
    months[months.length - 1].year,
    months[months.length - 1].monthIndex + 1,
    0,
    23,
    59,
    59,
    999,
  );
  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const monthlyAgg = await Lead.aggregate([
    ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
    {
      $project: {
        created: { $ifNull: ['$createdAt', '$dateAdded'] },
        status: 1,
      },
    },
    {
      $project: {
        month: { $month: '$created' },
        year: { $year: '$created' },
        status: 1,
      },
    },
    {
      $group: {
        _id: { year: '$year', month: '$month' },
        leads: { $sum: 1 },
        bookings: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
      },
    },
  ]);

  const aggMap = new Map(monthlyAgg.map((item) => [`${item._id.year}-${item._id.month}`, item]));
  const monthlyTrend = months.map((m) => {
    const found = aggMap.get(`${m.year}-${m.monthIndex + 1}`);
    return {
      name: m.name,
      Leads: found?.leads || 0,
      Bookings: found?.bookings || 0,
    };
  });

  const { rows } = await buildLeadContributionRows({
    startDate: null,
    endDate: null,
    skip: 0,
    limit: 0,
  });

  const buckets = {
    'Channel Partners': 0,
    'Staff Added': 0,
    'Admin Added': 0,
    Others: 0,
  };

  rows.forEach((row) => {
    const category = categorizeDashboardSource(row.sourceType);
    buckets[category] += row.totalLeads;
  });

  const grandTotal = Object.values(buckets).reduce((sum, count) => sum + count, 0) || 1;
  const sourceColors = {
    'Channel Partners': '#3B82F6',
    'Staff Added': '#F59E0B',
    'Admin Added': '#10B981',
    Others: '#8B5CF6',
  };

  const sourceBreakdown = Object.entries(buckets).map(([name, count]) => ({
    name,
    count,
    value: Math.round((count / grandTotal) * 100),
    color: sourceColors[name],
  }));

  return { monthlyTrend, sourceBreakdown, totalLeads: grandTotal };
}

async function buildOperationsMetrics(params = {}) {
  const { startDate, endDate, startDateStr, endDateStr, assignedTo, reportView } = params;
  const staffScope = await resolveStaffPlotScope(assignedTo);
  const dateFilter = buildPlotBookingDateFilter({ startDate, endDate, startDateStr, endDateStr, reportView });

  const bookingBase = mergeMatchClauses(
    {
      status: { $in: ['Booked', 'Registered'] },
      bookedBy: { $exists: true, $ne: null },
    },
    staffScope,
    dateFilter,
  );

  const pendingBase = mergeMatchClauses(
    {
      status: 'Booked',
      bookedBy: { $exists: true, $ne: null },
    },
    staffScope,
    dateFilter,
  );

  let totalLoans = 0;
  let totalCustomers = 0;

  if (reportView === 'admin') {
    const buyerAgg = await Plot.aggregate([
      { $match: bookingBase },
      {
        $project: {
          paymentMethod: '$bookedBy.paymentMethod',
          identityKey: getPlotBuyerIdentityExpression(),
        },
      },
      {
        $group: {
          _id: null,
          customers: { $addToSet: '$identityKey' },
          loanCustomers: {
            $addToSet: {
              $cond: [{ $eq: ['$paymentMethod', 'LOAN'] }, '$identityKey', '$$REMOVE'],
            },
          },
        },
      },
    ]);
    totalCustomers = buyerAgg[0]?.customers?.length || 0;
    totalLoans = buyerAgg[0]?.loanCustomers?.length || 0;
  } else {
    const leadDateMatch = buildLeadDateMatch(startDate, endDate);
    const loanLeadMatch = {
      status: 'Customer',
      paymentMethod: 'LOAN',
      ...(Object.keys(leadDateMatch).length > 0 ? leadDateMatch : {}),
    };
    const customerLeadMatch = {
      status: 'Customer',
      ...(Object.keys(leadDateMatch).length > 0 ? leadDateMatch : {}),
    };
    if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      loanLeadMatch.assignedTo = new mongoose.Types.ObjectId(assignedTo);
      customerLeadMatch.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    }
    [totalLoans, totalCustomers] = await Promise.all([
      Lead.countDocuments(loanLeadMatch),
      countUniqueCustomers(customerLeadMatch),
    ]);
  }

  const [bookingStats] = await Plot.aggregate([
    { $match: bookingBase },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        notPaid: {
          $sum: {
            $cond: [{ $eq: [{ $ifNull: ['$bookedBy.paymentStatus', 'Not Paid'] }, 'Not Paid'] }, 1, 0],
          },
        },
        partiallyPaid: {
          $sum: {
            $cond: [{ $eq: ['$bookedBy.paymentStatus', 'Partially Paid'] }, 1, 0],
          },
        },
        advancePaid: {
          $sum: {
            $cond: [{ $eq: ['$bookedBy.paymentStatus', 'Advance Paid'] }, 1, 0],
          },
        },
        advanceNotPaid: {
          $sum: {
            $cond: [{ $eq: ['$bookedBy.paymentStatus', 'Advance Not Paid'] }, 1, 0],
          },
        },
        fullyPaid: {
          $sum: {
            $cond: [{ $eq: ['$bookedBy.paymentStatus', 'Fully Paid'] }, 1, 0],
          },
        },
      },
    },
  ]);

  const [pendingStats] = await Plot.aggregate([
    { $match: pendingBase },
    { $group: { _id: null, count: { $sum: 1 } } },
  ]);

  const todayStr = getTodayDateStringIST();

  const todaysRegistrationsBase = mergeMatchClauses(
    {
      status: 'Booked',
      expectedRegistrationDate: { $exists: true, $nin: [null, ''] },
      $expr: {
        $eq: [
          { $substrCP: [{ $toString: '$expectedRegistrationDate' }, 0, 10] },
          todayStr,
        ],
      },
    },
    staffScope,
  );

  const pendingPaymentBase = mergeMatchClauses(
    {
      status: 'Registered',
      $expr: {
        $ne: [
          { $ifNull: ['$bookedBy.paymentStatus', { $ifNull: ['$paymentStatus', 'Not Paid'] }] },
          'Fully Paid',
        ],
      },
    },
    staffScope,
    dateFilter,
  );

  const [[todaysRegStats], [pendingPaymentStats]] = await Promise.all([
    Plot.aggregate([
      { $match: todaysRegistrationsBase },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
    Plot.aggregate([
      { $match: pendingPaymentBase },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
  ]);

  let unknownBookingDateCount = 0;
  if (reportView === 'admin' && (startDate || endDate || startDateStr || endDateStr)) {
    const unknownBase = mergeMatchClauses(
      {
        status: { $in: ['Booked', 'Registered'] },
        bookedBy: { $exists: true, $ne: null },
        $expr: {
          $let: {
            vars: {
              rawBookedAt: {
                $cond: [
                  { $and: [{ $ne: [{ $ifNull: ['$bookedBy.bookedAt', ''] }, ''] }] },
                  '$bookedBy.bookedAt',
                  {
                    $max: {
                      $map: {
                        input: {
                          $filter: {
                            input: { $ifNull: ['$timeline', []] },
                            as: 't',
                            cond: {
                              $and: [
                                { $in: ['$$t.type', ['booking_confirmed', 'new_booking']] },
                                { $ne: ['$$t.label', 'Cancellation Rejected'] },
                                { $ne: ['$$t.date', null] },
                                { $ne: ['$$t.date', ''] },
                              ],
                            },
                          },
                        },
                        as: 'vt',
                        in: '$$vt.date',
                      },
                    },
                  },
                ],
              },
            },
            in: {
              $or: [
                { $eq: ['$$rawBookedAt', null] },
                { $eq: ['$$rawBookedAt', ''] },
              ],
            },
          },
        },
      },
      staffScope,
    );
    unknownBookingDateCount = await Plot.countDocuments(unknownBase);
  }

  return {
    totalLoans,
    totalCustomers,
    registrationPending: pendingStats?.count || 0,
    totalBookings: bookingStats?.totalBookings || 0,
    todaysRegistrations: todaysRegStats?.count || 0,
    pendingPaymentRegistrations: pendingPaymentStats?.count || 0,
    unknownBookingDateCount,
    bookingPayments: {
      notPaid: bookingStats?.notPaid || 0,
      partiallyPaid: bookingStats?.partiallyPaid || 0,
      advancePaid: bookingStats?.advancePaid || 0,
      advanceNotPaid: bookingStats?.advanceNotPaid || 0,
      fullyPaid: bookingStats?.fullyPaid || 0,
    },
  };
}

// @desc    Operations dashboard metrics (loans, registrations pending, bookings, payment breakdown)
// @route   GET /api/v1/reports/operations-metrics
// @access  Private/Admin + Staff (staff auto-scoped to assigned bookings)
exports.getOperationsMetrics = asyncHandler(async (req, res) => {
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);

  let assignedTo = null;
  if (req.user.role === 'staff') {
    if (req.query.reportView === 'admin') {
      throw new ErrorResponse('Staff users cannot access admin report view', 403);
    }
    assignedTo = String(req.user.id || req.user._id);
  } else if (req.query.assignedTo) {
    assignedTo = String(req.query.assignedTo);
  }

  const data = await buildOperationsMetrics({
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    assignedTo,
    reportView: req.query.reportView,
  });

  res.status(200).json({
    success: true,
    data,
  });
});

// @desc    Admin dashboard lead charts (monthly trend + source breakdown)
// @route   GET /api/v1/reports/dashboard-charts
// @access  Private/Admin
exports.getDashboardLeadCharts = asyncHandler(async (req, res) => {
  const data = await buildDashboardLeadCharts();

  res.status(200).json({
    success: true,
    data,
  });
});

// @desc    Get report summary cards (aggregated counts with date filter)
// @route   GET /api/v1/reports/summary
// @access  Private/Admin
exports.getSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);
  const isStrict = req.query.reportView === 'admin';

  const leadMatch = isStrict
    ? buildLeadCohortMatch(startDate, endDate)
    : buildLeadDateMatch(startDate, endDate);

  const plotDateFilter = buildPlotBookingDateFilter({
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    reportView: req.query.reportView,
  });

  const customerLeadFilter = {
    status: 'Customer',
    ...(Object.keys(leadMatch).length > 0 ? leadMatch : {}),
  };

  const bookingBase = mergeMatchClauses(
    {
      status: { $in: ['Booked', 'Registered'] },
      bookedBy: { $exists: true, $ne: null },
    },
    plotDateFilter,
  );

  const [
    totalProjects,
    leadStats,
    bookedPlotsCount,
    uniqueCustomersCount,
  ] = await Promise.all([
    Project.countDocuments({}),
    Lead.aggregate([
      ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          customers: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
          open: { $sum: { $cond: [{ $in: ['$status', ['Open', 'Lead']] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
          loanCustomers: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] }, 1, 0],
            },
          },
          loanCustomerIdentities: {
            $addToSet: {
              $cond: [
                { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
                getCustomerIdentityExpression(),
                '$$REMOVE',
              ],
            },
          },
          cashCustomers: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] }, 1, 0],
            },
          },
          cashCustomerIdentities: {
            $addToSet: {
              $cond: [
                { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
                getCustomerIdentityExpression(),
                '$$REMOVE',
              ],
            },
          },
          bookedFromLeads: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'Customer'] }, { $gt: ['$plotId', null] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    Plot.countDocuments(bookingBase),
    countUniqueCustomers(customerLeadFilter),
  ]);

  const stats = leadStats[0] || {
    total: 0,
    customers: 0,
    open: 0,
    qualified: 0,
    loanCustomers: 0,
    cashCustomers: 0,
    bookedFromLeads: 0,
    loanCustomerIdentities: [],
    cashCustomerIdentities: [],
  };

  const totalLeadsCount = (stats.total - stats.customers) + uniqueCustomersCount;

  res.status(200).json({
    success: true,
    data: {
      totalProjects,
      totalLeads: totalLeadsCount,
      totalCustomers: uniqueCustomersCount,
      totalPlotsBooked: isStrict ? bookedPlotsCount : Math.max(bookedPlotsCount, stats.bookedFromLeads),
      loanCustomers: isStrict ? (stats.loanCustomerIdentities?.length || 0) : stats.loanCustomers,
      cashCustomers: isStrict ? (stats.cashCustomerIdentities?.length || 0) : stats.cashCustomers,
      funnelOpen: stats.open,
      funnelQualified: stats.qualified,
      funnelCustomer: uniqueCustomersCount,
      conversionRate: totalLeadsCount > 0 ? Math.round((uniqueCustomersCount / totalLeadsCount) * 100) : 0,
    },
  });
});

// @desc    Get paginated project report with stats (aggregation with date filter)
// @route   GET /api/v1/reports/projects?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getProjectsReport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = validatePagination(req.query, 50);
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);

  const { total, rows } = await buildProjectsReportRows({
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    skip,
    limit,
    reportView: req.query.reportView,
  });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: rows,
  });
});

// @desc    Get paginated staff report with stats (aggregation with date filter)
// @route   GET /api/v1/reports/staff?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getStaffReport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = validatePagination(req.query, 50);
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);

  const { total, rows } = await buildStaffReportRows({
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    skip,
    limit,
    reportView: req.query.reportView,
  });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: rows,
  });
});

// @desc    Get paginated attendance report with date filter
// @route   GET /api/v1/reports/attendance?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getAttendanceReport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = validatePagination(req.query, 100);
  const dateResult = getDateFilter(req.query);

  const { total, rows } = await buildAttendanceReportRows({
    startDate: dateResult.startDate,
    endDate: dateResult.endDate,
    startDateStr: dateResult.startDateStr,
    endDateStr: dateResult.endDateStr,
    skip,
    limit,
  });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: rows,
  });
});

// @desc    Get paginated leads and booking trend report
// @route   GET /api/v1/reports/leads-trend?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getLeadsTrendReport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = validatePagination(req.query, 50);
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);

  const { total, rows } = await buildLeadsTrendRows({
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    skip,
    limit,
    reportView: req.query.reportView,
  });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: rows,
  });
});

// @desc    Get paginated lead contribution report
// @route   GET /api/v1/reports/lead-contribution?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getLeadContributionReport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = validatePagination(req.query, 50);
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);

  const { total, rows } = await buildLeadContributionRows({
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    skip,
    limit,
    reportView: req.query.reportView,
  });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: rows,
  });
});

// @desc    Get channel partner performance report
// @route   GET /api/v1/reports/channel-partner-performance?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getChannelPartnerPerformanceReport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = validatePagination(req.query, 50);
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);

  const { total, rows } = await buildChannelPartnerPerformanceRows({
    startDate,
    endDate,
    startDateStr,
    endDateStr,
    skip,
    limit,
    reportView: req.query.reportView,
  });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: rows,
  });
});

module.exports = {
  getSummary: exports.getSummary,
  getOperationsMetrics: exports.getOperationsMetrics,
  getDashboardLeadCharts: exports.getDashboardLeadCharts,
  getProjectsReport: exports.getProjectsReport,
  getStaffReport: exports.getStaffReport,
  getAttendanceReport: exports.getAttendanceReport,
  getLeadsTrendReport: exports.getLeadsTrendReport,
  getLeadContributionReport: exports.getLeadContributionReport,
  getChannelPartnerPerformanceReport: exports.getChannelPartnerPerformanceReport,
  getDateFilter,
  buildLeadDateMatch,
  buildOperationsMetrics,
  buildDashboardLeadCharts,
  buildProjectsReportRows,
  buildStaffReportRows,
  buildAttendanceReportRows,
  buildLeadsTrendRows,
  buildLeadContributionRows,
  buildChannelPartnerPerformanceRows,
};
