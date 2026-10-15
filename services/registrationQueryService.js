const mongoose = require('mongoose');
const Plot = require('../models/Plot');
const Lead = require('../models/Lead');
const Project = require('../models/Project');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const { isValidCalendarDateString } = require('../utils/dateIST');
const { attachRelatedBookings } = require('../utils/plotCustomerBookings');

const LEAD_SELECT =
  '_id displayId customerName phone status city sourceType source assignedTo assignedToName assignedToDisplayId plotId plotIds paymentStatus loanStage createdAt';

const VALID_SORT_OPTIONS = [
  'newest',
  'oldest',
  'urgency',
  'expected_date',
  'customer_name',
  'bookedBy.name',
  'createdAt',
];

const VALID_PAYMENT_METHODS = ['ALL', 'CASH', 'LOAN'];

const VALID_PAYMENT_STATUSES = [
  'ALL',
  'ADVANCE PAID',
  'ADVANCE NOT PAID',
  'FULLY PAID',
  'PARTIALLY PAID',
  'NOT PAID',
  'PENDING PAYMENT',
  'PENDING',
  'NOT_FULLY_PAID',
];

const VALID_LOAN_STAGES = [
  'ALL',
  'NOT APPLIED',
  'DOCUMENTATION PENDING',
  'APPLIED',
  'IN PROGRESS',
  'SANCTIONED',
  'DISBURSED',
  'REJECTED',
];

function isMongoHexId(val) {
  return (
    typeof val === 'string' &&
    mongoose.Types.ObjectId.isValid(val) &&
    new mongoose.Types.ObjectId(val).toString() === val.toLowerCase()
  );
}

function normPhone10(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

function getEffectivePaymentStatus(plot, lead) {
  const pStatus = plot.bookedBy?.paymentStatus?.trim();
  if (pStatus && pStatus !== '-' && pStatus !== '—' && pStatus.toLowerCase() !== 'not paid') return pStatus;
  const lStatus = lead?.paymentStatus?.trim();
  if (lStatus && lStatus !== '-' && lStatus !== '—') return lStatus;
  return pStatus || 'Not Paid';
}

function getEffectiveLoanStage(plot, lead) {
  const pStage = plot.bookedBy?.loanStage?.trim();
  if (pStage && pStage !== '-' && pStage !== '—' && pStage.toLowerCase() !== 'not applied') return pStage;
  const lStage = lead?.loanStage?.trim();
  if (lStage && lStage !== '-' && lStage !== '—') return lStage;
  return pStage || 'Not Applied';
}

function customerIdentityKeys(plot) {
  const keys = [];
  const p10 = normPhone10(plot.bookedBy?.phone || plot.leadInfo?.phone);
  if (p10) keys.push(`p:${p10}`);

  const displayId = String(plot.leadInfo?.displayId || '').trim().toUpperCase();
  if (displayId) keys.push(`d:${displayId}`);

  const leadId = String(plot.bookedBy?.leadId || plot.leadInfo?._id || plot.leadId || '');
  if (leadId && isMongoHexId(leadId)) keys.push(`l:${leadId}`);

  if (!p10 && !displayId && !leadId) {
    const name = String(plot.bookedBy?.name || plot.leadInfo?.customerName || '').toLowerCase().trim();
    if (name) keys.push(`n:${name}`);
  }

  if (keys.length === 0) {
    keys.push(`id:${plot._id || plot.id || ''}`);
  }
  return keys;
}

/**
 * Main customer-grouped registration query service.
 * Filters first -> resolves identity -> groups customers -> sorts globally -> paginates -> enriches related bookings.
 */
async function queryCustomerGroupedBookings({ user, query = {}, isStaffOnly = false }) {
  const isStaffRole = isStaffOnly || (user && user.role === 'staff');
  const staffUserIdStr = user && (user._id || user.id) ? String(user._id || user.id) : '';

  // ─── 1. Input Validation ──────────────────────────────────────────
  if (query.projectId !== undefined && query.projectId !== null && query.projectId !== '') {
    if (typeof query.projectId !== 'string' || !mongoose.Types.ObjectId.isValid(query.projectId)) {
      throw new ErrorResponse(`Invalid project ID format: ${query.projectId}`, 400);
    }
  }

  if (query.bookedByUserId !== undefined && query.bookedByUserId !== null && query.bookedByUserId !== '') {
    if (typeof query.bookedByUserId !== 'string' || !mongoose.Types.ObjectId.isValid(query.bookedByUserId)) {
      throw new ErrorResponse(`Invalid staff user ID format: ${query.bookedByUserId}`, 400);
    }
  }

  // Payment method validation
  const rawPaymentMethod = query['bookedBy.paymentMethod'] || query.paymentMethod;
  let paymentMethod = '';
  if (rawPaymentMethod !== undefined && rawPaymentMethod !== null && rawPaymentMethod !== '') {
    if (typeof rawPaymentMethod !== 'string') {
      throw new ErrorResponse('Invalid payment method filter', 400);
    }
    const trimmedMethod = rawPaymentMethod.trim().toUpperCase();
    if (!VALID_PAYMENT_METHODS.includes(trimmedMethod)) {
      throw new ErrorResponse(`Invalid payment method: ${rawPaymentMethod}`, 400);
    }
    if (trimmedMethod !== 'ALL') {
      paymentMethod = trimmedMethod;
    }
  }

  // Payment status filter validation
  const rawPaymentStatus = query.paymentStatusFilter;
  let paymentStatusFilter = '';
  if (rawPaymentStatus !== undefined && rawPaymentStatus !== null && rawPaymentStatus !== '') {
    if (typeof rawPaymentStatus !== 'string') {
      throw new ErrorResponse('Invalid payment status filter', 400);
    }
    const trimmedPS = rawPaymentStatus.trim().toUpperCase();
    if (!VALID_PAYMENT_STATUSES.includes(trimmedPS)) {
      throw new ErrorResponse(`Invalid payment status filter: ${rawPaymentStatus}`, 400);
    }
    if (trimmedPS !== 'ALL') {
      paymentStatusFilter = rawPaymentStatus.trim();
    }
  }

  // Loan stage filter validation
  const rawLoanStage = query.loanStageFilter;
  let loanStageFilter = '';
  if (rawLoanStage !== undefined && rawLoanStage !== null && rawLoanStage !== '') {
    if (typeof rawLoanStage !== 'string') {
      throw new ErrorResponse('Invalid loan stage filter', 400);
    }
    const trimmedLS = rawLoanStage.trim().toUpperCase();
    if (!VALID_LOAN_STAGES.includes(trimmedLS)) {
      throw new ErrorResponse(`Invalid loan stage filter: ${rawLoanStage}`, 400);
    }
    if (trimmedLS !== 'ALL') {
      loanStageFilter = rawLoanStage.trim();
    }
  }

  // Sort validation
  const rawSortBy = query.sortBy || query.sort;
  let sortBy = 'newest';
  if (rawSortBy !== undefined && rawSortBy !== null && rawSortBy !== '') {
    if (typeof rawSortBy !== 'string' || !VALID_SORT_OPTIONS.includes(rawSortBy.trim())) {
      throw new ErrorResponse(`Invalid sort option: ${rawSortBy}`, 400);
    }
    sortBy = rawSortBy.trim();
  }

  // Pagination validation
  const maxLimit = isStaffRole ? 200 : 100;
  if (query.page !== undefined && query.page !== null && query.page !== '') {
    const pageNum = Number(query.page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      throw new ErrorResponse('Page must be a positive integer', 400);
    }
  }
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    const limitNum = Number(query.limit);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > maxLimit) {
      throw new ErrorResponse(`Limit must be an integer between 1 and ${maxLimit}`, 400);
    }
  }

  const tabStatus = query.status === 'Registered' ? 'Registered' : 'Booked';
  const dateField = tabStatus === 'Registered' ? 'registrationDate' : 'expectedRegistrationDate';

  const dateFrom = query[`${dateField}[gte]`] || query.dateFrom || query.fromDate;
  const dateTo = query[`${dateField}[lte]`] || query.dateTo || query.toDate;

  if (dateFrom !== undefined && dateFrom !== null && dateFrom !== '') {
    if (typeof dateFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom.trim())) {
      throw new ErrorResponse(`Invalid start date: ${dateFrom}`, 400);
    }
    if (!isValidCalendarDateString(dateFrom.trim())) {
      throw new ErrorResponse(`Invalid calendar date for start date: ${dateFrom}`, 400);
    }
  }
  if (dateTo !== undefined && dateTo !== null && dateTo !== '') {
    if (typeof dateTo !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo.trim())) {
      throw new ErrorResponse(`Invalid end date: ${dateTo}`, 400);
    }
    if (!isValidCalendarDateString(dateTo.trim())) {
      throw new ErrorResponse(`Invalid calendar date for end date: ${dateTo}`, 400);
    }
  }
  if (dateFrom && dateTo) {
    const df = String(dateFrom).trim();
    const dt = String(dateTo).trim();
    if (df > dt) {
      throw new ErrorResponse(`Invalid date range: dateFrom (${df}) cannot be after dateTo (${dt})`, 400);
    }
  }

  // ─── 2. Build Base Filter for Candidate Bookings ───────────────────
  const baseFilter = {
    status: tabStatus,
  };

  if (query.projectId) {
    baseFilter.projectId = query.projectId;
  }

  if (paymentMethod) {
    baseFilter['bookedBy.paymentMethod'] = paymentMethod;
  }

  const bank = (query['bookedBy.bank'] || query.bank || '').trim();
  if (bank && bank !== 'All') {
    baseFilter['bookedBy.bank'] = bank;
  }

  if (dateFrom || dateTo) {
    baseFilter[dateField] = {};
    if (dateFrom) baseFilter[dateField].$gte = String(dateFrom).trim();
    if (dateTo) {
      baseFilter[dateField].$lte = `${String(dateTo).trim()}\uffff`;
    }
  }

  // ─── 3. Staff Database-Level Access Predicate ──────────────────────
  let staffAccessOr = null;
  if (isStaffRole && staffUserIdStr) {
    const staffLeads = await Lead.find({ assignedTo: staffUserIdStr }).select('_id plotId plotIds').lean();
    const staffLeadIds = staffLeads.map((l) => String(l._id));
    const staffPlotIds = [];
    staffLeads.forEach((l) => {
      if (l.plotId) staffPlotIds.push(String(l.plotId));
      (l.plotIds || []).forEach((pid) => pid && staffPlotIds.push(String(pid)));
    });

    staffAccessOr = [
      { assignedTo: new mongoose.Types.ObjectId(staffUserIdStr) },
      { 'bookedBy.staffId': staffUserIdStr },
      { 'pendingApproval.requestedBy': staffUserIdStr },
    ];
    if (user.displayId) {
      staffAccessOr.push({ 'bookedBy.staffDisplayId': user.displayId });
    }
    if (staffLeadIds.length > 0) {
      staffAccessOr.push({ 'bookedBy.leadId': { $in: staffLeadIds } });
      staffAccessOr.push({ 'pendingApproval.leadId': { $in: staffLeadIds } });
    }
    if (staffPlotIds.length > 0) {
      staffAccessOr.push({ _id: { $in: staffPlotIds } });
    }
  }

  // ─── 4. Text Search Processing ────────────────────────────────────
  const rawSearch = (query.search || '').trim();
  let searchOr = [];
  if (rawSearch) {
    const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Customer ID prefix check (L-2477, LD-2477, C-2477, cust-2477, customer-2477)
    const leadPrefix = rawSearch.match(/^(?:l|c|cust|customer|ld)[\s-]*(\d+)$/i);
    const digitsOnly = rawSearch.match(/^0*(\d+)$/);

    if (leadPrefix) {
      const num = parseInt(leadPrefix[1], 10);
      const targetDisplayIds = [`L-${num}`, `LD-${num}`, `C-${num}`, `cust-${num}`, `customer-${num}`];
      const matchedLeads = await Lead.find({ displayId: { $in: targetDisplayIds } }).select('_id plotId plotIds');
      const leadIds = matchedLeads.map((l) => String(l._id));
      const pIds = new Set();
      matchedLeads.forEach((l) => {
        if (l.plotId) pIds.add(String(l.plotId));
        (l.plotIds || []).forEach((pid) => pid && pIds.add(String(pid)));
      });

      if (leadIds.length) {
        searchOr.push({ 'bookedBy.leadId': { $in: leadIds } });
        searchOr.push({ 'pendingApproval.leadId': { $in: leadIds } });
      }
      if (pIds.size) {
        searchOr.push({ _id: { $in: Array.from(pIds) } });
      }
      searchOr.push({ displayId: { $in: targetDisplayIds } });
    } else {
      searchOr.push({ 'bookedBy.name': { $regex: escaped, $options: 'i' } });
      searchOr.push({ 'bookedBy.phone': { $regex: escaped, $options: 'i' } });
      searchOr.push({ plotNumber: { $regex: escaped, $options: 'i' } });

      const leadOr = [
        { customerName: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
        { displayId: { $regex: escaped, $options: 'i' } },
      ];
      if (digitsOnly) {
        const num = parseInt(digitsOnly[1], 10);
        leadOr.push({ displayId: `L-${num}` });
        leadOr.push({ displayId: `LD-${num}` });
        searchOr.push({ 'bookedBy.staffDisplayId': `STAFF-${num}` });
      }

      const matchedLeads = await Lead.find({ $or: leadOr }).select('_id plotId plotIds');
      if (matchedLeads.length) {
        const leadIds = matchedLeads.map((l) => String(l._id));
        const pIds = new Set();
        matchedLeads.forEach((l) => {
          if (l.plotId) pIds.add(String(l.plotId));
          (l.plotIds || []).forEach((pid) => pid && pIds.add(String(pid)));
        });
        searchOr.push({ 'bookedBy.leadId': { $in: leadIds } });
        searchOr.push({ 'pendingApproval.leadId': { $in: leadIds } });
        if (pIds.size) {
          searchOr.push({ _id: { $in: Array.from(pIds) } });
        }
      }

      // Project Name / displayId search
      const matchedProjects = await Project.find({
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { displayId: { $regex: escaped, $options: 'i' } },
        ],
      }).select('_id');
      if (matchedProjects.length) {
        searchOr.push({ projectId: { $in: matchedProjects.map((p) => p._id) } });
      }

      // Staff User search (including lead-only assignments and normalized staff ID)
      const staffOr = [
        { name: { $regex: escaped, $options: 'i' } },
        { displayId: { $regex: escaped, $options: 'i' } },
      ];
      const staffIdMatch = rawSearch.match(/^staff[\s-]*(\d+)$/i);
      if (staffIdMatch) {
        staffOr.push({ displayId: `STAFF-${staffIdMatch[1]}` });
      }

      const matchedStaff = await User.find({ $or: staffOr }).select('_id displayId');
      if (matchedStaff.length) {
        const staffIds = matchedStaff.map((s) => s._id);
        const staffDisplays = matchedStaff.map((s) => s.displayId).filter(Boolean);
        searchOr.push({ assignedTo: { $in: staffIds } });
        searchOr.push({ 'bookedBy.staffId': { $in: staffIds.map(String) } });
        if (staffDisplays.length) {
          searchOr.push({ 'bookedBy.staffDisplayId': { $in: staffDisplays } });
        }

        const staffAssignedLeads = await Lead.find({ assignedTo: { $in: staffIds } }).select('_id plotId plotIds');
        if (staffAssignedLeads.length) {
          const sLeadIds = staffAssignedLeads.map((l) => String(l._id));
          const sPlotIds = [];
          staffAssignedLeads.forEach((l) => {
            if (l.plotId) sPlotIds.push(String(l.plotId));
            (l.plotIds || []).forEach((pid) => pid && sPlotIds.push(String(pid)));
          });
          searchOr.push({ 'bookedBy.leadId': { $in: sLeadIds } });
          searchOr.push({ 'pendingApproval.leadId': { $in: sLeadIds } });
          if (sPlotIds.length) {
            searchOr.push({ _id: { $in: sPlotIds } });
          }
        }
      }
    }
  }

  // Combine search and staff access predicates safely
  const andClauses = [];
  if (searchOr.length > 0) {
    andClauses.push({ $or: searchOr });
  }
  if (staffAccessOr && staffAccessOr.length > 0) {
    andClauses.push({ $or: staffAccessOr });
  }
  if (andClauses.length === 1) {
    baseFilter.$or = andClauses[0].$or;
  } else if (andClauses.length > 1) {
    baseFilter.$and = andClauses;
  }

  // ─── 5. Fetch Candidate Plots ─────────────────────────────────────
  const candidatePlots = await Plot.find(baseFilter)
    .populate({ path: 'projectId', select: 'name location status surveyNumber displayId' })
    .lean();

  const reqPage = Math.max(1, parseInt(query.page, 10) || 1);
  const reqLimit = Math.max(1, parseInt(query.limit, 10) || 10);

  if (!candidatePlots || candidatePlots.length === 0) {
    return {
      success: true,
      count: 0,
      total: 0,
      totalPlots: 0,
      pagination: { page: reqPage, limit: reqLimit, total: 0, totalPlots: 0, pages: 1 },
      data: [],
    };
  }

  // ─── 6. Enrich Candidate Plots with Leads & Staff ─────────────────
  const leadIds = candidatePlots
    .map((p) => p.bookedBy?.leadId || p.pendingApproval?.leadId || p.leadId)
    .filter(Boolean);
  const plotIds = candidatePlots.map((p) => p._id).filter(Boolean);

  const [plotLeads, leadsByPlotLink] = await Promise.all([
    leadIds.length
      ? Lead.find({ _id: { $in: Array.from(new Set(leadIds.map(String))) } })
          .select(LEAD_SELECT)
          .lean()
      : [],
    plotIds.length
      ? Lead.find({ $or: [{ plotId: { $in: plotIds } }, { plotIds: { $in: plotIds } }] })
          .select(LEAD_SELECT)
          .lean()
      : [],
  ]);

  const leadMap = new Map(plotLeads.map((l) => [String(l._id), l]));
  const plotIdToLead = new Map();
  for (const lead of leadsByPlotLink) {
    if (lead.plotId && !plotIdToLead.has(String(lead.plotId))) {
      plotIdToLead.set(String(lead.plotId), lead);
    }
    for (const pid of lead.plotIds || []) {
      const key = String(pid);
      if (!plotIdToLead.has(key)) plotIdToLead.set(key, lead);
    }
  }

  const staffUserIds = new Set();
  candidatePlots.forEach((p) => {
    if (p.assignedTo) staffUserIds.add(String(p.assignedTo));
    if (p.bookedBy?.staffId) staffUserIds.add(String(p.bookedBy.staffId));
  });
  plotLeads.forEach((l) => {
    if (l.assignedTo) staffUserIds.add(String(l.assignedTo));
  });
  leadsByPlotLink.forEach((l) => {
    if (l.assignedTo) staffUserIds.add(String(l.assignedTo));
  });

  const validStaffIds = Array.from(staffUserIds).filter(isMongoHexId);
  const staffUsers = validStaffIds.length
    ? await User.find({ _id: { $in: validStaffIds } })
        .select('_id name displayId role')
        .lean()
    : [];
  const staffUserMap = new Map(staffUsers.map((u) => [String(u._id), u]));

  const enrichedCandidatePlots = candidatePlots.map((plot) => {
    const lid = plot.bookedBy?.leadId || plot.pendingApproval?.leadId || plot.leadId;
    let lead = lid ? leadMap.get(String(lid)) : null;
    if (!lead) lead = plotIdToLead.get(String(plot._id));

    // Resolve one effective staff identity using displayed precedence:
    // 1: bookedBy staff info
    // 2: assignedTo on plot
    // 3: lead assignedTo
    let effStaffId = '';
    let effStaffName = '';
    let effStaffDisplayId = '';

    const bStaffId = plot.bookedBy?.staffId ? String(plot.bookedBy.staffId) : '';
    const bStaffUser = bStaffId ? staffUserMap.get(bStaffId) : null;
    const bStaffName = bStaffUser?.name || plot.bookedBy?.staffName || '';
    const bStaffDisplay = bStaffUser?.displayId || plot.bookedBy?.staffDisplayId || '';

    if (bStaffId || bStaffName || bStaffDisplay) {
      effStaffId = bStaffId || (bStaffUser ? String(bStaffUser._id) : '');
      effStaffName = bStaffName;
      effStaffDisplayId = bStaffDisplay;
    } else if (plot.assignedTo || plot.assignedToName || plot.assignedToDisplayId) {
      const pStaffId = plot.assignedTo ? String(plot.assignedTo) : '';
      const pStaffUser = pStaffId ? staffUserMap.get(pStaffId) : null;
      effStaffId = pStaffId || (pStaffUser ? String(pStaffUser._id) : '');
      effStaffName = pStaffUser?.name || plot.assignedToName || '';
      effStaffDisplayId = pStaffUser?.displayId || plot.assignedToDisplayId || '';
    } else if (lead?.assignedTo || lead?.assignedToName || lead?.assignedToDisplayId) {
      const lStaffId = lead.assignedTo ? String(lead.assignedTo) : '';
      const lStaffUser = lStaffId ? staffUserMap.get(lStaffId) : null;
      effStaffId = lStaffId || (lStaffUser ? String(lStaffUser._id) : '');
      effStaffName = lStaffUser?.name || lead.assignedToName || '';
      effStaffDisplayId = lStaffUser?.displayId || lead.assignedToDisplayId || '';
    }

    const effPaymentStatus = getEffectivePaymentStatus(plot, lead);
    const effLoanStage = getEffectiveLoanStage(plot, lead);

    return {
      ...plot,
      id: String(plot._id),
      assignedToName: effStaffName || plot.assignedToName || '',
      assignedToDisplayId: effStaffDisplayId || plot.assignedToDisplayId || '',
      effectiveStaffId: effStaffId,
      effectiveStaffName: effStaffName,
      effectiveStaffDisplayId: effStaffDisplayId,
      effectivePaymentStatus: effPaymentStatus,
      effectiveLoanStage: effLoanStage,
      leadInfo: lead
        ? {
            _id: lead._id,
            displayId: lead.displayId,
            customerName: lead.customerName,
            phone: lead.phone,
            status: lead.status,
            city: lead.city,
            sourceType: lead.sourceType,
            source: lead.source,
            assignedTo: lead.assignedTo,
            assignedToName: lead.assignedToName,
            assignedToDisplayId: lead.assignedToDisplayId,
            loanStage: lead.loanStage,
            paymentStatus: lead.paymentStatus,
          }
        : null,
    };
  });

  // ─── 7. Apply Post-Enrichment Filters ─────────────────────────────
  const filterStaffUserId = query.bookedByUserId ? String(query.bookedByUserId) : '';

  const matchingPlots = enrichedCandidatePlots.filter((p) => {
    const lead = p.leadInfo;

    // Staff authorization scoping safeguard
    if (isStaffRole && staffUserIdStr) {
      const isPlotAssigned = p.assignedTo && String(p.assignedTo) === staffUserIdStr;
      const isBookedByStaff = p.bookedBy?.staffId && String(p.bookedBy.staffId) === staffUserIdStr;
      const isStaffDisplayMatch =
        user.displayId &&
        p.bookedBy?.staffDisplayId &&
        p.bookedBy.staffDisplayId.toUpperCase() === user.displayId.toUpperCase();
      const isLeadAssigned = lead?.assignedTo && String(lead.assignedTo) === staffUserIdStr;
      const isEffectiveMatch = p.effectiveStaffId === staffUserIdStr;
      if (!isPlotAssigned && !isBookedByStaff && !isStaffDisplayMatch && !isLeadAssigned && !isEffectiveMatch) {
        return false;
      }
    }

    // Filter by specific bookedByUserId
    if (filterStaffUserId) {
      if (p.effectiveStaffId !== filterStaffUserId) {
        return false;
      }
    }

    // Payment Status filter
    if (paymentStatusFilter && paymentStatusFilter !== 'All') {
      const effStatus = p.effectivePaymentStatus;
      if (
        paymentStatusFilter === 'Pending Payment' ||
        paymentStatusFilter === 'pending' ||
        paymentStatusFilter === 'not_fully_paid'
      ) {
        if (effStatus === 'Fully Paid') return false;
      } else {
        if (effStatus.toLowerCase() !== paymentStatusFilter.toLowerCase()) return false;
      }
    }

    // Loan Stage filter
    if (loanStageFilter && loanStageFilter !== 'All') {
      const effStage = p.effectiveLoanStage;
      if (effStage.toLowerCase() !== loanStageFilter.toLowerCase()) return false;
    }

    return true;
  });

  if (matchingPlots.length === 0) {
    return {
      success: true,
      count: 0,
      total: 0,
      totalPlots: 0,
      pagination: { page: reqPage, limit: reqLimit, total: 0, totalPlots: 0, pages: 1 },
      data: [],
    };
  }

  // ─── 8. Group Matching Plots by Customer (Disjoint-Set Union) ──────
  const parent = matchingPlots.map((_, i) => i);
  const findRoot = (i) => {
    if (parent[i] !== i) parent[i] = findRoot(parent[i]);
    return parent[i];
  };

  const keyToOwner = new Map();
  matchingPlots.forEach((plot, i) => {
    const keys = customerIdentityKeys(plot);
    keys.forEach((k) => {
      const owner = keyToOwner.get(k);
      if (owner === undefined) {
        keyToOwner.set(k, i);
      } else {
        const rootA = findRoot(owner);
        const rootB = findRoot(i);
        if (rootA !== rootB) parent[rootB] = rootA;
      }
    });
  });

  const groupBuckets = new Map();
  matchingPlots.forEach((plot, i) => {
    const root = findRoot(i);
    if (!groupBuckets.has(root)) {
      groupBuckets.set(root, []);
    }
    groupBuckets.get(root).push(plot);
  });

  // Pick representative plot from matching plots
  const customerGroups = Array.from(groupBuckets.values()).map((groupPlots) => {
    let rep = groupPlots[0];
    if (tabStatus === 'Registered') {
      // Pick latest registration date
      groupPlots.forEach((p) => {
        const tNew = p.registrationDate ? new Date(p.registrationDate).getTime() : new Date(p.createdAt || 0).getTime();
        const tCur = rep.registrationDate ? new Date(rep.registrationDate).getTime() : new Date(rep.createdAt || 0).getTime();
        if (tNew > tCur) rep = p;
      });
    } else {
      // Upcoming: pick most urgent date (oldest overdue first, nearest future)
      groupPlots.forEach((p) => {
        const tNew = p.expectedRegistrationDate ? new Date(p.expectedRegistrationDate).getTime() : Infinity;
        const tCur = rep.expectedRegistrationDate ? new Date(rep.expectedRegistrationDate).getTime() : Infinity;
        if (tNew < tCur) rep = p;
      });
    }
    return {
      representative: rep,
      matchingPlots: groupPlots,
    };
  });

  // ─── 9. Global Sorting of Customer Groups ─────────────────────────
  customerGroups.sort((a, b) => {
    const plotA = a.representative;
    const plotB = b.representative;

    if (sortBy === 'customer_name' || sortBy === 'bookedBy.name') {
      const nameA = (plotA.bookedBy?.name || plotA.leadInfo?.customerName || '').toLowerCase().trim();
      const nameB = (plotB.bookedBy?.name || plotB.leadInfo?.customerName || '').toLowerCase().trim();
      const diff = nameA.localeCompare(nameB);
      if (diff !== 0) return diff;
    } else if (sortBy === 'expected_date' || (tabStatus === 'Booked' && sortBy === 'urgency')) {
      const dateA = plotA.expectedRegistrationDate ? String(plotA.expectedRegistrationDate).split('T')[0] : '';
      const dateB = plotB.expectedRegistrationDate ? String(plotB.expectedRegistrationDate).split('T')[0] : '';

      if (!dateA && dateB) return 1;
      if (dateA && !dateB) return -1;
      if (dateA && dateB) {
        const diff = dateA.localeCompare(dateB);
        if (diff !== 0) return diff;
      }
    } else if (sortBy === 'oldest' || sortBy === 'createdAt') {
      const dA =
        tabStatus === 'Registered'
          ? plotA.registrationDate || plotA.createdAt
          : plotA.expectedRegistrationDate || plotA.createdAt;
      const dB =
        tabStatus === 'Registered'
          ? plotB.registrationDate || plotB.createdAt
          : plotB.expectedRegistrationDate || plotB.createdAt;
      const tA = dA ? new Date(dA).getTime() : 0;
      const tB = dB ? new Date(dB).getTime() : 0;
      if (tA !== tB) return tA - tB;
    } else {
      // newest (default)
      const dA =
        tabStatus === 'Registered'
          ? plotA.registrationDate || plotA.createdAt
          : plotA.expectedRegistrationDate || plotA.createdAt;
      const dB =
        tabStatus === 'Registered'
          ? plotB.registrationDate || plotB.createdAt
          : plotB.expectedRegistrationDate || plotB.createdAt;
      const tA = dA ? new Date(dA).getTime() : 0;
      const tB = dB ? new Date(dB).getTime() : 0;
      if (tA !== tB) return tB - tA;
    }

    const idA = String(plotA.leadInfo?.displayId || plotA.plotNumber || plotA._id);
    const idB = String(plotB.leadInfo?.displayId || plotB.plotNumber || plotB._id);
    return idA.localeCompare(idB);
  });

  // ─── 10. Paginate First, then Enrich Related Bookings ──────────────
  const total = customerGroups.length;
  const totalPlots = customerGroups.reduce((sum, g) => sum + g.matchingPlots.length, 0);
  const pages = Math.max(1, Math.ceil(total / reqLimit));

  const startIndex = (reqPage - 1) * reqLimit;
  const pagedGroups = customerGroups.slice(startIndex, startIndex + reqLimit);
  const pagedRepresentatives = pagedGroups.map((g) => g.representative);

  // Enrich sibling bookings ONLY on the paged customer representatives
  const withRelated = await attachRelatedBookings(
    pagedRepresentatives,
    isStaffRole && staffAccessOr ? { staffAccessOr } : {}
  );

  const paginatedData = withRelated.map((plot, idx) => ({
    ...plot,
    matchingPlotCount: pagedGroups[idx].matchingPlots.length,
  }));

  return {
    success: true,
    count: paginatedData.length,
    total,
    totalPlots,
    pagination: {
      page: reqPage,
      limit: reqLimit,
      total,
      totalPlots,
      pages,
    },
    data: paginatedData,
  };
}

module.exports = {
  queryCustomerGroupedBookings,
};
