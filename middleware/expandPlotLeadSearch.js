const asyncHandler = require('./async');
const Lead = require('../models/Lead');

/** When searching plots, also match linked leads by displayId (e.g. L-123). */
module.exports = asyncHandler(async (req, res, next) => {
  const raw = req.query.search?.trim();
  if (!raw) return next();

  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const or = [{ displayId: { $regex: escaped, $options: 'i' } }];

  const leadPrefix = raw.match(/^l[\s-]*(\d+)$/i);
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
  next();
});
