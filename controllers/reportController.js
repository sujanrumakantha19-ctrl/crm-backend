const asyncHandler = require('../middleware/async');
const mongoose = require('mongoose');
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

async function buildProjectsReportRows({ startDate, endDate, skip, limit }) {
  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    { $sort: { createdAt: -1 } },
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

async function buildStaffReportRows({ startDate, endDate, skip, limit }) {
  const leadMatch = buildLeadDateMatch(startDate, endDate);

  const pipeline = [
    { $match: { role: 'staff' } },
    { $sort: { name: 1 } },
    ...(Number.isInteger(skip) && skip > 0 ? [{ $skip: skip }] : []),
    ...(Number.isInteger(limit) && limit > 0 ? [{ $limit: limit }] : []),
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
              cond: { $in: ['$$l.status', ['Open', 'Lead']] },
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
  ];

  const [total, rows] = await Promise.all([
    User.countDocuments({ role: 'staff' }),
    User.aggregate(pipeline),
  ]);

  return { total, rows };
}

async function buildAttendanceReportRows({ startDate, endDate, skip, limit }) {
  const query = {};
  if (startDate || endDate) {
    const dateCond = {};
    if (startDate) dateCond.$gte = startDate.toISOString().slice(0, 10);
    if (endDate) dateCond.$lte = endDate.toISOString().slice(0, 10);
    query.date = dateCond;
  }

  const base = Attendance.find(query).sort('-date -createdAt');
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

async function buildLeadsTrendRows({ startDate, endDate, skip, limit }) {
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
        openLeads: { $sum: { $cond: [{ $in: ['$status', ['Open', 'Lead']] }, 1, 0] } },
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

async function buildLeadContributionRows({ startDate, endDate, skip, limit }) {
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

async function buildChannelPartnerPerformanceRows({ startDate, endDate }) {
  // Get all channel partners
  const allPartners = await ChannelPartner.find({}).lean();

  // Build lead match for date filter
  const leadDateMatch = buildLeadDateMatch(startDate, endDate);

  // Aggregate leads by partner. Newer leads carry sourceId (the partner's user
  // id) so renamed/colliding names do not conflate stats; legacy leads (no
  // sourceId) fall back to the source name.
  const leadsByPartner = await Lead.aggregate([
    {
      $match: {
        sourceType: 'Channel Partner',
        ...(Object.keys(leadDateMatch).length > 0 ? leadDateMatch : {}),
      },
    },
    {
      $group: {
        _id: {
          sourceId: '$sourceId',
          source: { $ifNull: ['$source', 'Unknown'] },
        },
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

  // Map leads by sourceId (partner user id) primarily, then by name as fallback.
  const leadsMap = new Map();
  leadsByPartner.forEach(l => {
    const idKey = l._id.sourceId ? `id:${String(l._id.sourceId)}` : null;
    const nameKey = `name:${l._id.source}`;
    if (idKey) leadsMap.set(idKey, l);
    leadsMap.set(nameKey, l);
  });

  // Merge partner info with lead stats
  const merged = allPartners.map(cp => {
    const idKey = cp.userId ? `id:${String(cp.userId)}` : null;
    const leadsInfo = (idKey && leadsMap.get(idKey)) || leadsMap.get(`name:${cp.name}`) || {};
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

  return { total: merged.length, rows: merged };
}

// Build plot booking-date filter (bookedBy.bookedAt string, fallback updatedAt for legacy rows)
function buildPlotBookingDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return null;

  const bookedAtRange = {};
  if (startDate) bookedAtRange.$gte = startDate.toISOString().slice(0, 10);
  if (endDate) bookedAtRange.$lte = endDate.toISOString().slice(0, 10);

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

async function buildOperationsMetrics({ startDate, endDate, assignedTo }) {
  const staffScope = await resolveStaffPlotScope(assignedTo);
  const dateFilter = buildPlotBookingDateFilter(startDate, endDate);

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

  const loanLeadMatch = { status: 'Customer', paymentMethod: 'LOAN' };
  const customerLeadMatch = { status: 'Customer' };
  if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
    loanLeadMatch.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    customerLeadMatch.assignedTo = new mongoose.Types.ObjectId(assignedTo);
  }
  const [totalLoans, totalCustomers] = await Promise.all([
    Lead.countDocuments(loanLeadMatch),
    Lead.countDocuments(customerLeadMatch),
  ]);

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

  return {
    totalLoans,
    totalCustomers,
    registrationPending: pendingStats?.count || 0,
    totalBookings: bookingStats?.totalBookings || 0,
    todaysRegistrations: todaysRegStats?.count || 0,
    pendingPaymentRegistrations: pendingPaymentStats?.count || 0,
    bookingPayments: {
      notPaid: bookingStats?.notPaid || 0,
      partiallyPaid: bookingStats?.partiallyPaid || 0,
      advancePaid: bookingStats?.advancePaid || 0,
      advanceNotPaid: bookingStats?.advanceNotPaid || 0,
    },
  };
}

// @desc    Operations dashboard metrics (loans, registrations pending, bookings, payment breakdown)
// @route   GET /api/v1/reports/operations-metrics
// @access  Private/Admin + Staff (staff auto-scoped to assigned bookings)
exports.getOperationsMetrics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = getDateFilter(req.query);

  let assignedTo = null;
  if (req.user.role === 'staff') {
    assignedTo = String(req.user.id || req.user._id);
  } else if (req.query.assignedTo) {
    assignedTo = String(req.query.assignedTo);
  }

  const data = await buildOperationsMetrics({ startDate, endDate, assignedTo });

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
          open: { $sum: { $cond: [{ $in: ['$status', ['Open', 'Lead']] }, 1, 0] } },
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
// @access  Private/Admin
exports.getProjectsReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const { total, rows } = await buildProjectsReportRows({ startDate, endDate, skip, limit });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: rows,
  });
});

// @desc    Get paginated staff report with stats (aggregation with date filter)
// @route   GET /api/v1/reports/staff?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getStaffReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const { total, rows } = await buildStaffReportRows({ startDate, endDate, skip, limit });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: rows,
  });
});

// @desc    Get paginated attendance report with date filter
// @route   GET /api/v1/reports/attendance?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getAttendanceReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 100);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const { total, rows } = await buildAttendanceReportRows({ startDate, endDate, skip, limit });

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: rows,
  });
});

// @desc    Get paginated leads and booking trend report
// @route   GET /api/v1/reports/leads-trend?page=1&limit=12&month=...&year=...&dateFrom=...&dateTo=...
// @access  Private/Admin
exports.getLeadsTrendReport = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const { total, rows } = await buildLeadsTrendRows({ startDate, endDate, skip, limit });

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
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const { total, rows } = await buildLeadContributionRows({ startDate, endDate, skip, limit });

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
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 12);
  const skip = (page - 1) * limit;
  const { startDate, endDate } = getDateFilter(req.query);

  const { total, rows } = await buildChannelPartnerPerformanceRows({ startDate, endDate });
  const paginatedData = rows.slice(skip, skip + limit);

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: paginatedData,
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
