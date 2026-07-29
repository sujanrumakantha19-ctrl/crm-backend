const asyncHandler = require('../middleware/async');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
const ChannelPartner = require('../models/ChannelPartner');
const { streamCSV } = require('../utils/csvStream');
const configs = require('../utils/exportConfigs');

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
    .lean()
    .cursor();

  streamCSV(req, res, query, configs.leads.columns, configs.leads.filename);
});

exports.exportFollowUps = asyncHandler(async (req, res) => {
  const { staffId } = req.query;
  const nameField = staffId ? 'staffName' : 'staffDisplayId';

  const pipeline = [
    { $unwind: '$followUps' },
    { $sort: { 'followUps.date': -1, 'followUps._id': -1 } },
    {
      $group: {
        _id: '$_id',
        customerName: { $first: '$customerName' },
        displayId: { $first: '$displayId' },
        phone: { $first: '$phone' },
        city: { $first: '$city' },
        status: { $first: '$status' },
        assignedToName: { $first: '$assignedToName' },
        staffDisplayId: { $first: '$assignedToDisplayId' },
        followUps: { $first: '$followUps' },
      },
    },
  ];

  if (staffId) {
    const mongoose = require('mongoose');
    const id = mongoose.Types.ObjectId.isValid(staffId)
      ? new mongoose.Types.ObjectId(staffId)
      : staffId;
    pipeline.unshift({ $match: { assignedTo: id } });
  }

  const docs = await Lead.aggregate(pipeline).allowDiskUse(true);
  const cfg = staffId ? configs.followUpsStaff : configs.followUps;
  const columns = staffId
    ? configs.followUpsStaff.columns
    : configs.followUps.columns;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const dateStr = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Disposition', `attachment; filename="${cfg.filename}_${dateStr}.csv"`);
  res.write('\uFEFF');
  res.write(columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',') + '\n');

  for (const doc of docs) {
    const row = columns.map(c => {
      let val = c.key.split('.').reduce((o, k) => (o != null ? o[k] : undefined), doc);
      if (c.format) val = c.format(val, doc);
      if (val == null) val = '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',');
    res.write(row + '\n');
  }
  res.end();
});

exports.exportAttendance = asyncHandler(async (req, res) => {
  const { date, employeeId, tab } = req.query;
  const filter = {};
  if (date) filter.date = { $regex: `^${date}` };
  if (employeeId) filter.staffId = employeeId;

  let query = Attendance.find(filter).lean();

  const isModal = tab === 'details';
  const cfg = isModal ? configs.attendanceModal : configs.attendanceMain;

  const cursor = query.cursor();
  streamCSV(req, res, cursor, cfg.columns, cfg.filename);
});

exports.exportTasks = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.assignedTo) filter.assignee = req.query.assignedTo;

  const cursor = Task.find(filter)
    .populate('assignee', 'name')
    .lean()
    .cursor();

  streamCSV(req, res, cursor, configs.tasks.columns, configs.tasks.filename);
});

exports.exportProjects = asyncHandler(async (req, res) => {
  const cursor = Project.find().lean().cursor();
  streamCSV(req, res, cursor, configs.projects.columns, configs.projects.filename);
});

exports.exportCustomers = asyncHandler(async (req, res) => {
  const filter = { status: 'Customer' };
  if (req.query.search) filter.customerName = { $regex: req.query.search, $options: 'i' };

  const cursor = Lead.find(filter).lean().cursor();
  streamCSV(req, res, cursor, configs.customers.columns, configs.customers.filename);
});

exports.exportUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;

  const cursor = User.find(filter).lean().cursor();
  streamCSV(req, res, cursor, configs.staff.columns, configs.staff.filename);
});

exports.exportChannelPartners = asyncHandler(async (req, res) => {
  const cursor = ChannelPartner.find().lean().cursor();
  streamCSV(req, res, cursor, configs.channelPartners.columns, configs.channelPartners.filename);
});

exports.exportReports = asyncHandler(async (req, res) => {
  const { tab } = req.query;
  const Project = require('../models/Project');
  const Attendance = require('../models/Attendance');
  const User = require('../models/User');

  const configMap = {
    projects: { config: configs.reportProjects, data: null },
    attendance: { config: configs.reportAttendance, data: null },
    staff: { config: configs.reportStaff, data: null },
    'leads-trend': { config: configs.reportLeadsTrend, data: null },
    'lead-contribution': { config: configs.reportLeadContribution, data: null },
    'channel-partner-performance': { config: configs.reportChannelPartnerPerformance, data: null },
  };

  const entry = configMap[tab];
  if (!entry) {
    res.status(400).json({ success: false, error: 'Invalid report tab' });
    return;
  }

  let cursor;
  switch (tab) {
    case 'projects':
      cursor = Project.find().lean().cursor();
      break;
    case 'attendance':
      cursor = Attendance.find().sort('-date').lean().cursor();
      break;
    case 'staff':
      cursor = User.find({ role: 'staff' }).lean().cursor();
      break;
    default:
      res.status(400).json({ success: false, error: 'Tab does not support streaming export' });
      return;
  }

  if (cursor) {
    streamCSV(req, res, cursor, entry.config.columns, entry.config.filename);
  }
});
