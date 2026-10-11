const asyncHandler = require('./async');
const Lead = require('../models/Lead');
const User = require('../models/User');

/** When searching plots, also match linked leads (Customer ID) and assigned staff (Staff ID). */
module.exports = asyncHandler(async (req, res, next) => {
  const raw = req.query.search?.trim();
  if (!raw) return next();

  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const or = [
    { displayId: { $regex: escaped, $options: 'i' } },
    { customerName: { $regex: escaped, $options: 'i' } },
    { phone: { $regex: escaped, $options: 'i' } },
  ];

  const leadPrefix = raw.match(/^(?:l|c|cust|customer)[\s-]*(\d+)$/i);
  if (leadPrefix) {
    or.push({ displayId: `L-${parseInt(leadPrefix[1], 10)}` });
  }
  const digitsOnly = raw.match(/^0*(\d+)$/);
  if (digitsOnly) {
    or.push({ displayId: `L-${parseInt(digitsOnly[1], 10)}` });
  }

  const leads = await Lead.find({ $or: or }).select('_id plotId plotIds');
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

  // Also resolve Staff Users for Staff ID queries (e.g. "STAFF-12", "staff 12", "12", "EMP012", staff name)
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

  next();
});
