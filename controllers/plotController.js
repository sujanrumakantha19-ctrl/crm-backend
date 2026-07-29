const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const Plot = require('../models/Plot');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { sendPushToUser } = require('../utils/fcm');

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
  res.status(200).json(res.advancedResults);
});

// @desc    Get single plot
// @route   GET /api/v1/plots/:id
// @access  Public
exports.getPlot = asyncHandler(async (req, res, next) => {
  const plot = await Plot.findById(req.params.id)
    .populate({
      path: 'projectId',
      select: 'name location status',
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
    pendingApproval: req.body.pendingApproval,
    expectedRegistrationDate: req.body.expectedRegistrationDate,
    registrationDate: req.body.registrationDate,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  plot = await Plot.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: plot,
  });
});

// @desc    Book a plot (staff → Pending, admin → Booked)
// @route   PUT /api/v1/plots/:id/book
// @access  Private (staff + admin)
exports.bookPlot = asyncHandler(async (req, res, next) => {
  const isStaffBooking = req.user.role === 'staff';
  const paymentMethod = req.body.paymentMethod || 'CASH';
  const paymentStatus = req.body.paymentStatus || 'Not Paid';

  const update = isStaffBooking
    ? {
        status: 'Pending',
        pendingApproval: {
          leadId: req.body.leadId,
          customerName: req.body.customerName,
          phone: req.body.phone,
          requestedBy: req.user.name,
          requestedAt: new Date().toISOString().split('T')[0],
          paymentStatus,
          paymentMethod,
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
          bank: req.body.bank || '',
          bankFollowerName: req.body.bankFollowerName || '',
          bankFollowerPhone: req.body.bankFollowerPhone || '',
          leadId: req.body.leadId || '',
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

  // ─── Update the Lead with booking info ──────────────────────────────────
  if (req.body.leadId) {
    try {
      const leadUpdate = {
        plotId: plot._id,
        paymentStatus,
        paymentMethod,
      };
      if (!isStaffBooking) {
        leadUpdate.status = 'Customer';
      }
      if (req.body.bank) leadUpdate.bank = req.body.bank;
      if (req.body.bankFollowerName) leadUpdate.bankFollowerName = req.body.bankFollowerName;
      if (req.body.bankFollowerPhone) leadUpdate.bankFollowerPhone = req.body.bankFollowerPhone;

      const lead = await Lead.findByIdAndUpdate(req.body.leadId, leadUpdate, { returnDocument: 'after' });

      if (lead) {
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
        const notif = await Notification.create({
          type: 'booking',
          userId: admin._id,
          entityId: `${plot.projectId}:${plot._id}`,
          entityType: 'Project',
          message: `New booking request for Plot #${plot.plotNumber} in ${projectName} by ${req.user.name}`,
          actorName: req.user.name,
          isToday: true,
          isRead: false
        });
        // Send FCM push to admin's phone
        sendPushToUser(admin._id, {
          title: '📋 New Booking Request',
          body: `Plot #${plot.plotNumber} in ${projectName} by ${req.user.name}`,
          data: { notificationId: notif._id.toString(), type: 'booking', entityType: 'Project', entityId: `${plot.projectId}:${plot._id}` },
        }).catch(e => console.error('FCM push error (booking):', e.message));
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

  const approval = plot.pendingApproval;
  const isCancellation = approval.requestType === 'cancellation';

  if (isCancellation) {
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

    // Revert associated Lead if any
    try {
      const lead = await Lead.findOne({ plotId: plot._id });
      if (lead) {
        lead.plotId = undefined;
        if (lead.status === 'Customer' || lead.status === 'Reserved') {
          lead.status = 'Qualified';
        }
        await lead.save();
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
    bank: approval.bank || '',
    bankFollowerName: approval.bankFollowerName || '',
    bankFollowerPhone: approval.bankFollowerPhone || '',
    leadId: approval.leadId || '',
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
    const targetLeadId = approval.leadId;
    let lead = null;
    if (targetLeadId && mongoose.Types.ObjectId.isValid(targetLeadId)) {
      lead = await Lead.findById(targetLeadId);
    }
    if (!lead && plot._id) {
      lead = await Lead.findOne({ plotId: plot._id });
    }
    if (!lead && approval.phone) {
      lead = await Lead.findOne({ phone: approval.phone });
    }

    if (lead) {
      lead.status = 'Customer';
      lead.plotId = plot._id;
      lead.paymentStatus = approval.paymentStatus || 'Not Paid';
      lead.paymentMethod = paymentMethod;
      await lead.save();

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
    const requestedByUserId = plot.pendingApproval?.requestedBy || approval?.requestedBy;
    if (requestedByUserId) {
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
      sendPushToUser(requestedByUserId, {
        title: '✅ Booking Approved!',
        body: `Plot #${plot.plotNumber} booking has been approved`,
        data: { notificationId: staffNotif._id.toString(), type: 'booking', entityType: 'Project', entityId: `${plot.projectId}:${plot._id}` },
      }).catch(e => console.error('FCM push error (approve->staff):', e.message));
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

    return res.status(200).json({ success: true, data: plot });
  }

  const targetLeadId = plot.pendingApproval?.leadId;
  const customerPhone = plot.pendingApproval?.phone;

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

  // ─── Revert Lead status ─────────────────────────────────────────
  try {
    let lead = null;
    if (targetLeadId && mongoose.Types.ObjectId.isValid(targetLeadId)) {
      lead = await Lead.findById(targetLeadId);
    }
    if (!lead && plot._id) {
      lead = await Lead.findOne({ plotId: plot._id });
    }
    if (!lead && customerPhone) {
      lead = await Lead.findOne({ phone: customerPhone });
    }

    if (lead) {
      // If already a Customer (e.g. bought in another project), retain Customer status
      if (lead.status !== 'Customer') {
        lead.status = 'Unqualified';
      }
      if (lead.plotId && String(lead.plotId) === String(plot._id)) {
        lead.plotId = null;
      }
      await lead.save();

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
    const requestedByUserId = plot.pendingApproval?.requestedBy;
    if (requestedByUserId) {
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
      sendPushToUser(requestedByUserId, {
        title: '❌ Booking Rejected',
        body: `Plot #${plot.plotNumber} booking request was rejected`,
        data: { notificationId: staffNotif._id.toString(), type: 'booking', entityType: 'Project', entityId: `${plot.projectId}:${plot._id}` },
      }).catch(e => console.error('FCM push error (reject->staff):', e.message));
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

  const registrationDate = req.body.registrationDate || new Date().toISOString().split('T')[0];
  plot.status = 'Registered';
  plot.registrationDate = registrationDate;
  if (req.body.paymentStatus) {
    plot.bookedBy = { ...(plot.bookedBy || {}), paymentStatus: req.body.paymentStatus };
  }
  await plot.save();

  // ─── Update the associated Lead ─────────────────────────────────────────
  try {
    const lead = await Lead.findOne({ plotId: plot._id });
    if (lead) {
      const leadUpdate = { paymentStatus: req.body.paymentStatus || 'Fully Paid' };
      if (req.body.registrationDate) {
        leadUpdate.followUps = [
          ...(lead.followUps || []),
          {
            id: `reg-${Date.now()}`,
            date: registrationDate,
            notes: `Plot #${plot.plotNumber} registered`,
            outcome: 'Registered',
            nextAction: '',
          },
        ];
      }
      await Lead.findByIdAndUpdate(lead._id, leadUpdate);

      await logActivity({
        actor: req.user,
        actionType: 'Status Change',
        action: `Registered Plot #${plot.plotNumber} for ${lead.customerName}`,
        entityType: 'Plot',
        entityId: plot._id,
        entityName: `Plot #${plot.plotNumber}`,
        ipAddress: req.ip,
      });
    }
  } catch (leadErr) {
    console.error('Failed to update lead on registration:', leadErr.message);
  }

  res.status(200).json({ success: true, data: plot });
});

// @desc    Cancel a plot booking (or submit cancellation request if staff)
// @route   PUT /api/v1/plots/:id/cancel
// @access  Private
exports.cancelBooking = asyncHandler(async (req, res, next) => {
  let plot = await Plot.findById(req.params.id);

  if (!plot) return next(new ErrorResponse('Plot not found', 404));

  if (plot.status !== 'Booked' && plot.status !== 'Pending') {
    return next(new ErrorResponse('Only Booked or Pending plots can be canceled', 400));
  }

  const isStaffCancel = req.user.role === 'staff';

  if (isStaffCancel) {
    // If staff requests cancellation, submit as Pending Cancellation Approval
    plot.status = 'Pending';
    plot.pendingApproval = {
      requestType: 'cancellation',
      leadId: plot.pendingApproval?.leadId,
      customerName: plot.bookedBy?.name || plot.pendingApproval?.customerName,
      phone: plot.bookedBy?.phone || plot.pendingApproval?.phone,
      requestedBy: req.user.name,
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
        const notif = await Notification.create({
          type: 'booking',
          userId: admin._id,
          entityId: `${plot.projectId}:${plot._id}`,
          entityType: 'Project',
          message: `New cancellation request for Plot #${plot.plotNumber} in ${projectName} by ${req.user.name}`,
          actorName: req.user.name,
          isToday: true,
          isRead: false
        });
        // Send FCM push to admin's phone
        sendPushToUser(admin._id, {
          title: '❌ Cancellation Request',
          body: `Plot #${plot.plotNumber} in ${projectName} by ${req.user.name}`,
          data: { notificationId: notif._id.toString(), type: 'booking', entityType: 'Project', entityId: `${plot.projectId}:${plot._id}` },
        }).catch(e => console.error('FCM push error (cancellation):', e.message));
      }
    } catch (notifErr) {
      console.error('Failed to create cancellation notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: plot });
  }

  // Admin direct cancellation
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

  // Revert associated Lead if any
  try {
    const lead = await Lead.findOne({ plotId: plot._id });
    if (lead) {
      lead.plotId = undefined;
      if (lead.status === 'Customer' || lead.status === 'Reserved') {
        lead.status = 'Qualified';
      }
      await lead.save();

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
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;
  const query = { projectId: req.params.projectId };
  const total = await Plot.countDocuments(query);
  const plots = await Plot.find(query).skip(skip).limit(limit).sort('plotNumber');

  res.status(200).json({
    success: true,
    count: plots.length,
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

  // Find all leads assigned to this staff that have a plotId
  const myLeads = await Lead.find({
    assignedTo: req.user.id,
    plotId: { $exists: true, $ne: null },
  }).select('plotId customerName phone status');

  const plotIds = myLeads.map(l => l.plotId);

  // Build query
  let query = { _id: { $in: plotIds } };

  // Optional status filter
  if (req.query.status) {
    query.status = req.query.status;
  }

  // Optional projectId filter
  if (req.query.projectId) {
    query.projectId = req.query.projectId;
  }

  const total = await Plot.countDocuments(query);
  const plots = await Plot.find(query)
    .populate({ path: 'projectId', select: 'name location status' })
    .skip(skip).limit(limit).sort('-createdAt');

  // Enrich with lead info
  const enrichedPlots = plots.map(plot => {
    const lead = myLeads.find(l => l.plotId && l.plotId.toString() === plot._id.toString());
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
      leadInfo: lead ? { customerName: lead.customerName, phone: lead.phone, status: lead.status } : null,
    };
  });

  res.status(200).json({
    success: true,
    count: enrichedPlots.length,
    total,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: enrichedPlots,
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