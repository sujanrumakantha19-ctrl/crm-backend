const asyncHandler = require('./async');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Project = require('../models/Project');

/** When searching plots, also match linked leads (Customer ID), assigned staff (Staff ID), and projects. */
module.exports = asyncHandler(async (req, res, next) => {
  const raw = req.query.search?.trim();
  if (!raw) return next();

  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. Check for complete prefixed customer ID (e.g. L-2477, LD-2477, C-2477, cust-2477)
  const leadPrefix = raw.match(/^(?:l|c|cust|customer|ld)[\s-]*(\d+)$/i);
  const digitsOnly = raw.match(/^0*(\d+)$/);

  let leads = [];
  if (leadPrefix) {
    const num = parseInt(leadPrefix[1], 10);
    // For complete prefixed customer ID, resolve by equality matching canonical and legacy aliases
    leads = await Lead.find({
      displayId: {
        $in: [`L-${num}`, `LD-${num}`, `C-${num}`, `cust-${num}`, `customer-${num}`],
      },
    }).select('_id plotId plotIds');
  } else {
    const or = [
      { displayId: { $regex: escaped, $options: 'i' } },
      { customerName: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ];
    if (digitsOnly) {
      const num = parseInt(digitsOnly[1], 10);
      or.push({ displayId: `L-${num}` });
      or.push({ displayId: `LD-${num}` });
    }
    leads = await Lead.find({ $or: or }).select('_id plotId plotIds');
  }

  if (leads.length) {
    req.plotLeadSearchIds = leads.map((l) => String(l._id));
    const plotIds = new Set();
    for (const lead of leads) {
      if (lead.plotId) plotIds.add(String(lead.plotId));
      for (const pid of lead.plotIds || []) {
        if (pid) plotIds.add(String(pid));
      }
    }
    if (plotIds.size) {
      req.plotLeadSearchPlotIds = Array.from(plotIds);
    }
  }

  // 2. Resolve Staff Users for Staff ID queries (e.g. "STAFF-12", "staff 12", "12", "EMP012", staff name)
  const staffOr = [];
  const staffPrefix = raw.match(/^(?:staff|emp)[\s-]*(\d+)$/i);
  if (staffPrefix) {
    const num = parseInt(staffPrefix[1], 10);
    staffOr.push({ displayId: `STAFF-${num}` });
    staffOr.push({ employeeId: `EMP${String(num).padStart(3, '0')}` });
    staffOr.push({ employeeId: `EMP-${num}` });
    staffOr.push({ employeeId: `EMP${num}` });
  } else if (digitsOnly) {
    const num = parseInt(digitsOnly[1], 10);
    staffOr.push({ displayId: `STAFF-${num}` });
    staffOr.push({ employeeId: `EMP${String(num).padStart(3, '0')}` });
  }
  staffOr.push({ name: { $regex: escaped, $options: 'i' } });
  staffOr.push({ displayId: { $regex: escaped, $options: 'i' } });

  const staffUsers = await User.find({ $or: staffOr }).select('_id displayId');
  if (staffUsers.length) {
    req.plotStaffUserIds = staffUsers.map((u) => String(u._id));
    req.plotStaffDisplayIds = staffUsers.map((u) => u.displayId).filter(Boolean);
  }

  // 3. Resolve Project name / displayId searches
  const projects = await Project.find({
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { displayId: { $regex: escaped, $options: 'i' } },
    ],
  }).select('_id');
  if (projects.length) {
    req.plotSearchProjectIds = projects.map((p) => p._id);
  }

  next();
});
