const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Plot = require('../models/Plot');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const {
  findLeadForPlot,
  linkLeadToPlot,
  unlinkLeadFromPlot,
  getActivePlotIdsForLead,
  ACTIVE_PLOT_STATUSES,
} = require('../utils/leadPlotLink');
const { applyPlotPaymentStatusFilter } = require('../utils/plotQueryFilters');
const { attachRelatedBookings, findCustomerBookingPlots, collapsePlotsByCustomer } = require('../utils/plotCustomerBookings');

// ─── Helper: create activity log entry ─────────────────────────────────
const logActivity = async ({ actor, actionType, action, entityType, entityId, entityName, ipAddress }) => {
  try {
    await ActivityLog.create({
      actorId: String(actor._id || actor.id || ''),
      actorName: actor.name || 'System',
      actorRole: actor.role || 'staff',
      actorInitials: actor.initials || '',
      actorAvatarBg: actor.avatarBg || '',
      actionType,
      action,
      entityType,
      entityId: String(entityId || ''),
      entityName: entityName || '',
      timestamp: new Date().toISOString(),
      ipAddress: ipAddress || '',
    });
  } catch (err) {
    console.error('Failed to create activity log:', err.message);
  }
};

// @desc    Get all plots
// @route   GET /api/v1/plots
// @access  Public
exports.getPlots = asyncHandler(async (req, res, next) => {
  const plots = res.advancedResults.data || [];

  const LEAD_SELECT =
    '_id displayId customerName phone status paymentStatus city sourceType source assignedTo assignedToName assignedToDisplayId plotId plotIds';

  const leadIds = plots
    .map((p) => p.bookedBy?.leadId || p.pendingApproval?.leadId || p.leadId)
    .filter(Boolean);

  const plotIds = plots.map((p) => p._id).filter(Boolean);

  const [plotLeads, leadsByPlotLink] = await Promise.all([
    leadIds.length
      ? Lead.find({ _id: { $in: Array.from(new Set(leadIds.map(String))) } }).select(LEAD_SELECT)
      : [],
    plotIds.length
      ? Lead.find({
          $or: [{ plotId: { $in: plotIds } }, { plotIds: { $in: plotIds } }],
        }).select(LEAD_SELECT)
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

  const toLeadInfo = (lead) =>
    lead
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
        }
      : null;

  const staffUserIds = new Set();
  plots.forEach((p) => {
    if (p.assignedTo) staffUserIds.add(String(p.assignedTo));
    if (p.bookedBy?.staffId) staffUserIds.add(String(p.bookedBy.staffId));
  });

  const validStaffIds = Array.from(staffUserIds).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const staffUsers = validStaffIds.length
    ? await User.find({ _id: { $in: validStaffIds } }).select('_id name displayId').lean()
    : [];
  const staffUserMap = new Map(staffUsers.map((u) => [String(u._id), u]));

  const enrichedPlots = plots.map((plot) => {
    const lid = plot.bookedBy?.leadId || plot.pendingApproval?.leadId || plot.leadId;
    let lead = lid ? leadMap.get(String(lid)) : null;
    if (!lead) lead = plotIdToLead.get(String(plot._id));

    const plotObj = plot.toObject ? plot.toObject() : { ...plot };

    const assignedUser = plotObj.assignedTo ? staffUserMap.get(String(plotObj.assignedTo)) : null;
    const bookedByUser = plotObj.bookedBy?.staffId ? staffUserMap.get(String(plotObj.bookedBy.staffId)) : null;
    const staff = assignedUser || bookedByUser;
    if (staff) {
      if (!plotObj.assignedToName) plotObj.assignedToName = staff.name;
      if (!plotObj.assignedToDisplayId) plotObj.assignedToDisplayId = staff.displayId;
    }

    return {
      ...plotObj,
      leadInfo: toLeadInfo(lead),
    };
  });

  const withRelated = await attachRelatedBookings(enrichedPlots);
  let data =
    String(req.query.groupBy || '') === 'customer'
      ? collapsePlotsByCustomer(withRelated)
      : withRelated;

  if (req.query.status) {
    data = data.filter((p) => p.status === req.query.status);
  }

  res.status(200).json({
    ...res.advancedResults,
    count: data.length,
    data,
  });
});

// @desc    All Booked/Registered/Pending plots for one customer (lead, phone, or plot)
// @route   GET /api/v1/plots/customer-bookings
// @access  Private
exports.getCustomerBookings = asyncHandler(async (req, res) => {
  const plots = await findCustomerBookingPlots({
    leadId: req.query.leadId,
    leadIds: req.query.leadIds,
    phone: req.query.phone,
    plotId: req.query.plotId,
    status: req.query.status,
  });

  res.status(200).json({
    success: true,
    count: plots.length,
    data: plots,
  });
});

// @desc    Get single plot
// @route   GET /api/v1/plots/:id
// @access  Public
exports.getPlot = asyncHandler(async (req, res, next) => {
  const plot = await Plot.findById(req.params.id)
    .populate({
      path: 'projectId',
      select: 'name location status displayId',
    });

  if (!plot) {
    return next(new ErrorResponse(`Plot not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: plot,
  });
});

// ─── Helper: convert any size to Sq Feet ───────────────────────────────
const toSqFeet = (value, unit) => {
  const v = Number(value) || 0;
  if (!unit) return v;
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u === 'sqfeet' || u === 'sqft' || u === 'feet') return v;
  if (u === 'sqyards' || u === 'sqyard' || u === 'yards') return v * 9;
  if (u === 'acres' || u === 'acre') return v * 43560;
  if (u === 'cents' || u === 'cent') return v * 435.6;
  if (u === 'sqmeters' || u === 'sqmeter' || u === 'sqm' || u === 'meters' || u === 'sqmetre' || u === 'sqmtrs') return v * 10.763910417;
  return v;
};

// ─── Helper: validate plot size against project land area ──────────────
const validatePlotAreaAgainstProject = async (projectId, newSize, newSizeUnit, excludePlotId = null) => {
  const project = await Project.findById(projectId).select('totalLandArea landAreaUnit name');
  if (!project || !project.totalLandArea) return; // no project or no land area set — skip

  const projectSqFt = toSqFeet(project.totalLandArea, project.landAreaUnit);

  const plotQuery = { projectId };
  if (excludePlotId) plotQuery._id = { $ne: excludePlotId };
  const existingPlots = await Plot.find(plotQuery).select('size sizeUnit');

  const existingSqFt = existingPlots.reduce((sum, p) => sum + toSqFeet(p.size, p.sizeUnit), 0);
  const newSqFt = toSqFeet(newSize, newSizeUnit);
  const totalAfter = existingSqFt + newSqFt;

  if (totalAfter > projectSqFt) {
    const remainingSqFt = Math.max(0, projectSqFt - existingSqFt);
    throw new Error(
      `Plot size exceeds available land area. Project total: ${project.totalLandArea} ${project.landAreaUnit} (${Math.round(projectSqFt)} sq ft). ` +
      `Already allocated: ${Math.round(existingSqFt)} sq ft. ` +
      `Remaining: ${Math.round(remainingSqFt)} sq ft. ` +
      `Requested: ${Math.round(newSqFt)} sq ft.`
    );
  }
};

// @desc    Create plot
// @route   POST /api/v1/plots
// @access  Private
exports.createPlot = asyncHandler(async (req, res, next) => {
  try {
    // Add project id to req.body if provided in params
    if (req.params.projectId) {
      req.body.projectId = req.params.projectId;
    }
    if (req.body.projectId && typeof req.body.projectId === 'object') {
      req.body.projectId = req.body.projectId._id || req.body.projectId.id;
    }

    // Validate plot size against project total land area
    if (req.body.projectId && req.body.size) {
      try {
        await validatePlotAreaAgainstProject(req.body.projectId, req.body.size, req.body.sizeUnit || 'Sq Feet');
      } catch (validationErr) {
        return res.status(400).json({ success: false, error: validationErr.message });
      }
    }

    const plot = await Plot.create(req.body);

    res.status(201).json({
      success: true,
      data: plot,
    });
  } catch (error) {
    // If validation fails or duplicate key, return 400
    if (error.name === 'ValidationError' || error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    // Otherwise pass to standard error handler
    return next(error);
  }
});

async function applyPlotRegistration(plot, { registrationDate, paymentStatus, docNumber, actor, ip }) {
  const dateStr = registrationDate || new Date().toISOString().split('T')[0];
  plot.status = 'Registered';
  plot.registrationDate = dateStr;
  if (docNumber) {
    plot.docNumber = docNumber;
  }
  if (paymentStatus) {
    plot.bookedBy = { ...(plot.bookedBy || {}), paymentStatus };
  }
  const actorName = actor?.name || 'Admin';
  const actorRole = actor?.role === 'staff' ? 'Staff' : 'Admin';
  const actorType = actor?.role === 'staff' ? 'staff' : 'admin';
  const regTimelineEvent = {
    id: `reg-${Date.now()}`,
    type: 'booking_confirmed',
    label: 'Plot Registered',
    actor: actorName,
    actorRole,
    actorType,
    date: dateStr,
    details: `Plot registered on ${dateStr}`,
    color: 'blue',
  };
  plot.timeline = [regTimelineEvent, ...(plot.timeline || [])];
  await plot.save();

  try {
    const lead = await findLeadForPlot(plot);
    if (lead) {
      const leadUpdate = {
        followUps: [
          ...(lead.followUps || []),
          {
            id: `reg-${Date.now()}`,
            date: dateStr,
            notes: `Plot #${plot.plotNumber} registered`,
            outcome: 'Registered',
            nextAction: '',
          },
        ],
      };
      if (paymentStatus) leadUpdate.paymentStatus = paymentStatus;
      await Lead.findByIdAndUpdate(lead._id, leadUpdate);

      await logActivity({
        actor,
        actionType: 'Status Change',
        action: `Registered Plot #${plot.plotNumber} for ${lead.customerName}`,
        entityType: 'Plot',
        entityId: plot._id,
        entityName: `Plot #${plot.plotNumber}`,
        ipAddress: ip,
      });
    }
  } catch (leadErr) {
    console.error('Failed to update lead on registration:', leadErr.message);
  }

  return plot;
}

// @desc    Update plot
// @route   PUT /api/v1/plots/:id
// @access  Private
exports.updatePlot = asyncHandler(async (req, res, next) => {
  let plot = await Plot.findById(req.params.id);

  if (!plot) {
    return next(new ErrorResponse(`Plot not found with id of ${req.params.id}`, 404));
  }

  // Validate size against project total land area if size is being updated
  if (req.body.size !== undefined) {
    const newSize = req.body.size;
    const newSizeUnit = req.body.sizeUnit || plot.sizeUnit || 'Sq Feet';
    try {
      await validatePlotAreaAgainstProject(plot.projectId, newSize, newSizeUnit, plot._id);
    } catch (validationErr) {
      return res.status(400).json({ success: false, error: validationErr.message });
    }
  }

  const allowedFields = {
    plotNumber: req.body.plotNumber,
    status: req.body.status,
    facing: req.body.facing,
    size: req.body.size,
    sizeUnit: req.body.sizeUnit,
    type: req.body.type,
    price: req.body.price,
    timeline: req.body.timeline,
    bookedBy: req.body.bookedBy,
    expectedRegistrationDate: req.body.expectedRegistrationDate,
    registrationDate: req.body.registrationDate,
    docNumber: req.body.docNumber,
    isQuarantined: req.body.isQuarantined,
    quarantineNotes: req.body.quarantineNotes,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  // Staff may update booking/registration fields only (same pages as admin Loans/Registrations).
  if (req.user?.role === 'staff') {
    delete allowedFields.plotNumber;
    delete allowedFields.status;
    delete allowedFields.facing;
    delete allowedFields.size;
    delete allowedFields.sizeUnit;
    delete allowedFields.type;
    delete allowedFields.price;
    delete allowedFields.timeline;
  }

  const shouldAutoRegister =
    plot.status === 'Booked' &&
    typeof req.body.registrationDate === 'string' &&
    req.body.registrationDate.trim() !== '';

  plot = await Plot.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (shouldAutoRegister && plot && plot.status === 'Booked') {
    plot = await applyPlotRegistration(plot, {
      registrationDate: req.body.registrationDate.trim(),
      paymentStatus: req.body.bookedBy?.paymentStatus || req.body.paymentStatus,
      actor: req.user,
      ip: req.ip,
    });
  }

  res.status(200).json({
    success: true,
    data: plot,
  });
});

// @desc    Book a plot (staff → Pending, admin → Booked)
// @route   PUT /api/v1/plots/:id/book
// @access  Private (staff + admin)
exports.bookPlot = asyncHandler(async (req, res, next) => {
  if (!req.body.expectedRegistrationDate || String(req.body.expectedRegistrationDate).trim() === '') {
    return next(new ErrorResponse('Expected Registration Date is required to book a plot', 400));
  }

  const isStaffBooking = req.user.role === 'staff';
  const paymentMethod = req.body.paymentMethod || 'CASH';
  let paymentStatus = req.body.paymentStatus || 'Not Paid';

  // If Payment Method is LOAN and loan is not disbursed, status cannot be Fully Paid (BUG-18)
  if (paymentMethod.toUpperCase() === 'LOAN' && paymentStatus === 'Fully Paid') {
    paymentStatus = 'Partially Paid';
  }

  const today = new Date().toISOString().split('T')[0];
  const timelineEvent = isStaffBooking
    ? {
        id: `book-req-${Date.now()}`,
        type: 'reserved',
        label: 'Booking Requested',
        actor: req.user.name || 'Staff',
        actorRole: 'Staff',
        actorType: 'staff',
        date: today,
        details: `Booking requested by ${req.user.name} (${paymentMethod})`,
        color: 'amber',
      }
    : {
        id: `book-${Date.now()}`,
        type: 'new_booking',
        label: 'Plot Booked',
        actor: req.user.name || 'Admin',
        actorRole: 'Admin',
        actorType: 'admin',
        date: today,
        details: `Plot booked for ${req.body.customerName || 'customer'} (${paymentMethod})`,
        color: 'green',
      };

  const update = isStaffBooking
    ? {
        status: 'Pending',
        pendingApproval: {
          leadId: req.body.leadId,
          customerName: req.body.customerName,
          phone: req.body.phone,
          requestedBy: String(req.user._id || req.user.id || ''),
          requestedAt: today,
          paymentStatus,
          paymentMethod,
          bank: req.body.bank || '',
          bankFollowerName: req.body.bankFollowerName || '',
          bankFollowerPhone: req.body.bankFollowerPhone || '',
          notes: req.body.notes || '',
        },
        expectedRegistrationDate: req.body.expectedRegistrationDate || '',
      }
    : {
        status: 'Booked',
        bookedBy: {
          name: req.body.customerName,
          phone: req.body.phone,
          paymentStatus,
          paymentMethod,
          type: 'customer',
          advanceAmount: 0,
          balanceAmount: 0,
          bank: req.body.bank || '',
          bankFollowerName: req.body.bankFollowerName || '',
          bankFollowerPhone: req.body.bankFollowerPhone || '',
          loanStage: 'Not Applied',
          leadId: req.body.leadId || '',
          bookedAt: today,
        },
        expectedRegistrationDate: req.body.expectedRegistrationDate || '',
      };

  const plot = await Plot.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['Available', 'Canceled'] } },
    update,
    { returnDocument: 'after', runValidators: true }
  );

  if (!plot) {
    return next(new ErrorResponse('Plot not found or already booked', 400));
  }

  // Prepend booking timeline event, preserving prior history
  plot.timeline = [timelineEvent, ...(plot.timeline || [])];
  await plot.save();

  // ─── Update the Lead with booking info ──────────────────────────────────
  let targetLeadId = req.body.leadId;
  if (!targetLeadId && req.body.phone) {
    try {
      const leadByPhone = await Lead.findOne({ phone: req.body.phone });
      if (leadByPhone) targetLeadId = leadByPhone._id;
    } catch (leadPhoneErr) {
      console.error('Failed to find lead by phone on booking:', leadPhoneErr.message);
    }
  }

  if (targetLeadId) {
    try {
      let lead = null;
      if (mongoose.Types.ObjectId.isValid(targetLeadId)) {
        lead = await Lead.findById(targetLeadId);
      }
      if (!lead && req.body.phone) {
        lead = await Lead.findOne({ phone: req.body.phone });
      }

      if (lead) {
        // Additive booking: keep sibling Booked/Pending/Registered plots.
        if (isStaffBooking && plot.pendingApproval) {
          plot.pendingApproval.leadId = String(lead._id);
        } else if (plot.bookedBy) {
          plot.bookedBy.leadId = String(lead._id);
        }
        await plot.save();

        await linkLeadToPlot(lead._id, plot._id, { setCustomer: !isStaffBooking });

        const leadUpdate = {
          paymentStatus,
          paymentMethod,
        };
        if (req.body.bank) leadUpdate.bank = req.body.bank;
        if (req.body.bankFollowerName) leadUpdate.bankFollowerName = req.body.bankFollowerName;
        if (req.body.bankFollowerPhone) leadUpdate.bankFollowerPhone = req.body.bankFollowerPhone;

        await Lead.findByIdAndUpdate(lead._id, leadUpdate, { returnDocument: 'after' });

        await logActivity({
          actor: req.user,
          actionType: 'Status Change',
          action: isStaffBooking
            ? `Requested booking of Plot #${plot.plotNumber} for lead ${lead.customerName} (${paymentMethod})`
            : `Booked Plot #${plot.plotNumber} for lead ${lead.customerName} (${paymentMethod})`,
          entityType: 'Plot',
          entityId: plot._id,
          entityName: `Plot #${plot.plotNumber}`,
          ipAddress: req.ip,
        });
      }
    } catch (leadErr) {
      console.error('Failed to update lead on booking:', leadErr.message);
    }
  }

  // Create notification for all admins if this was requested by staff
  if (isStaffBooking) {
    try {
      const project = await Project.findById(plot.projectId);
      const projectName = project ? project.name : 'Project';
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          type: 'booking',
          userId: admin._id,
          entityId: `${plot.projectId}:${plot._id}`,
          entityType: 'Project',
          message: `New booking request for Plot #${plot.plotNumber} in ${projectName} by ${req.user.name}`,
          actorName: req.user.name,
          isToday: true,
          isRead: false
        });
      }
    } catch (notifErr) {
      console.error('Failed to create booking notification:', notifErr);
    }
  }

  res.status(200).json({
    success: true,
    data: plot,
  });
});

// @desc    Approve a pending booking or cancellation
// @route   PUT /api/v1/plots/:id/approve
// @access  Private (admin only)
exports.approveBooking = asyncHandler(async (req, res, next) => {
  const plot = await Plot.findById(req.params.id);
  if (!plot) return next(new ErrorResponse('Plot not found', 404));
  if (plot.status !== 'Pending' || !plot.pendingApproval) {
    return next(new ErrorResponse('No pending approval for this plot', 400));
  }

  const today = new Date().toISOString().split('T')[0];
  const approval = plot.pendingApproval;
  const isCancellation = approval.requestType === 'cancellation';

  if (isCancellation) {
    const linkedLead = await findLeadForPlot(plot);

    plot.status = 'Canceled';
    plot.bookedBy = undefined;
    plot.pendingApproval = undefined;
    plot.registrationDate = undefined;

    const cancelTimelineEvent = {
      id: `cancel-${Date.now()}`,
      type: 'booking_canceled',
      label: 'Booking Cancelled',
      actor: req.user.name || 'Admin',
      actorRole: 'Admin',
      actorType: 'admin',
      date: new Date().toISOString().split('T')[0],
      details: 'Cancellation approved by Admin',
      color: 'red',
    };
    plot.timeline = [cancelTimelineEvent, ...(plot.timeline || [])];
    await plot.save();

    await logActivity({
      actor: req.user,
      actionType: 'Status Change',
      action: `Cancelled booking of Plot #${plot.plotNumber}`,
      entityType: 'Plot',
      entityId: plot._id,
      entityName: `Plot #${plot.plotNumber}`,
      ipAddress: req.ip,
    });

    // Per-plot unlink; keep lead Customer if other active plots remain
    try {
      if (linkedLead) {
        await unlinkLeadFromPlot(linkedLead._id, plot._id);
        const remaining = await getActivePlotIdsForLead(linkedLead._id);
        if (remaining.length === 0) {
          const refreshed = await Lead.findById(linkedLead._id);
          if (refreshed && (refreshed.status === 'Customer' || refreshed.status === 'Reserved')) {
            refreshed.status = 'Qualified';
            await refreshed.save();
          }
        }
      }
    } catch (lErr) {
      console.error('Failed to revert lead on cancellation approval:', lErr.message);
    }

    return res.status(200).json({ success: true, data: plot });
  }

  // Booking approval
  const paymentMethod = approval.paymentMethod || 'CASH';
  plot.status = 'Booked';
  plot.bookedBy = {
    name: approval.customerName,
    phone: approval.phone,
    paymentStatus: approval.paymentStatus || 'Not Paid',
    paymentMethod,
    type: 'customer',
    advanceAmount: 0,
    balanceAmount: 0,
    bank: approval.bank || '',
    bankFollowerName: approval.bankFollowerName || '',
    bankFollowerPhone: approval.bankFollowerPhone || '',
    loanStage: 'Not Applied',
    leadId: approval.leadId || '',
    staffId: approval.requestedBy || '',
    bookedAt: today,
  };
  plot.pendingApproval = undefined;

  const appTimelineEvent = {
    id: `app-${Date.now()}`,
    type: 'booking_confirmed',
    label: 'Booking Approved',
    actor: req.user.name || 'Admin',
    actorRole: 'Admin',
    actorType: 'admin',
    date: new Date().toISOString().split('T')[0],
    details: 'Booking approved by Admin',
    color: 'green',
  };
  plot.timeline = [appTimelineEvent, ...(plot.timeline || [])];
  await plot.save();

  // ─── Update the associated Lead ─────────────────────────────────────────
  try {
    let lead = await findLeadForPlot(plot);
    if (!lead && approval.leadId && mongoose.Types.ObjectId.isValid(approval.leadId)) {
      lead = await Lead.findById(approval.leadId);
    }
    if (!lead && approval.phone) {
      lead = await Lead.findOne({ phone: approval.phone });
    }

    if (lead) {
      if (plot.bookedBy) {
        plot.bookedBy.leadId = String(lead._id);
        await plot.save();
      }

      await linkLeadToPlot(lead._id, plot._id, { setCustomer: true });
      await Lead.findByIdAndUpdate(lead._id, {
        paymentStatus: approval.paymentStatus || 'Not Paid',
        paymentMethod,
      });

      await logActivity({
        actor: req.user,
        actionType: 'Status Change',
        action: `Approved booking of Plot #${plot.plotNumber} for ${lead.customerName} (${paymentMethod})`,
        entityType: 'Plot',
        entityId: plot._id,
        entityName: `Plot #${plot.plotNumber}`,
        ipAddress: req.ip,
      });
    }
  } catch (leadErr) {
    console.error('Failed to update lead on approval:', leadErr.message);
  }

  // Notify the staff member who made the booking request
  try {
    const requestedByUserId = approval?.requestedBy;
    if (requestedByUserId && mongoose.Types.ObjectId.isValid(requestedByUserId)) {
      const staffNotif = await Notification.create({
        type: 'booking',
        userId: requestedByUserId,
        entityId: `${plot.projectId}:${plot._id}`,
        entityType: 'Project',
        message: `✅ Your booking request for Plot #${plot.plotNumber} has been APPROVED by Admin`,
        actorName: req.user.name,
        isToday: true,
        isRead: false,
      });
    }
  } catch (notifErr) {
    console.error('Failed to notify staff on approval:', notifErr.message);
  }

  res.status(200).json({ success: true, data: plot });
});

// @desc    Reject a pending booking or cancellation
// @route   PUT /api/v1/plots/:id/reject
// @access  Private (admin only)
exports.rejectBooking = asyncHandler(async (req, res, next) => {
  const plot = await Plot.findById(req.params.id);
  if (!plot) return next(new ErrorResponse('Plot not found', 404));
  if (plot.status !== 'Pending' || !plot.pendingApproval) {
    return next(new ErrorResponse('No pending approval for this plot', 400));
  }

  const isCancellation = plot.pendingApproval?.requestType === 'cancellation';

  if (isCancellation) {
    // Rejecting cancellation returns status to Booked
    plot.status = 'Booked';
    plot.pendingApproval = undefined;
    const rejTimelineEvent = {
      id: `rej-cancel-${Date.now()}`,
      type: 'booking_confirmed',
      label: 'Cancellation Rejected',
      actor: req.user.name || 'Admin',
      actorRole: 'Admin',
      actorType: 'admin',
      date: new Date().toISOString().split('T')[0],
      details: 'Cancellation rejected by Admin (Booking retained)',
      color: 'green',
    };
    plot.timeline = [rejTimelineEvent, ...(plot.timeline || [])];
    await plot.save();

    await logActivity({
      actor: req.user,
      actionType: 'Status Change',
      action: `Rejected cancellation for Plot #${plot.plotNumber} (booking retained)`,
      entityType: 'Plot',
      entityId: plot._id,
      entityName: `Plot #${plot.plotNumber}`,
      ipAddress: req.ip,
    });

    return res.status(200).json({ success: true, data: plot });
  }

  const targetLeadId = plot.pendingApproval?.leadId;
  const customerPhone = plot.pendingApproval?.phone;
  const requestedByUserId = plot.pendingApproval?.requestedBy;
  const rejectLead = await findLeadForPlot(plot);

  plot.status = 'Available';
  plot.pendingApproval = undefined;
  const rejBookingEvent = {
    id: `rej-book-${Date.now()}`,
    type: 'booking_canceled',
    label: 'Booking Rejected',
    actor: req.user.name || 'Admin',
    actorRole: 'Admin',
    actorType: 'admin',
    date: new Date().toISOString().split('T')[0],
    details: 'Booking rejected by Admin',
    color: 'red',
  };
  plot.timeline = [rejBookingEvent, ...(plot.timeline || [])];
  await plot.save();

  // ─── Unlink this plot only; status rules apply when no active plots remain ──
  try {
    let lead = rejectLead;
    if (!lead && targetLeadId && mongoose.Types.ObjectId.isValid(targetLeadId)) {
      lead = await Lead.findById(targetLeadId);
    }
    if (!lead && customerPhone) {
      lead = await Lead.findOne({ phone: customerPhone });
    }

    if (lead) {
      await unlinkLeadFromPlot(lead._id, plot._id);
      const remaining = await getActivePlotIdsForLead(lead._id);
      if (remaining.length === 0) {
        const refreshed = await Lead.findById(lead._id);
        if (refreshed) {
          // If already a Customer (e.g. bought in another project), retain Customer status
          if (refreshed.status !== 'Customer') {
            refreshed.status = 'Unqualified';
          }
          await refreshed.save();
        }
      }

      await logActivity({
        actor: req.user,
        actionType: 'Status Change',
        action: `Rejected booking of Plot #${plot.plotNumber} for ${lead.customerName}`,
        entityType: 'Plot',
        entityId: plot._id,
        entityName: `Plot #${plot.plotNumber}`,
        ipAddress: req.ip,
      });
    }
  } catch (leadErr) {
    console.error('Failed to revert lead on rejection:', leadErr.message);
  }

  // Notify the staff member who made the booking request
  try {
    if (requestedByUserId && mongoose.Types.ObjectId.isValid(requestedByUserId)) {
      const staffNotif = await Notification.create({
        type: 'booking',
        userId: requestedByUserId,
        entityId: `${plot.projectId}:${plot._id}`,
        entityType: 'Project',
        message: `❌ Your booking request for Plot #${plot.plotNumber} has been REJECTED by Admin`,
        actorName: req.user.name,
        isToday: true,
        isRead: false,
      });
    }
  } catch (notifErr) {
    console.error('Failed to notify staff on rejection:', notifErr.message);
  }

  res.status(200).json({ success: true, data: plot });
});
// @route   PUT /api/v1/plots/:id/register
// @access  Private (admin)
exports.registerPlot = asyncHandler(async (req, res, next) => {
  let plot = await Plot.findById(req.params.id);

  if (!plot) return next(new ErrorResponse('Plot not found', 404));
  if (plot.status !== 'Booked') {
    return next(new ErrorResponse('Only booked plots can be registered', 400));
  }

  plot = await applyPlotRegistration(plot, {
    registrationDate: req.body.registrationDate || new Date().toISOString().split('T')[0],
    paymentStatus: req.body.paymentStatus,
    docNumber: req.body.docNumber,
    actor: req.user,
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: plot });
});

// @desc    Cancel a plot booking (or submit cancellation request if staff)
// @route   PUT /api/v1/plots/:id/cancel
// @access  Private
exports.cancelBooking = asyncHandler(async (req, res, next) => {
  let plot = await Plot.findById(req.params.id);

  if (!plot) return next(new ErrorResponse('Plot not found', 404));

  if (plot.status !== 'Booked') {
    return next(new ErrorResponse('Only Booked plots can be canceled. Pending plots must be rejected by Admin instead.', 400));
  }

  const isStaffCancel = req.user.role === 'staff';

  if (isStaffCancel) {
    // If staff requests cancellation, submit as Pending Cancellation Approval
    plot.status = 'Pending';
    plot.pendingApproval = {
      requestType: 'cancellation',
      leadId: plot.bookedBy?.leadId || plot.pendingApproval?.leadId,
      customerName: plot.bookedBy?.name || plot.pendingApproval?.customerName,
      phone: plot.bookedBy?.phone || plot.pendingApproval?.phone,
      requestedBy: String(req.user._id || req.user.id || ''),
      requestedAt: new Date().toISOString().split('T')[0],
      notes: 'Cancellation requested by staff',
    };
    const reqTimelineEvent = {
      id: `req-cancel-${Date.now()}`,
      type: 'booking_canceled',
      label: 'Cancellation Requested',
      actor: req.user.name || 'Staff',
      actorRole: 'Staff',
      actorType: 'staff',
      date: new Date().toISOString().split('T')[0],
      details: 'Cancellation requested by staff',
      color: 'amber',
    };
    plot.timeline = [reqTimelineEvent, ...(plot.timeline || [])];
    await plot.save();

    // Create notifications for all admins
    try {
      const project = await Project.findById(plot.projectId);
      const projectName = project ? project.name : 'Project';
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          type: 'booking',
          userId: admin._id,
          entityId: `${plot.projectId}:${plot._id}`,
          entityType: 'Project',
          message: `New cancellation request for Plot #${plot.plotNumber} in ${projectName} by ${req.user.name}`,
          actorName: req.user.name,
          isToday: true,
          isRead: false
        });
      }
    } catch (notifErr) {
      console.error('Failed to create cancellation notification:', notifErr);
    }

    await logActivity({
      actor: req.user,
      actionType: 'Status Change',
      action: `Requested cancellation of Plot #${plot.plotNumber}`,
      entityType: 'Plot',
      entityId: plot._id,
      entityName: `Plot #${plot.plotNumber}`,
      ipAddress: req.ip,
    });

    return res.status(200).json({ success: true, data: plot });
  }

  // Admin direct cancellation
  const linkedLead = await findLeadForPlot(plot);
  const prevStatus = plot.status;
  plot.status = 'Canceled';
  plot.bookedBy = undefined;
  plot.pendingApproval = undefined;
  plot.registrationDate = undefined;

  const cancelTimelineEvent = {
    id: `cancel-${Date.now()}`,
    type: 'booking_canceled',
    label: 'Booking Cancelled',
    actor: req.user.name || 'Admin',
    actorRole: 'Admin',
    actorType: 'admin',
    date: new Date().toISOString().split('T')[0],
    details: `Cancelled from ${prevStatus}`,
    color: 'red',
  };
  plot.timeline = [cancelTimelineEvent, ...(plot.timeline || [])];
  await plot.save();

  // Per-plot unlink; keep lead Customer if other active plots remain
  try {
    if (linkedLead) {
      await unlinkLeadFromPlot(linkedLead._id, plot._id);
      const remaining = await getActivePlotIdsForLead(linkedLead._id);
      if (remaining.length === 0) {
        const refreshed = await Lead.findById(linkedLead._id);
        if (refreshed && (refreshed.status === 'Customer' || refreshed.status === 'Reserved')) {
          refreshed.status = 'Qualified';
          await refreshed.save();
        }
      }

      await logActivity({
        actor: req.user,
        actionType: 'Status Change',
        action: `Cancelled booking of Plot #${plot.plotNumber} (${prevStatus} -> Available)`,
        entityType: 'Plot',
        entityId: plot._id,
        entityName: `Plot #${plot.plotNumber}`,
        ipAddress: req.ip,
      });
    }
  } catch (leadErr) {
    console.error('Failed to update lead on booking cancel:', leadErr.message);
  }

  res.status(200).json({ success: true, data: plot });
});

// @desc    Get all plots with pending approval (global)
// @route   GET /api/v1/plots/pending-approvals
// @access  Private (admin only)
exports.getPendingApprovals = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;
  const query = { status: 'Pending', pendingApproval: { $exists: true } };
  const total = await Plot.countDocuments(query);
  const plots = await Plot.find(query)
    .populate({ path: 'projectId', select: 'name location' })
    .skip(skip).limit(limit).sort('-pendingApproval.requestedAt');

  res.status(200).json({
    success: true,
    count: plots.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: plots,
  });
});

// @desc    Delete plot
// @route   DELETE /api/v1/plots/:id
// @access  Private
exports.deletePlot = asyncHandler(async (req, res, next) => {
  const plot = await Plot.findById(req.params.id);

  if (!plot) {
    return next(new ErrorResponse(`Plot not found with id of ${req.params.id}`, 404));
  }

  // Cascade cleanup: unlink this plot from any leads
  const linkedLeads = await Lead.find({
    $or: [{ plotId: plot._id }, { plotIds: plot._id }],
  }).select('_id');
  for (const linked of linkedLeads) {
    await unlinkLeadFromPlot(linked._id, plot._id);
  }

  await logActivity({
    actor: req.user,
    actionType: 'Deleted',
    action: `Deleted Plot #${plot.plotNumber}`,
    entityType: 'Plot',
    entityId: plot._id,
    entityName: `Plot #${plot.plotNumber}`,
    ipAddress: req.ip,
  });

  await plot.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get plots by project
// @route   GET /api/v1/projects/:projectId/plots
// @access  Public
exports.getPlotsByProject = asyncHandler(async (req, res, next) => {
  const mongoose = require('mongoose');
  let projId = req.params.projectId;
  let projObjId = null;
  try {
    projObjId = new mongoose.Types.ObjectId(projId);
  } catch (e) {
    projObjId = null;
  }

  const query = { projectId: projObjId || projId };

  if (req.query.search && String(req.query.search).trim()) {
    query.plotNumber = { $regex: String(req.query.search).trim(), $options: 'i' };
  }

  if (req.query.status && req.query.status !== 'All' && req.query.status !== 'all') {
    if (req.query.status === 'Cancelled' || req.query.status === 'Canceled') {
      query.status = { $in: ['Cancelled', 'Canceled'] };
    } else {
      query.status = req.query.status;
    }
  }

  const total = await Plot.countDocuments(query);

  // Compute status counts and total allocated area via MongoDB aggregation
  let stats = { Available: 0, Booked: 0, Registered: 0, Cancelled: 0, Canceled: 0, Pending: 0, total: 0 };
  let allocatedSqFt = 0;
  const projectMatchFilter = projObjId ? { $in: [projObjId, projId] } : projId;
  {
    const statsAgg = await Plot.aggregate([
      { $match: { projectId: projectMatchFilter } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    statsAgg.forEach(s => {
      stats[s._id] = s.count;
      stats.total += s.count;
    });

    const sizeAgg = await Plot.aggregate([
      { $match: { projectId: projectMatchFilter } },
      {
        $group: {
          _id: null,
          totalSqFt: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $in: ['$sizeUnit', ['Sq Yards', 'SqYards', 'sq yards', 'sqyards']] }, then: { $multiply: [{ $toDouble: '$size' }, 9] } },
                  { case: { $in: ['$sizeUnit', ['Acres', 'acres', 'Acre', 'acre']] }, then: { $multiply: [{ $toDouble: '$size' }, 43560] } },
                  { case: { $in: ['$sizeUnit', ['Cents', 'cents', 'Cent', 'cent']] }, then: { $multiply: [{ $toDouble: '$size' }, 435.6] } },
                ],
                default: { $toDouble: '$size' }
              }
            }
          }
        }
      }
    ]);
    allocatedSqFt = (sizeAgg[0] && sizeAgg[0].totalSqFt) || 0;
  }

  if (req.query.all === 'true') {
    const maxAll = 10000;
    const plots = await Plot.find(query)
      .collation({ locale: 'en', numericOrdering: true })
      .sort({ plotNumber: 1 })
      .limit(maxAll);
    return res.status(200).json({
      success: true,
      count: plots.length,
      total,
      stats,
      allocatedSqFt,
      data: plots,
    });
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const skip = (page - 1) * limit;
  const plots = await Plot.find(query)
    .collation({ locale: 'en', numericOrdering: true })
    .sort({ plotNumber: 1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: plots.length,
    total,
    stats,
    allocatedSqFt,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: plots,
  });
});

// @desc    Get plots by status
// @route   GET /api/v1/plots/status/:status
// @access  Public
exports.getPlotsByStatus = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;

  let query = { status: req.params.status };

  if (req.query.hasExpectedDate === 'true') {
    query.expectedRegistrationDate = { $exists: true, $ne: '' };
  }

  const total = await Plot.countDocuments(query);
  const plots = await Plot.find(query)
    .populate({ path: 'projectId', select: 'name location status' })
    .skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: plots.length,
    total,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: plots,
  });
});

// @desc    Get plots booked by the current staff member (via assigned leads)
// @route   GET /api/v1/plots/my-bookings
// @access  Private (staff)
exports.getMyBookings = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;

  const myLeads = await Lead.find({
    assignedTo: req.user.id,
  }).select('_id displayId plotId plotIds customerName phone status paymentStatus city sourceType source assignedTo assignedToName assignedToDisplayId');

  const leadIds = myLeads.map((l) => String(l._id));
  const leadById = new Map(myLeads.map((l) => [String(l._id), l]));
  const legacyPlotIds = myLeads.flatMap((l) => [l.plotId, ...(l.plotIds || [])]).filter(Boolean);

  let query = {
    $or: [
      { 'bookedBy.staffId': req.user.id },
      { 'pendingApproval.requestedBy': req.user.id }
    ],
    status: { $in: ACTIVE_PLOT_STATUSES },
  };
  
  if (leadIds.length > 0) {
    query.$or.push({ 'bookedBy.leadId': { $in: leadIds } });
    query.$or.push({ 'pendingApproval.leadId': { $in: leadIds } });
  }
  
  if (legacyPlotIds.length > 0) {
    query.$or.push({ _id: { $in: legacyPlotIds } });
  }

  // Optional status filter
  if (req.query.status) {
    query.status = req.query.status;
  }

  // Optional projectId filter
  if (req.query.projectId) {
    query.projectId = req.query.projectId;
  }

  // Handle expectedRegistrationDate and registrationDate filters
  if (req.query['expectedRegistrationDate[gte]'] || req.query['expectedRegistrationDate[lte]']) {
    query.expectedRegistrationDate = {};
    if (req.query['expectedRegistrationDate[gte]']) query.expectedRegistrationDate.$gte = req.query['expectedRegistrationDate[gte]'];
    if (req.query['expectedRegistrationDate[lte]']) query.expectedRegistrationDate.$lte = req.query['expectedRegistrationDate[lte]'];
  }
  
  if (req.query['registrationDate[gte]'] || req.query['registrationDate[lte]']) {
    query.registrationDate = {};
    if (req.query['registrationDate[gte]']) query.registrationDate.$gte = req.query['registrationDate[gte]'];
    if (req.query['registrationDate[lte]']) query.registrationDate.$lte = req.query['registrationDate[lte]'];
  }

  if (req.query.paymentStatusFilter) {
    applyPlotPaymentStatusFilter(query, String(req.query.paymentStatusFilter));
  }

  if (req.query.search?.trim()) {
    const raw = req.query.search.trim();
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchOr = [
      { 'bookedBy.name': { $regex: escaped, $options: 'i' } },
      { 'bookedBy.phone': { $regex: escaped, $options: 'i' } },
      { 'bookedBy.staffDisplayId': { $regex: escaped, $options: 'i' } },
      { assignedToName: { $regex: escaped, $options: 'i' } },
    ];
    if (req.plotLeadSearchIds?.length) {
      searchOr.push({ 'bookedBy.leadId': { $in: req.plotLeadSearchIds } });
      searchOr.push({ 'pendingApproval.leadId': { $in: req.plotLeadSearchIds } });
    }
    if (req.plotLeadSearchPlotIds?.length) {
      searchOr.push({ _id: { $in: req.plotLeadSearchPlotIds } });
    }
    if (req.plotStaffUserIds?.length) {
      searchOr.push({ assignedTo: { $in: req.plotStaffUserIds } });
      searchOr.push({ 'bookedBy.staffId': { $in: req.plotStaffUserIds } });
    }
    if (req.plotStaffDisplayIds?.length) {
      searchOr.push({ 'bookedBy.staffDisplayId': { $in: req.plotStaffDisplayIds } });
    }
    query.$and = query.$and || [];
    query.$and.push({ $or: searchOr });
  }

  const total = await Plot.countDocuments(query);
  const plots = await Plot.find(query)
    .populate({ path: 'projectId', select: 'name location status displayId' })
    .skip(skip).limit(limit).sort(req.query.sort || '-createdAt');

  // Enrich with lead info
  const enrichedPlots = plots.map(plot => {
    const linkedId = plot.bookedBy?.leadId || plot.pendingApproval?.leadId;
    const lead = (linkedId && leadById.get(String(linkedId)))
      || myLeads.find(l => l.plotId && l.plotId.toString() === plot._id.toString())
      || myLeads.find(l => (l.plotIds || []).some((id) => String(id) === String(plot._id)));
    const plotObj = plot.toJSON();
    if (!plotObj.bookedBy && lead) {
      plotObj.bookedBy = {
        name: lead.customerName,
        phone: lead.phone,
        paymentStatus: lead.paymentStatus || 'Not Paid',
      };
    }
    return {
      ...plotObj,
      leadInfo: lead ? { 
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
        assignedToDisplayId: lead.assignedToDisplayId
      } : null,
    };
  });

  const withRelated = await attachRelatedBookings(enrichedPlots);
  const data =
    String(req.query.groupBy || '') === 'customer'
      ? collapsePlotsByCustomer(withRelated)
      : withRelated;

  res.status(200).json({
    success: true,
    count: data.length,
    total,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data,
  });
});

// @desc    Get plot pending approval details
// @route   GET /api/v1/plots/:id/pending-approval
// @access  Private
exports.getPlotPendingApproval = asyncHandler(async (req, res, next) => {
  const plot = await Plot.findById(req.params.id);

  if (!plot) {
    return next(new ErrorResponse(`Plot not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: plot.pendingApproval || null,
  });
});