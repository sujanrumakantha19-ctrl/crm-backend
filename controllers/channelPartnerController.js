const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const ChannelPartner = require('../models/ChannelPartner');

// @desc    Get all channel partners
// @route   GET /api/v1/channel-partners
// @access  Public
exports.getChannelPartners = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single channel partner
// @route   GET /api/v1/channel-partners/:id
// @access  Public
exports.getChannelPartner = asyncHandler(async (req, res, next) => {
  const channelPartner = await ChannelPartner.findById(req.params.id);

  if (!channelPartner) {
    return next(new ErrorResponse(`Channel partner not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: channelPartner,
  });
});

// @desc    Create channel partner
// @route   POST /api/v1/channel-partners
// @access  Private/Admin
exports.createChannelPartner = asyncHandler(async (req, res, next) => {
  const User = require('../models/User');
  const { generateRandomPassword } = require('../utils/passwordGen');

  const name = req.body.name;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : undefined;
  const phone = req.body.phone;
  const initials = req.body.initials
    || (name ? name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'P');

  // ── Build a linked login account (role: partner) ──
  let userId = req.body.userId;
  let emailSent = false;
  let reused = false;

  if (!userId) {
    const password = generateRandomPassword(10);
    try {
      const linkedUser = await User.create({
        name,
        initials,
        role: 'partner',
        email,
        phone,
        isActive: true,
        password,
      });
      userId = linkedUser._id;

      try {
        const { getAccountCredentialsTemplate } = require('../utils/emailTemplates');
        const sendEmail = require('../utils/sendEmail');
        const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
        await sendEmail({
          email,
          subject: `Your Channel Partner Account - ${process.env.FROM_NAME || 'Samy&Co'}`,
          message: getAccountCredentialsTemplate({
            userName: name,
            email,
            password,
            loginUrl,
            roleLabel: 'Channel Partner',
          }),
        });
        emailSent = true;
      } catch (err) {
        const logger = require('../utils/logger');
        logger.error(`Failed to send channel partner credentials email to ${email}: ${err.message}`);
      }
    } catch (err) {
      // Duplicate email → try to reuse the existing partner login account
      if (err.code === 11000 && email) {
        const existing = await User.findOne({ email });
        if (!existing) {
          return next(new ErrorResponse('Could not create the channel partner login account', 500));
        }
        if (existing.role !== 'partner') {
          return next(new ErrorResponse('This email already belongs to a non-partner account', 400));
        }
        userId = existing._id;
        reused = true;

        try {
          const { getAccountCredentialsTemplate } = require('../utils/emailTemplates');
          const sendEmail = require('../utils/sendEmail');
          const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
          await sendEmail({
            email,
            subject: `Your Channel Partner Profile - ${process.env.FROM_NAME || 'Samy&Co'}`,
            message: getAccountCredentialsTemplate({
              userName: name,
              email,
              password: '',
              loginUrl,
              roleLabel: 'Channel Partner',
              linkedExisting: true,
            }),
          });
          emailSent = true;
        } catch (emailErr) {
          const logger = require('../utils/logger');
          logger.error(`Failed to send channel partner linked email to ${email}: ${emailErr.message}`);
        }
      } else {
        return next(err);
      }
    }
  }

  const allowedFields = {
    userId,
    name: req.body.name,
    companyName: req.body.companyName,
    phone: req.body.phone,
    email: req.body.email,
    city: req.body.city,
    reraId: req.body.reraId,
    isActive: req.body.isActive,
    initials: req.body.initials,
    avatarBg: req.body.avatarBg,
    notes: req.body.notes,
    dob: req.body.dob,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  const channelPartner = await ChannelPartner.create(allowedFields);

  res.status(201).json({
    success: true,
    data: channelPartner,
    emailSent,
    reused,
  });
});

// @desc    Update channel partner
// @route   PUT /api/v1/channel-partners/:id
// @access  Private/Admin
exports.updateChannelPartner = asyncHandler(async (req, res, next) => {
  let channelPartner = await ChannelPartner.findById(req.params.id);

  if (!channelPartner) {
    return next(new ErrorResponse(`Channel partner not found with id of ${req.params.id}`, 404));
  }

  const allowedFields = {
    userId: req.body.userId,
    name: req.body.name,
    companyName: req.body.companyName,
    phone: req.body.phone,
    email: req.body.email ? req.body.email.trim().toLowerCase() : undefined,
    city: req.body.city,
    reraId: req.body.reraId,
    totalLeads: req.body.totalLeads,
    isActive: req.body.isActive,
    initials: req.body.initials,
    avatarBg: req.body.avatarBg,
    notes: req.body.notes,
    dob: req.body.dob,
  };

  Object.keys(allowedFields).forEach(key => allowedFields[key] === undefined && delete allowedFields[key]);

  channelPartner = await ChannelPartner.findByIdAndUpdate(req.params.id, allowedFields, {
    returnDocument: 'after',
    runValidators: true,
  });

  // Keep the linked login User in sync (name/phone/email/isActive) so the
  // partner's portal access matches their channel-partner profile.
  if (channelPartner && channelPartner.userId) {
    const User = require('../models/User');
    const syncFields = {};
    if (allowedFields.name !== undefined) syncFields.name = allowedFields.name;
    if (allowedFields.phone !== undefined) syncFields.phone = allowedFields.phone;
    if (allowedFields.email !== undefined) syncFields.email = allowedFields.email;
    if (allowedFields.isActive !== undefined) syncFields.isActive = allowedFields.isActive;

    if (Object.keys(syncFields).length > 0) {
      try {
        await User.findByIdAndUpdate(channelPartner.userId, syncFields, {
          runValidators: true,
        });
      } catch (err) {
        const logger = require('../utils/logger');
        logger.error(`Failed to sync linked user ${channelPartner.userId} on channel partner update: ${err.message}`);
      }
    }
  }

  res.status(200).json({
    success: true,
    data: channelPartner,
  });
});

// @desc    Delete channel partner
// @route   DELETE /api/v1/channel-partners/:id
// @access  Private/Admin
exports.deleteChannelPartner = asyncHandler(async (req, res, next) => {
  const channelPartner = await ChannelPartner.findById(req.params.id);

  if (!channelPartner) {
    return next(new ErrorResponse(`Channel partner not found with id of ${req.params.id}`, 404));
  }

  await channelPartner.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get channel partners by city
// @route   GET /api/v1/channel-partners/city/:city
// @access  Public
exports.getChannelPartnersByCity = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { city: req.params.city };
  const total = await ChannelPartner.countDocuments(query);
  const channelPartners = await ChannelPartner.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: channelPartners.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: channelPartners,
  });
});

// @desc    Get active channel partners
// @route   GET /api/v1/channel-partners/active
// @access  Public
exports.getActiveChannelPartners = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;
  const query = { isActive: true };
  const total = await ChannelPartner.countDocuments(query);
  const channelPartners = await ChannelPartner.find(query).skip(skip).limit(limit).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: channelPartners.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: channelPartners,
  });
});