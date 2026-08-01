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
  getDateFilter,
  buildProjectsReportRows,
  buildStaffReportRows,
  buildAttendanceReportRows,
  buildLeadsTrendRows,
  buildLeadContributionRows,
  buildChannelPartnerPerformanceRows,
} = require('./reportController');

exports.exportLeads = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;
  if (req.query.search) filter.customerName = { $regex: req.query.search, $options: 'i' };

  if (req.query.assignedTo === 'unassigned') {
    filter.assignedTo = null;
  } else if (req.query.assignedTo) {
    filter.assignedTo = req.query.assignedTo;
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

exports.exportAttendance = asyncHandler(async (req, res) => {
  const { date, employeeId, month, tab } = req.query;
  const filter = {};
  if (date) filter.date = { $regex: `^${date}` };
  if (month) filter.date = { $regex: `^${month}` };
  if (employeeId) filter.staffId = employeeId;

  const query = Attendance.find(filter).lean();

  const isModal = tab === 'details';
  const cfg = isModal ? configs.attendanceModal : configs.attendanceMain;

  const cursor = query.cursor();
  streamCSV(req, res, cursor, cfg.columns, cfg.filename);
});

exports.exportTasks = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.assignedTo) filter.assignee = req.query.assignedTo;

  const cursor = Task.find(filter)
    .populate('assignee', 'name displayId')
    .populate('project', 'name displayId')
    .lean()
    .cursor();

  streamCSV(req, res, cursor, configs.tasks.columns, configs.tasks.filename);
});

exports.exportProjects = asyncHandler(async (req, res) => {
  const cursor = Project.aggregate([
    {
      $lookup: {
        from: 'plots',
        localField: '_id',
        foreignField: 'projectId',
        as: 'plots',
      },
    },
    {
      $addFields: {
        availablePlots: {
          $size: {
            $filter: {
              input: '$plots',
              as: 'p',
              cond: { $eq: ['$$p.status', 'Available'] },
            },
          },
        },
      },
    },
    { $project: { plots: 0 } },
  ]).cursor();

  streamCSV(req, res, cursor, configs.projects.columns, configs.projects.filename);
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

  const plots = await Plot.find({ projectId: id }).sort({ plotNumber: 1 }).lean();

  const plotIds = plots.map(p => p._id);
  const leads = await Lead.find({
    $or: [{ projectId: id }, { plotId: { $in: plotIds } }],
  }).lean();

  const leadById = new Map();
  const leadByPhone = new Map();
  for (const l of leads) {
    leadById.set(String(l._id), l);
    if (l.phone) leadByPhone.set(String(l.phone), l);
  }

  const docs = plots.map(plot => {
    const leadIdCandidate = plot.bookedBy?.leadId || plot.pendingApproval?.leadId;
    let lead = leadIdCandidate ? leadById.get(String(leadIdCandidate)) : undefined;
    if (!lead && plot.bookedBy?.phone) {
      lead = leadByPhone.get(String(plot.bookedBy.phone));
    }

    let latestFollowUp;
    if (lead && Array.isArray(lead.followUps) && lead.followUps.length > 0) {
      const sorted = [...lead.followUps].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });
      const last = sorted[0];
      latestFollowUp = {
        date: last.date || '',
        outcome: last.outcome || '',
        notes: last.notes || '',
      };
    }

    return { project, plot, lead: lead || null, latestFollowUp };
  });

  streamArrayCSV(req, res, docs, configs.projectDetail.columns, configs.projectDetail.filename);
});

exports.exportCustomers = asyncHandler(async (req, res) => {
  const filter = { status: 'Customer' };
  if (req.query.search) filter.customerName = { $regex: req.query.search, $options: 'i' };

  const cursor = Lead.find(filter)
    .populate('projectId', 'name displayId')
    .populate('plotId', 'plotNumber expectedRegistrationDate')
    .lean()
    .cursor();

  streamCSV(req, res, cursor, configs.customers.columns, configs.customers.filename);
});

exports.exportUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;

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
  const { tab } = req.query;
  const { startDate, endDate } = getDateFilter(req.query);

  switch (tab) {
    case 'projects': {
      const { rows } = await buildProjectsReportRows({ startDate, endDate });
      streamArrayCSV(req, res, rows, configs.reportProjects.columns, configs.reportProjects.filename);
      return;
    }
    case 'attendance': {
      const { rows } = await buildAttendanceReportRows({ startDate, endDate });
      streamArrayCSV(req, res, rows, configs.reportAttendance.columns, configs.reportAttendance.filename);
      return;
    }
    case 'staff': {
      const { rows } = await buildStaffReportRows({ startDate, endDate });
      streamArrayCSV(req, res, rows, configs.reportStaff.columns, configs.reportStaff.filename);
      return;
    }
    case 'leads-trend': {
      const { rows } = await buildLeadsTrendRows({ startDate, endDate });
      streamArrayCSV(req, res, rows, configs.reportLeadsTrend.columns, configs.reportLeadsTrend.filename);
      return;
    }
    case 'lead-contribution': {
      const { rows } = await buildLeadContributionRows({ startDate, endDate });
      streamArrayCSV(req, res, rows, configs.reportLeadContribution.columns, configs.reportLeadContribution.filename);
      return;
    }
    case 'channel-partner-performance': {
      const { rows } = await buildChannelPartnerPerformanceRows({ startDate, endDate });
      streamArrayCSV(req, res, rows, configs.reportChannelPartnerPerformance.columns, configs.reportChannelPartnerPerformance.filename);
      return;
    }
    default:
      res.status(400).json({ success: false, error: 'Invalid report tab' });
  }
});
