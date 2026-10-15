const mongoose = require('mongoose');
const Plot = require('../models/Plot');
const Lead = require('../models/Lead');

const BOOKING_STATUSES = ['Booked', 'Registered', 'Pending'];

function last10(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

function isMongoId(id) {
  try {
    return (
      !!id &&
      mongoose.Types.ObjectId.isValid(id) &&
      new mongoose.Types.ObjectId(id).toString() === String(id).toLowerCase()
    );
  } catch {
    return false;
  }
}

function phoneRegex(p10) {
  return new RegExp(`${p10}$`);
}

/** Prefer phone so two plots for the same customer (even different lead records) count as one. */
function customerKeyFromPlot(plot) {
  const p10 = last10(plot.bookedBy?.phone || plot.leadInfo?.phone);
  if (p10.length === 10) return `p:${p10}`;
  const lid = plot.bookedBy?.leadId || plot.leadId || plot.leadInfo?._id;
  if (lid) return `l:${String(lid)}`;
  const name = (plot.bookedBy?.name || '').toLowerCase().trim();
  return name ? `n:${name}` : '';
}

function slimRelated(plot) {
  const proj = plot.projectId && typeof plot.projectId === 'object' ? plot.projectId : null;
  return {
    id: String(plot._id),
    plotNumber: plot.plotNumber,
    status: plot.status,
    projectId: proj ? String(proj._id || proj.id || '') : String(plot.projectId || ''),
    projectName: proj ? proj.name : '',
    projectDisplayId: proj ? proj.displayId : '',
  };
}

function serializePlot(plot) {
  const obj = plot.toObject ? plot.toObject({ virtuals: true }) : { ...plot };
  obj.id = String(obj._id || obj.id);
  return obj;
}

async function attachRelatedBookings(plots, options = {}) {
  if (!plots || plots.length === 0) return plots;

  const leadIds = new Set();
  const phones = new Set();

  const names = new Set();
  const displayIds = new Set();

  plots.forEach((p) => {
    const lid = p.bookedBy?.leadId || p.leadInfo?._id || p.leadId;
    if (lid) leadIds.add(String(lid));
    const p10 = last10(p.bookedBy?.phone || p.leadInfo?.phone);
    if (p10.length === 10) phones.add(p10);
    const name = String(p.bookedBy?.name || p.leadInfo?.customerName || '').toLowerCase().trim();
    if (name) names.add(name);
    const dId = String(p.leadInfo?.displayId || '').trim().toUpperCase();
    if (dId) displayIds.add(dId);
  });

  const or = [];
  if (leadIds.size > 0) {
    or.push({ 'bookedBy.leadId': { $in: Array.from(leadIds) } });
  }
  phones.forEach((p10) => {
    or.push({ 'bookedBy.phone': phoneRegex(p10) });
  });
  names.forEach((name) => {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    or.push({ 'bookedBy.name': { $regex: new RegExp(`^${escaped}$`, 'i') } });
  });
  displayIds.forEach((dId) => {
    or.push({ 'leadInfo.displayId': dId });
  });

  if (or.length === 0) {
    return plots.map((p) => ({
      ...p,
      relatedBookingCount: 1,
      relatedBookings: [slimRelated({ ...p, _id: p._id || p.id })],
    }));
  }

  const queryConditions = [
    { status: { $in: BOOKING_STATUSES } },
    { $or: or },
  ];
  if (options.staffAccessOr && options.staffAccessOr.length > 0) {
    queryConditions.push({ $or: options.staffAccessOr });
  }

  const siblings = await Plot.find({ $and: queryConditions })
    .select('_id plotNumber status projectId bookedBy.leadId bookedBy.phone bookedBy.name')
    .populate({ path: 'projectId', select: 'name displayId' })
    .limit(2000)
    .lean();

  const groups = new Map();
  siblings.forEach((s) => {
    const key = customerKeyFromPlot(s);
    if (!key.startsWith('l:') && !key.startsWith('p:') && !key.startsWith('n:')) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });

  return plots.map((p) => {
    const key = customerKeyFromPlot(p);
    let group = groups.get(key) || [];
    const selfId = String(p._id || p.id || '');
    if (!group.some((g) => String(g._id) === selfId) && selfId) {
      group = [{ _id: selfId, plotNumber: p.plotNumber, status: p.status, projectId: p.projectId, bookedBy: p.bookedBy }, ...group];
    }
    const seen = new Set();
    const unique = [];
    group.forEach((g) => {
      const gid = String(g._id);
      if (seen.has(gid)) return;
      seen.add(gid);
      unique.push(g);
    });
    unique.sort((a, b) => String(a.plotNumber).localeCompare(String(b.plotNumber), undefined, { numeric: true }));
    const slotTotal = unique.reduce((sum, g) => {
      const parts = String(g.plotNumber ?? '')
        .split(/[,/&]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return sum + Math.max(1, parts.length);
    }, 0);
    return {
      ...p,
      relatedBookingCount: unique.length,
      relatedBookings: unique.map(slimRelated),
    };
  });
}

async function findCustomerBookingPlots({ leadId, leadIds, phone, plotId, status }) {
  const rawIds = []
    .concat(leadId || [])
    .concat(leadIds || [])
    .flatMap((v) => String(v).split(','))
    .map((s) => s.trim())
    .filter(Boolean);

  const objectIds = rawIds.filter(isMongoId);
  const displayIds = rawIds.filter((id) => !isMongoId(id));

  const phones = new Set();
  const p10param = last10(phone);
  if (p10param.length === 10) phones.add(p10param);

  let seedPlot = null;
  if (plotId && isMongoId(plotId)) {
    seedPlot = await Plot.findById(plotId).select('bookedBy leadId plotNumber status projectId');
    if (seedPlot) {
      const sp = last10(seedPlot.bookedBy?.phone);
      if (sp.length === 10) phones.add(sp);
      if (seedPlot.bookedBy?.leadId) objectIds.push(String(seedPlot.bookedBy.leadId));
    }
  }

  let leads = [];
  if (objectIds.length) {
    leads = await Lead.find({ _id: { $in: objectIds } }).select('_id phone plotId plotIds displayId customerName');
  }
  if (displayIds.length) {
    const byDisplay = await Lead.find({ displayId: { $in: displayIds } }).select(
      '_id phone plotId plotIds displayId customerName'
    );
    leads = leads.concat(byDisplay);
  }

  leads.forEach((l) => {
    const lp = last10(l.phone);
    if (lp.length === 10) phones.add(lp);
  });

  if (phones.size > 0) {
    const phoneOr = Array.from(phones).map((p10) => ({ phone: phoneRegex(p10) }));
    const byPhone = await Lead.find({ $or: phoneOr }).select('_id phone plotId plotIds displayId customerName');
    const seenLead = new Set(leads.map((l) => String(l._id)));
    byPhone.forEach((l) => {
      if (!seenLead.has(String(l._id))) leads.push(l);
      const lp = last10(l.phone);
      if (lp.length === 10) phones.add(lp);
    });
  }

  const names = new Set();
  const displayIdsFound = new Set();
  
  if (seedPlot?.bookedBy?.name) names.add(String(seedPlot.bookedBy.name).toLowerCase().trim());
  leads.forEach((l) => {
    if (l.customerName) names.add(String(l.customerName).toLowerCase().trim());
    if (l.displayId) displayIdsFound.add(String(l.displayId).trim().toUpperCase());
  });
  
  const additionalLeadOr = [];
  // ONLY search additional leads by name if we have NO phone and NO lead ID
  if (phones.size === 0 && objectIds.length === 0 && displayIds.length === 0) {
    names.forEach((name) => {
      if (name) additionalLeadOr.push({ customerName: { $regex: new RegExp(`^${name}$`, 'i') } });
    });
  }
  displayIdsFound.forEach((dId) => {
    if (dId) additionalLeadOr.push({ displayId: dId });
  });
  
  if (additionalLeadOr.length > 0) {
    const additionalLeads = await Lead.find({ $or: additionalLeadOr }).select('_id phone plotId plotIds displayId customerName');
    const seenLead = new Set(leads.map((l) => String(l._id)));
    additionalLeads.forEach((l) => {
      if (!seenLead.has(String(l._id))) leads.push(l);
      const lp = last10(l.phone);
      if (lp.length === 10) phones.add(lp);
    });
  }

  const or = [];
  const allLeadIdStrs = [
    ...objectIds.map(String),
    ...leads.map((l) => String(l._id)),
    seedPlot?.bookedBy?.leadId ? String(seedPlot.bookedBy.leadId) : '',
  ].filter(Boolean);
  const uniqueLeadIds = Array.from(new Set(allLeadIdStrs));

  if (uniqueLeadIds.length) {
    or.push({ 'bookedBy.leadId': { $in: uniqueLeadIds } });
  }

  const linkedPlotIds = leads.flatMap((l) => [l.plotId, ...(l.plotIds || [])]).filter(Boolean);
  if (seedPlot) linkedPlotIds.push(seedPlot._id);
  if (linkedPlotIds.length) or.push({ _id: { $in: linkedPlotIds } });

  phones.forEach((p10) => {
    or.push({ 'bookedBy.phone': phoneRegex(p10) });
  });
  
  // ONLY search plots by name if we have NO phone, NO lead ID, and NO linked plot IDs
  if (phones.size === 0 && uniqueLeadIds.length === 0 && linkedPlotIds.length === 0) {
    names.forEach((name) => {
      if (name) or.push({ 'bookedBy.name': { $regex: new RegExp(`^${name}$`, 'i') } });
    });
  }

  if (or.length === 0) return [];

  const statuses = status ? [status] : BOOKING_STATUSES;
  const plots = await Plot.find({
    $or: or,
    status: { $in: statuses },
  })
    .populate({ path: 'projectId', select: 'name displayId location status' })
    .sort({ plotNumber: 1 })
    .limit(500);

  const seen = new Set();
  const unique = [];
  plots.forEach((p) => {
    const pid = String(p._id);
    if (seen.has(pid)) return;
    seen.add(pid);
    unique.push(serializePlot(p));
  });

  unique.sort((a, b) => {
    const an = (a.projectId && a.projectId.name) || '';
    const bn = (b.projectId && b.projectId.name) || '';
    if (an !== bn) return an.localeCompare(bn);
    return String(a.plotNumber).localeCompare(String(b.plotNumber), undefined, { numeric: true });
  });

  return unique;
}

function customerIdentityKeysBackend(plot) {
  const keys = [];
  const p10 = last10(plot.bookedBy?.phone || plot.leadInfo?.phone);
  if (p10) keys.push(`p:${p10}`);
  
  const displayId = String(plot.leadInfo?.displayId || '').trim().toUpperCase();
  if (displayId) keys.push(`d:${displayId}`);
  
  const leadId = String(plot.bookedBy?.leadId || plot.leadInfo?._id || plot.leadId || '');
  if (leadId && isMongoId(leadId)) keys.push(`l:${leadId}`);
  
  if (!p10 && !displayId && !leadId) {
    const name = String(plot.bookedBy?.name || plot.leadInfo?.customerName || '').toLowerCase().trim();
    if (name) keys.push(`n:${name}`);
  }
  
  if (keys.length === 0) {
    keys.push(`id:${plot._id || plot.id || ''}`);
  }
  return keys;
}

function mergeCustomerPlotRows(a, b) {
  const seen = new Set();
  const related = [];
  const push = (r) => {
    if (!r) return;
    const id = String(r.id || r._id || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    related.push(r);
  };
  (a.relatedBookings || []).forEach(push);
  (b.relatedBookings || []).forEach(push);
  push(slimRelated(a));
  push(slimRelated(b));
  
  let keep = (a.relatedBookingCount || 0) >= (b.relatedBookingCount || 0) ? a : b;
  if (a.status === 'Booked' && b.status !== 'Booked') keep = a;
  else if (b.status === 'Booked' && a.status !== 'Booked') keep = b;

  return {
    ...keep,
    relatedBookings: related,
    relatedBookingCount: related.length,
  };
}

function collapsePlotsByCustomer(plots) {
  if (!plots || plots.length <= 1) return plots || [];
  
  const n = plots.length;
  const parent = plots.map((_, i) => i);
  const find = (i) => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  
  const keyOwner = new Map();
  plots.forEach((plot, i) => {
    const keys = customerIdentityKeysBackend(plot);
    keys.forEach((k) => {
      const owner = keyOwner.get(k);
      if (owner === undefined) {
        keyOwner.set(k, i);
      } else {
        const rootA = find(owner);
        const rootB = find(i);
        if (rootA !== rootB) parent[rootB] = rootA;
      }
    });
  });
  
  const groups = new Map();
  plots.forEach((plot, i) => {
    const root = find(i);
    const existing = groups.get(root);
    groups.set(root, existing ? mergeCustomerPlotRows(existing, plot) : plot);
  });
  
  return Array.from(groups.values());
}

module.exports = {
  attachRelatedBookings,
  findCustomerBookingPlots,
  collapsePlotsByCustomer,
  last10,
};
