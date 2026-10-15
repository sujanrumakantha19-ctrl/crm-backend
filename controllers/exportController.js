const asyncHandler = require('../middleware/async');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Project = require('../models/Project');
const Plot = require('../models/Plot');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
const ChannelPartner = require('../models/ChannelPartner');
const { streamCSV, streamArrayCSV } = require('../utils/csvStream');
const configs = require('../utils/exportConfigs');
const {
  buildProjectExportFilter,
  buildProjectDetailExportDocsForProject,
  buildProjectDetailExportDocsFromQuery,
} = require('../utils/projectDetailExport');
const { buildLeadExportFilter } = require('../utils/leadExportFilter');
const {
  getDateFilter,
  buildProjectsReportRows,
  buildStaffReportRows,
  buildAttendanceReportRows,
  buildLeadsTrendRows,
  buildLeadContributionRows,
  buildChannelPartnerPerformanceRows,
  buildOperationsMetrics,
} = require('./reportController');

exports.exportLeads = asyncHandler(async (req, res, next) => {
  const ErrorResponse = require('../utils/errorResponse');
  if (req.user && req.user.role === 'staff') {
    const staffUid = String(req.user.id || req.user._id);
    if (req.query.assignedTo && req.query.assignedTo !== 'unassigned' && String(req.query.assignedTo) !== staffUid) {
      return next(new ErrorResponse('Staff members are only authorized to export their own assigned leads', 403));
    }
  }

  const filter = buildLeadExportFilter(req.query, {}, req.user);

  // If customer grouping requested (e.g. tab=Customer or groupBy=customer), aggregate unique customers
  if (req.query.groupBy === 'customer' || (req.query.status === 'Customer' && req.query.groupBy !== 'none')) {
    const { getCustomerIdentityExpression } = require('../utils/customerMetrics');
    const groupKeyExpr = (req.query.status === 'Customer')
      ? getCustomerIdentityExpression()
      : {
          $cond: [
            { $eq: ['$status', 'Customer'] },
            getCustomerIdentityExpression(),
            { $concat: ['lead:', { $toString: '$_id' }] }
          ]
        };

    const aggCursor = Lead.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: groupKeyExpr,
          firstDoc: { $first: '$$ROOT' },
          relatedBookingCount: { $sum: 1 },
          relatedLeadDisplayIds: { $addToSet: '$displayId' },
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$firstDoc',
              {
                relatedBookingCount: '$relatedBookingCount',
                plotBookingCount: '$relatedBookingCount',
                relatedLeadDisplayIds: '$relatedLeadDisplayIds',
              }
            ]
          }
        }
      },
      {
        $lookup: {
          from: 'projects',
          localField: 'projectId',
          foreignField: '_id',
          as: 'projectDoc',
        },
      },
      {
        $lookup: {
          from: 'plots',
          localField: 'plotId',
          foreignField: '_id',
          as: 'plotDoc',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'userDoc',
        },
      },
      {
        $addFields: {
          projectId: { $ifNull: [{ $arrayElemAt: ['$projectDoc', 0] }, '$projectId'] },
          plotId: { $ifNull: [{ $arrayElemAt: ['$plotDoc', 0] }, '$plotId'] },
          assignedTo: { $ifNull: [{ $arrayElemAt: ['$userDoc', 0] }, '$assignedTo'] },
        },
      },
      {
        $project: {
          projectDoc: 0,
          plotDoc: 0,
          userDoc: 0,
        },
      },
      { $sort: { createdAt: -1, _id: -1 } }
    ]).cursor();

    return streamCSV(req, res, aggCursor, configs.leads.columns, configs.leads.filename);
  }

  const query = Lead.find(filter)
    .populate('assignedTo', 'name displayId')
    .populate('projectId', 'name displayId')
    .populate('plotId', 'plotNumber status')
    .lean()
    .cursor();

  streamCSV(req, res, query, configs.leads.columns, configs.leads.filename);
});

exports.exportFollowUps = asyncHandler(async (req, res) => {
  const { staffId } = req.query;

  const pipeline = [
    { $unwind: '$followUps' },
    { $sort: { 'followUps.date': -1, 'followUps._id': -1 } },
    {
      $group: {
        _id: '$_id',
        displayId: { $first: '$displayId' },
        customerName: { $first: '$customerName' },
        phone: { $first: '$phone' },
        city: { $first: '$city' },
        status: { $first: '$status' },
        assignedToName: { $first: '$assignedToName' },
        staffDisplayId: { $first: '$assignedToDisplayId' },
        followUps: { $first: '$followUps' },
      },
    },
    { $project: { _id: 0, displayId: 1, customerName: 1, phone: 1, city: 1, status: 1, assignedToName: 1, staffDisplayId: 1, followUps: 1 } },
  ];

  if (staffId) {
    const mongoose = require('mongoose');
    const id = mongoose.Types.ObjectId.isValid(staffId)
      ? new mongoose.Types.ObjectId(staffId)
      : staffId;
    pipeline.unshift({ $match: { assignedTo: id } });
  }

  const cursor = Lead.aggregate(pipeline).allowDiskUse(true).cursor();
  const cfg = staffId ? configs.followUpsStaff : configs.followUps;
  const columns = staffId
    ? configs.followUpsStaff.columns
    : configs.followUps.columns;

  streamCSV(req, res, cursor, columns, cfg.filename);
});

exports.exportAttendance = asyncHandler(async (req, res, next) => {
  const { queryDailyAttendance } = require('../services/attendanceDailyService');
  const ErrorResponse = require('../utils/errorResponse');
  const { date, employeeId, staffId, month, year, dateFrom, dateTo, status, tab } = req.query;
  const targetStaffId = employeeId || staffId || req.query.userId;

  // Enforce permissions:
  if (req.user && req.user.role === 'partner') {
    return next(new ErrorResponse('Channel partners are not authorized to export attendance', 403));
  }
  if (req.user && req.user.role === 'staff') {
    const staffUid = String(req.user.id || req.user._id);
    if (targetStaffId && String(targetStaffId) !== staffUid) {
      return next(new ErrorResponse('Staff members are only allowed to export their own attendance', 403));
    }
  }

  const result = await queryDailyAttendance({
    staffId: targetStaffId,
    date,
    month,
    year,
    dateFrom,
    dateTo,
    status,
    userRole: req.user ? req.user.role : 'admin',
    requestingUserId: req.user ? (req.user.id || req.user._id) : null,
    paginate: false,
  });

  const isModal = tab === 'details';
  let filename = isModal ? 'attendance-details' : 'attendance-summary';
  if (date) filename = `attendance-${date}`;
  else if (month) filename = `attendance-${month}`;
  else if (year) filename = `attendance-${year}`;

  if (isModal) {
    // Detail export: Flatten sessions, retaining separate session duration, daily duration and daily status
    const detailRows = [];
    result.allRecords.forEach(daily => {
      if (daily.sessions && daily.sessions.length > 0) {
        daily.sessions.forEach(s => {
          detailRows.push({
            staffName: daily.staffName,
            role: daily.role,
            date: daily.date,
            activityType: s.activityType || 'Office',
            location: s.location || (s.projectId && typeof s.projectId === 'object' ? s.projectId.location : '-') || '-',
            projectName: s.projectName || (s.projectId && typeof s.projectId === 'object' ? s.projectId.name : '-') || '-',
            checkIn: s.checkIn || '-',
            checkOut: s.checkOut || '-',
            sessionDuration: s.duration || (s.parsedMinutes ? `${Math.floor(s.parsedMinutes / 60)}h ${s.parsedMinutes % 60}m` : '-'),
            dailyDuration: daily.formattedDuration,
            dailyStatus: daily.status,
            status: daily.status,
            duration: s.duration || daily.formattedDuration,
          });
        });
      } else {
        detailRows.push({
          staffName: daily.staffName,
          role: daily.role,
          date: daily.date,
          activityType: 'Office',
          location: '-',
          projectName: '-',
          checkIn: '-',
          checkOut: '-',
          sessionDuration: '-',
          dailyDuration: daily.formattedDuration,
          dailyStatus: daily.status,
          status: daily.status,
          duration: '-',
        });
      }
    });

    const columns = [
      { key: 'staffName', label: 'Employee' },
      { key: 'role', label: 'Role' },
      { key: 'date', label: 'Date' },
      { key: 'activityType', label: 'Activity Type' },
      { key: 'location', label: 'Location' },
      { key: 'projectName', label: 'Project' },
      { key: 'checkIn', label: 'Check In' },
      { key: 'checkOut', label: 'Check Out' },
      { key: 'sessionDuration', label: 'Session Duration' },
      { key: 'dailyDuration', label: 'Daily Duration' },
      { key: 'dailyStatus', label: 'Daily Status' },
    ];

    streamArrayCSV(req, res, detailRows, columns, filename);
  } else {
    // Summary export: One staff/day row with daily status, daily duration, first check-in, last check-out
    const summaryRows = result.allRecords.map(daily => ({
      staffName: daily.staffName,
      role: daily.role,
      date: daily.date,
      status: daily.status,
      checkIn: daily.firstCheckIn || '-',
      checkOut: daily.lastCheckOut || '-',
      duration: daily.formattedDuration,
      sessionsCount: daily.sessionsCount || 0,
      activityType: daily.currentActivity || 'Office',
      location: daily.currentLocation || '-',
      projectName: daily.currentLocation || '-',
      isOverridden: daily.isOverridden ? 'Yes' : 'No',
      overrideNotes: daily.overrideNotes || '',
    }));

    const columns = [
      { key: 'staffName', label: 'Staff' },
      { key: 'role', label: 'Role' },
      { key: 'date', label: 'Date' },
      { key: 'status', label: 'Status' },
      { key: 'checkIn', label: 'First Check In' },
      { key: 'checkOut', label: 'Last Check Out' },
      { key: 'duration', label: 'Daily Worked Hours' },
      { key: 'sessionsCount', label: 'Sessions Count' },
      { key: 'isOverridden', label: 'Admin Overridden' },
      { key: 'activityType', label: 'Activity Type' },
      { key: 'location', label: 'Location' },
    ];

    streamArrayCSV(req, res, summaryRows, columns, filename);
  }
});

exports.exportTasks = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.assignedTo && req.query.assignedTo !== 'all' && req.query.assignedTo !== 'All') {
    filter.assignee = req.query.assignedTo;
  }
  if (req.query.project && req.query.project !== 'All') {
    if (req.query.project === 'General') {
      filter.$or = [{ project: null }, { project: { $exists: false } }];
    } else {
      filter.project = req.query.project;
    }
  }
  if (req.query.dueDate) filter.dueDate = req.query.dueDate;
  if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;

  const cursor = Task.find(filter)
    .populate('assignee', 'name displayId')
    .populate('project', 'name displayId')
    .lean()
    .cursor();

  streamCSV(req, res, cursor, configs.tasks.columns, configs.tasks.filename);
});

exports.exportProjects = asyncHandler(async (req, res) => {
  const filter = buildProjectExportFilter(req.query);

  const projects = await Project.find(filter).sort({ name: 1 }).lean();
  if (projects.length === 0) {
    streamArrayCSV(req, res, [], configs.projects.columns, configs.projects.filename);
    return;
  }

  const projectIds = projects.map((p) => p._id);

  const plotStats = await Plot.aggregate([
    { $match: { projectId: { $in: projectIds } } },
    {
      $group: {
        _id: { projectId: '$projectId', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]);

  const statsMap = new Map();
  for (const stat of plotStats) {
    const pid = String(stat._id.projectId);
    if (!statsMap.has(pid)) {
      statsMap.set(pid, { Available: 0, Booked: 0, Registered: 0 });
    }
    const current = statsMap.get(pid);
    if (current && current[stat._id.status] !== undefined) {
      current[stat._id.status] = stat.count;
    }
  }

  const rows = projects.map((p) => {
    const pid = String(p._id);
    const stats = statsMap.get(pid) || { Available: 0, Booked: 0, Registered: 0 };
    return {
      ...p,
      availablePlots: stats.Available,
      bookedPlots: stats.Booked,
      registeredPlots: stats.Registered,
    };
  });

  streamArrayCSV(req, res, rows, configs.projects.columns, configs.projects.filename);
});

exports.exportProjectDetail = asyncHandler(async (req, res) => {
  const { id } = req.query;
  if (!id) {
    res.status(400).json({ success: false, error: 'Project ID is required' });
    return;
  }

  const project = await Project.findById(id).lean();
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }

  const docs = await buildProjectDetailExportDocsForProject(id);
  streamArrayCSV(req, res, docs, configs.projectDetail.columns, configs.projectDetail.filename);
});

exports.exportCustomers = asyncHandler(async (req, res) => {
  const filter = buildLeadExportFilter(req.query, { status: 'Customer' });

  const cursor = Lead.find(filter)
    .populate('assignedTo', 'name displayId')
    .populate('projectId', 'name displayId')
    .populate('plotId', 'plotNumber expectedRegistrationDate docNumber')
    .lean()
    .cursor();

  streamCSV(req, res, cursor, configs.customers.columns, configs.customers.filename);
});

exports.exportLoans = asyncHandler(async (req, res) => {
  const filter = buildLeadExportFilter(req.query, { status: 'Customer', paymentMethod: 'LOAN' });

  const cursor = Lead.find(filter)
    .populate('assignedTo', 'name displayId')
    .populate('projectId', 'name displayId')
    .populate('plotId', 'plotNumber expectedRegistrationDate docNumber')
    .lean()
    .cursor();

  streamCSV(req, res, cursor, configs.customers.columns, 'loans');
});

exports.exportUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive !== undefined && req.query.isActive !== 'all' && req.query.isActive !== 'All') {
    filter.isActive = String(req.query.isActive) === 'true';
  } else if (req.query.status === 'active' || req.query.status === 'Active') {
    filter.isActive = true;
  } else if (req.query.status === 'inactive' || req.query.status === 'Inactive') {
    filter.isActive = false;
  }

  const cursor = User.find(filter)
    .populate('groupId', 'name')
    .lean()
    .cursor();

  streamCSV(req, res, cursor, configs.staff.columns, configs.staff.filename);
});

exports.exportChannelPartners = asyncHandler(async (req, res) => {
  const cursor = ChannelPartner.find().lean().cursor();
  streamCSV(req, res, cursor, configs.channelPartners.columns, configs.channelPartners.filename);
});

exports.exportReports = asyncHandler(async (req, res) => {
  const { tab, reportView } = req.query;
  const { startDate, endDate, startDateStr, endDateStr } = getDateFilter(req.query);

  const filterParams = { startDate, endDate, startDateStr, endDateStr, reportView };

  switch (tab) {
    case 'projects': {
      const { rows } = await buildProjectsReportRows(filterParams);
      streamArrayCSV(req, res, rows, configs.reportProjects.columns, configs.reportProjects.filename);
      return;
    }
    case 'attendance': {
      const { rows } = await buildAttendanceReportRows(filterParams);
      streamArrayCSV(req, res, rows, configs.reportAttendance.columns, configs.reportAttendance.filename);
      return;
    }
    case 'staff': {
      const { rows } = await buildStaffReportRows(filterParams);
      streamArrayCSV(req, res, rows, configs.reportStaff.columns, configs.reportStaff.filename);
      return;
    }
    case 'leads-trend': {
      const { rows } = await buildLeadsTrendRows(filterParams);
      streamArrayCSV(req, res, rows, configs.reportLeadsTrend.columns, configs.reportLeadsTrend.filename);
      return;
    }
    case 'lead-contribution': {
      const { rows } = await buildLeadContributionRows(filterParams);
      streamArrayCSV(req, res, rows, configs.reportLeadContribution.columns, configs.reportLeadContribution.filename);
      return;
    }
    case 'channel-partner-performance': {
      const { rows } = await buildChannelPartnerPerformanceRows(filterParams);
      streamArrayCSV(req, res, rows, configs.reportChannelPartnerPerformance.columns, configs.reportChannelPartnerPerformance.filename);
      return;
    }
    case 'operations': {
      const data = await buildOperationsMetrics({
        startDate,
        endDate,
        startDateStr,
        endDateStr,
        reportView: 'admin',
      });
      const rows = [
        { metric: 'Total Customers (Unique)', value: data.totalCustomers },
        { metric: 'Loan Customers', value: data.totalLoans },
        { metric: 'Total Bookings', value: data.totalBookings },
        { metric: 'Registrations Pending', value: data.registrationPending },
        { metric: "Today's Scheduled Registrations", value: data.todaysRegistrations },
        { metric: 'Pending Payment Registrations', value: data.pendingPaymentRegistrations },
        { metric: 'Payments - Fully Paid', value: data.bookingPayments?.fullyPaid || 0 },
        { metric: 'Payments - Advance Paid', value: data.bookingPayments?.advancePaid || 0 },
        { metric: 'Payments - Advance Not Paid', value: data.bookingPayments?.advanceNotPaid || 0 },
        { metric: 'Payments - Partially Paid', value: data.bookingPayments?.partiallyPaid || 0 },
        { metric: 'Payments - Not Paid', value: data.bookingPayments?.notPaid || 0 },
      ];
      if (data.unknownBookingDateCount !== undefined && data.unknownBookingDateCount > 0) {
        rows.push({ metric: 'Plots with Unknown Booking Date', value: data.unknownBookingDateCount });
      }
      streamArrayCSV(req, res, rows, configs.reportOperations.columns, configs.reportOperations.filename);
      return;
    }
    default:
      res.status(400).json({ success: false, error: 'Invalid report tab' });
  }
});
