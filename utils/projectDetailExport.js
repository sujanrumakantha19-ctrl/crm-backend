const mongoose = require('mongoose');
const Project = require('../models/Project');
const Plot = require('../models/Plot');
const Lead = require('../models/Lead');
const User = require('../models/User');

function buildProjectExportFilter(query = {}) {
  const filter = {};

  if (query['status[in]']) {
    const values = String(query['status[in]'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length > 0) {
      filter.status = { $in: values };
    }
  } else if (query.status && query.status !== 'All' && query.status !== 'all') {
    filter.status = query.status;
  }

  if (query.location && query.location !== 'All' && query.location !== 'all') {
    filter.location = query.location;
  }

  if (query.category && query.category !== 'All' && query.category !== 'all') {
    filter.category = query.category;
  }

  if (query.search && String(query.search).trim()) {
    const rawSearch = String(query.search).trim();
    const escapedSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escapedSearch, $options: 'i' } },
      { displayId: { $regex: escapedSearch, $options: 'i' } },
      { location: { $regex: escapedSearch, $options: 'i' } },
    ];
    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      filter.$or.push({ _id: rawSearch });
    }
  }

  return filter;
}

function resolveLeadForPlot(plot, leadById, leadByPhone) {
  const leadIdCandidate = plot.bookedBy?.leadId || plot.pendingApproval?.leadId;
  let lead = leadIdCandidate ? leadById.get(String(leadIdCandidate)) : undefined;
  if (!lead && plot.bookedBy?.phone) {
    lead = leadByPhone.get(String(plot.bookedBy.phone));
  }
  return lead || null;
}

function resolveLatestFollowUp(lead) {
  if (!lead || !Array.isArray(lead.followUps) || lead.followUps.length === 0) {
    return null;
  }

  const sorted = [...lead.followUps].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
  const last = sorted[0];
  return {
    date: last.date || '',
    outcome: last.outcome || '',
    notes: last.notes || '',
  };
}

function collectStaffIdsFromPlots(plots) {
  const allStaffIds = new Set();
  for (const plot of plots) {
    if (plot.bookedBy?.staffId) allStaffIds.add(String(plot.bookedBy.staffId));
    if (plot.pendingApproval?.requestedBy) allStaffIds.add(String(plot.pendingApproval.requestedBy));
  }
  return allStaffIds;
}

async function loadStaffById(staffIds) {
  const staffById = new Map();
  if (staffIds.size === 0) return staffById;

  const objectIds = [...staffIds]
    .filter((sid) => mongoose.Types.ObjectId.isValid(sid))
    .map((sid) => new mongoose.Types.ObjectId(sid));

  if (objectIds.length === 0) return staffById;

  const staffUsers = await User.find({ _id: { $in: objectIds } }).lean();
  for (const user of staffUsers) {
    staffById.set(String(user._id), user);
  }
  return staffById;
}

function buildPlotExportDoc(project, plot, leadById, leadByPhone, staffById) {
  const lead = plot ? resolveLeadForPlot(plot, leadById, leadByPhone) : null;
  const latestFollowUp = resolveLatestFollowUp(lead);
  const staffId = plot?.bookedBy?.staffId || plot?.pendingApproval?.requestedBy;
  const staff = staffId ? staffById.get(String(staffId)) : null;

  return {
    project,
    plot: plot || null,
    lead,
    latestFollowUp,
    staff: staff || null,
  };
}

async function buildProjectDetailExportDocs({ projectIds } = {}) {
  const projectFilter = Array.isArray(projectIds) && projectIds.length > 0
    ? { _id: { $in: projectIds } }
    : {};

  const projects = await Project.find(projectFilter).sort({ name: 1 }).lean();
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p._id);
  const projectById = new Map(projects.map((p) => [String(p._id), p]));

  const plots = await Plot.find({ projectId: { $in: ids } })
    .sort({ projectId: 1, plotNumber: 1 })
    .lean();

  const plotIds = plots.map((p) => p._id);
  const leads = await Lead.find({
    $or: [{ projectId: { $in: ids } }, { plotId: { $in: plotIds } }],
  }).lean();

  const leadById = new Map();
  const leadByPhone = new Map();
  for (const lead of leads) {
    leadById.set(String(lead._id), lead);
    if (lead.phone) leadByPhone.set(String(lead.phone), lead);
  }

  const staffById = await loadStaffById(collectStaffIdsFromPlots(plots));

  const docs = [];
  const plotsByProject = new Map();
  for (const plot of plots) {
    const key = String(plot.projectId);
    if (!plotsByProject.has(key)) plotsByProject.set(key, []);
    plotsByProject.get(key).push(plot);
  }

  for (const project of projects) {
    const projectPlots = plotsByProject.get(String(project._id)) || [];
    if (projectPlots.length === 0) {
      docs.push(buildPlotExportDoc(project, null, leadById, leadByPhone, staffById));
      continue;
    }
    for (const plot of projectPlots) {
      docs.push(buildPlotExportDoc(project, plot, leadById, leadByPhone, staffById));
    }
  }

  return docs;
}

async function buildProjectDetailExportDocsForProject(projectId) {
  return buildProjectDetailExportDocs({ projectIds: [projectId] });
}

async function buildProjectDetailExportDocsFromQuery(query = {}) {
  const filter = buildProjectExportFilter(query);
  const projects = await Project.find(filter).select('_id').lean();
  const projectIds = projects.map((p) => p._id);
  return buildProjectDetailExportDocs({ projectIds });
}

module.exports = {
  buildProjectExportFilter,
  buildProjectDetailExportDocs,
  buildProjectDetailExportDocsForProject,
  buildProjectDetailExportDocsFromQuery,
};
