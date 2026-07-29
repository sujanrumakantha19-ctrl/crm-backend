const asyncHandler = require('../middleware/async');
const Project = require('../models/Project');
const Plot = require('../models/Plot');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const ChannelPartner = require('../models/ChannelPartner');

// Helper to parse date filter from request query
function getDateFilter(query) {
  let { dateFrom, dateTo, month, year } = query;
  let startDate = null;
  let endDate = null;

  if (dateFrom) {
    startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
  }
  if (dateTo) {
    endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);
  }

  if (!dateFrom && !dateTo) {
    if (month && year) {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      endDate = new Date(y, m, 0, 23, 59, 59, 999);
    } else if (year) {
      const y = parseInt(year, 10);
      startDate = new Date(y, 0, 1, 0, 0, 0, 0);
      endDate = new Date(y, 11, 31, 23, 59, 59, 999);
    } else if (month) {
      const now = new Date();
      const m = parseInt(month, 10);
      const y = now.getFullYear();
      startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      endDate = new Date(y, m, 0, 23, 59, 59, 999);
    }
  }

  return { startDate, endDate };
}

// Build Mongoose date match query for Lead (createdAt or dateAdded)
function buildLeadDateMatch(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const cond = {};
  if (startDate) cond.$gte = startDate;
  if (endDate) cond.$lte = endDate;
  return {
    $or: [
      { createdAt: cond },
      { dateAdded: cond }
    ]
  };
}

// @desc    Get report summary cards (aggregated counts with date filter)
// @route   GET /api/v1/reports/summary
// @access  Private
exports.getSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = getDateFilter(req.query);

  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const plotMatch = {};
  if (startDate || endDate) {
    const pCond = {};
    if (startDate) pCond.$gte = startDate;
    if (endDate) pCond.$lte = endDate;
    plotMatch.updatedAt = pCond;
  }

  const projectMatch = {};
  if (startDate || endDate) {
    const prCond = {};
    if (startDate) prCond.$gte = startDate;
    if (endDate) prCond.$lte = endDate;
    projectMatch.createdAt = prCond;
  }

  const [
    totalProjects,
    leadStats,
    bookedPlotsCount,
  ] = await Promise.all([
    Project.countDocuments(projectMatch),
    Lead.aggregate([
      ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          customers: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
          open: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
          loanCustomers: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] }, 1, 0],
            },
          },
          cashCustomers: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] }, 1, 0],
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
    Plot.countDocuments({ status: { $in: ['Booked', 'Registered'] }, ...plotMatch }),
  ]);

  const stats = leadStats[0] || {
    total: 0,
    customers: 0,
    open: 0,
    qualified: 0,
    loanCustomers: 0,
    cashCustomers: 0,
    bookedFromLeads: 0,
  };

  res.status(200).json({
    success: true,
    data: {
      totalProjects,
      totalLeads: stats.total,
      totalCustomers: stats.customers,
      totalPlotsBooked: Math.max(bookedPlotsCount, stats.bookedFromLeads),
      loanCustomers: stats.loanCustomers,
      cashCustomers: stats.cashCustomers,
      funnelOpen: stats.open,
      funnelQualified: stats.qualified,
      funnelCustomer: stats.customers,
      conversionRate: stats.total > 0 ? Math.round((stats.customers / stats.total) * 100) : 0,
    },
  });
});

// @desc    Get paginated project report with stats (aggregation with date filter)
// @route   GET /api/v1/reports/projects?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private
exports.getProjectsReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const [total, projectStats] = await Promise.all([
    Project.countDocuments({}),
    Project.aggregate([
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
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
                $expr: { $eq: ['$projectId', '$$projId'] },
                ...(Object.keys(leadMatch).length > 0 ? leadMatch : {})
              }
            }
          ],
          as: 'leads',
        },
      },
      {
        $project: {
          name: 1,
          location: 1,
          status: 1,
          surveyNumber: 1,
          createdAt: 1,
          plotCount: { $size: '$plots' },
          booked: {
            $max: [
              {
                $size: {
                  $filter: {
                    input: '$plots',
                    as: 'p',
                    cond: { $eq: ['$$p.status', 'Booked'] },
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
                        { $gt: ['$$l.plotId', null] },
                      ],
                    },
                  },
                },
              },
            ],
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
                cond: { $eq: ['$$p.status', 'Available'] },
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
          leadCount: { $size: '$leads' },
          loanBookings: {
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
          cashBookings: {
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
        },
      },
    ]),
  ]);

  const convertToSqFt = (v, u) => {
    if (!v || isNaN(v)) return 0;
    const uu = (u || '').toLowerCase().replace(/\s/g, '');
    if (uu === 'acres' || uu === 'acre') return v * 43560;
    if (uu === 'sqyards' || uu === 'sqyard' || uu === 'sqyd' || uu === 'sqyds') return v * 9;
    if (uu === 'cents' || uu === 'cent') return v * 435.6;
    if (uu === 'guntas' || uu === 'gunta') return v * 1089;
    return v;
  };

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

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: formattedStats,
  });
});

// @desc    Get paginated staff report with stats (aggregation with date filter)
// @route   GET /api/v1/reports/staff?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private
exports.getStaffReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const [total, staffStats] = await Promise.all([
    User.countDocuments({ role: 'staff' }),
    User.aggregate([
      { $match: { role: 'staff' } },
      { $sort: { name: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'leads',
          let: { staffId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$assignedTo', '$$staffId'] },
                ...(Object.keys(leadMatch).length > 0 ? leadMatch : {})
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
          assignedLeads: { $size: '$leads' },
          converted: {
            $size: {
              $filter: {
                input: '$leads',
                as: 'l',
                cond: { $eq: ['$$l.status', 'Customer'] },
              },
            },
          },
          open: {
            $size: {
              $filter: {
                input: '$leads',
                as: 'l',
                cond: { $eq: ['$$l.status', 'Open'] },
              },
            },
          },
          loanConversions: {
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
          cashConversions: {
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
        },
      },
    ]),
  ]);

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: staffStats,
  });
});

// @desc    Get paginated attendance report with date filter
// @route   GET /api/v1/reports/attendance?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private
exports.getAttendanceReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 100);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const query = {};
  if (startDate || endDate) {
    const dateCond = {};
    if (startDate) dateCond.$gte = startDate.toISOString().slice(0, 10);
    if (endDate) dateCond.$lte = endDate.toISOString().slice(0, 10);
    query.date = dateCond;
  }

  const [total, records] = await Promise.all([
    Attendance.countDocuments(query),
    Attendance.find(query).sort('-date -createdAt').skip(skip).limit(limit).lean(),
  ]);

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: records,
  });
});

// @desc    Get paginated leads and booking trend report
// @route   GET /api/v1/reports/leads-trend?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private
exports.getLeadsTrendReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
    {
      $project: {
        dateStr: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $ifNull: ['$createdAt', '$dateAdded'] },
          },
        },
        status: 1,
        plotId: 1,
        paymentMethod: 1,
      },
    },
    {
      $group: {
        _id: '$dateStr',
        totalLeads: { $sum: 1 },
        openLeads: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
        qualifiedLeads: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
        customers: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
        plotsBooked: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $gt: ['$plotId', null] }] },
              1,
              0,
            ],
          },
        },
        loanBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
              1,
              0,
            ],
          },
        },
        cashBookings: {
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
    { $sort: { _id: -1 } },
  ];

  const trendDataAll = await Lead.aggregate(pipeline);
  const total = trendDataAll.length;
  const paginatedData = trendDataAll.slice(skip, skip + limit).map(item => ({
    date: item._id || '-',
    totalLeads: item.totalLeads,
    openLeads: item.openLeads,
    qualifiedLeads: item.qualifiedLeads,
    customers: item.customers,
    plotsBooked: item.plotsBooked,
    loanBookings: item.loanBookings,
    cashBookings: item.cashBookings,
    conversionRate: item.totalLeads > 0 ? Math.round((item.customers / item.totalLeads) * 100) : 0,
  }));

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: paginatedData,
  });
});

// @desc    Get paginated lead contribution report
// @route   GET /api/v1/reports/lead-contribution?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private
exports.getLeadContributionReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    ...(Object.keys(leadMatch).length > 0 ? [{ $match: leadMatch }] : []),
    {
      $group: {
        _id: { $ifNull: ['$sourceType', 'Direct / Other'] },
        totalLeads: { $sum: 1 },
        converted: { $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] } },
        plotsBooked: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $gt: ['$plotId', null] }] },
              1,
              0,
            ],
          },
        },
        loanBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
              1,
              0,
            ],
          },
        },
        cashBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'CASH'] }] },
              1,
              0,
            ],
          },
        },
        latestLeadDate: { $max: { $ifNull: ['$createdAt', '$dateAdded'] } },
      },
    },
    { $sort: { totalLeads: -1 } },
  ];

  const contribAll = await Lead.aggregate(pipeline);
  const grandTotalLeads = contribAll.reduce((acc, curr) => acc + curr.totalLeads, 0);
  const total = contribAll.length;

  const paginatedData = contribAll.slice(skip, skip + limit).map(item => ({
    sourceType: item._id,
    latestDate: item.latestLeadDate ? new Date(item.latestLeadDate).toISOString().slice(0, 10) : '-',
    totalLeads: item.totalLeads,
    converted: item.converted,
    plotsBooked: item.plotsBooked,
    loanBookings: item.loanBookings,
    cashBookings: item.cashBookings,
    contributionPercentage: grandTotalLeads > 0 ? Math.round((item.totalLeads / grandTotalLeads) * 1000) / 10 : 0,
    conversionRate: item.totalLeads > 0 ? Math.round((item.converted / item.totalLeads) * 100) : 0,
  }));

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: paginatedData,
  });
});

// @desc    Get channel partner performance report
// @route   GET /api/v1/reports/channel-partner-performance
// @access  Private
exports.getChannelPartnerPerformanceReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = getDateFilter(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 12);
  const skip = (page - 1) * limit;

  // Get all channel partners
  const allPartners = await ChannelPartner.find({}).lean();

  // Build lead match for date filter
  const leadDateMatch = buildLeadDateMatch(startDate, endDate);

  // Aggregate leads by source name (channel partner name) where sourceType is 'Channel Partner'
  const leadsByPartner = await Lead.aggregate([
    {
      $match: {
        sourceType: 'Channel Partner',
        ...(Object.keys(leadDateMatch).length > 0 ? leadDateMatch : {}),
      },
    },
    {
      $group: {
        _id: { $ifNull: ['$source', 'Unknown'] },
        totalLeads: { $sum: 1 },
        converted: {
          $sum: { $cond: [{ $eq: ['$status', 'Customer'] }, 1, 0] },
        },
        plotsBooked: {
          $sum: { $cond: [{ $ifNull: ['$plotId', false] }, 1, 0] },
        },
        loanBookings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'Customer'] }, { $eq: ['$paymentMethod', 'LOAN'] }] },
              1,
              0,
            ],
          },
        },
        cashBookings: {
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

  // Build a map of leads by partner name for quick lookup
  const leadsMap = {};
  leadsByPartner.forEach(l => {
    leadsMap[l._id] = l;
  });

  // Merge partner info with lead stats
  const merged = allPartners.map(cp => {
    const leadsInfo = leadsMap[cp.name] || {};
    const totalLeads = leadsInfo.totalLeads || 0;
    const converted = leadsInfo.converted || 0;
    return {
      _id: cp._id,
      name: cp.name,
      phone: cp.phone || '-',
      company: cp.companyName || '-',
      totalLeads,
      converted,
      plotsBooked: leadsInfo.plotsBooked || 0,
      loanBookings: leadsInfo.loanBookings || 0,
      cashBookings: leadsInfo.cashBookings || 0,
      conversionRate: totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0,
    };
  });

  // Sort by totalLeads descending
  merged.sort((a, b) => b.totalLeads - a.totalLeads);

  const total = merged.length;
  const paginatedData = merged.slice(skip, skip + limit);

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: paginatedData,
  });
});
