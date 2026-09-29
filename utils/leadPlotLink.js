const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Plot = require('../models/Plot');

const ACTIVE_PLOT_STATUSES = ['Booked', 'Pending', 'Registered'];

function asIdString(value) {
  if (value == null || value === '') return '';
  return String(value);
}

function isUsableObjectId(value) {
  return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
}

/**
 * Resolve the lead linked to a plot via plot-side leadId, then lead.plotId / plotIds.
 */
async function findLeadForPlot(plot) {
  if (!plot) return null;

  const candidateIds = [plot.bookedBy?.leadId, plot.pendingApproval?.leadId].filter(Boolean);
  for (const id of candidateIds) {
    if (!isUsableObjectId(id)) continue;
    const lead = await Lead.findById(id);
    if (lead) return lead;
  }

  if (plot._id) {
    const byPrimary = await Lead.findOne({ plotId: plot._id });
    if (byPrimary) return byPrimary;
    const byArray = await Lead.findOne({ plotIds: plot._id });
    if (byArray) return byArray;
  }

  return null;
}

/**
 * Add a plot to the lead's plotIds and set it as the primary plotId.
 * @param {object} [options]
 * @param {boolean} [options.setCustomer] - Set lead status to Customer (admin book / approve).
 */
async function linkLeadToPlot(leadId, plotId, options = {}) {
  if (!leadId || !plotId) return null;

  const $set = { plotId };
  if (options.setCustomer) {
    $set.status = 'Customer';
  }

  return Lead.findByIdAndUpdate(
    leadId,
    { $addToSet: { plotIds: plotId }, $set },
    { returnDocument: 'after' }
  );
}

/**
 * Remove a plot from the lead. If it was the primary plotId, repoint to another
 * active plot (Booked/Pending/Registered) or null.
 */
async function unlinkLeadFromPlot(leadId, plotId) {
  if (!leadId || !plotId) return null;

  await Lead.findByIdAndUpdate(leadId, { $pull: { plotIds: plotId } });
  const lead = await Lead.findById(leadId);
  if (!lead) return null;

  const primaryMatches = lead.plotId && asIdString(lead.plotId) === asIdString(plotId);
  if (primaryMatches || !lead.plotId) {
    const active = await getActivePlotIdsForLead(leadId);
    const next = active.find((id) => asIdString(id) !== asIdString(plotId))
      || (lead.plotIds && lead.plotIds[0])
      || null;
    lead.plotId = next || null;
    await lead.save();
  }

  return lead;
}

/**
 * Plot IDs currently held by this lead (Booked, Pending, or Registered),
 * matched via bookedBy.leadId / pendingApproval.leadId.
 */
async function getActivePlotIdsForLead(leadId) {
  if (!leadId) return [];
  const idStr = asIdString(leadId);
  const plots = await Plot.find({
    status: { $in: ACTIVE_PLOT_STATUSES },
    $or: [
      { 'bookedBy.leadId': idStr },
      { 'pendingApproval.leadId': idStr },
    ],
  }).select('_id');
  return plots.map((p) => p._id);
}

module.exports = {
  findLeadForPlot,
  linkLeadToPlot,
  unlinkLeadFromPlot,
  getActivePlotIdsForLead,
  ACTIVE_PLOT_STATUSES,
};
